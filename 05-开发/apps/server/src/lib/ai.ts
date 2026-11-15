import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../db.ts";
import { getSetting } from "./settings.ts";

const KEY_FILES = [join(DATA_DIR, "ai-key.txt"), join(DATA_DIR, "kimi-key.txt")];

export interface AiConfig {
  apiKey: string;
  model: string;
  base: string;
  /** key 是从哪来的：env / db / file */
  source: "env" | "db" | "file" | "none";
}

interface StoredAi {
  apiKey?: string;
  model?: string;
  base?: string;
}

// DeepSeek 的 OpenAI 兼容端点是 https://api.deepseek.com（不需要 /v1，加了也兼容）
const DEFAULT_BASE = "https://api.deepseek.com";
// deepseek-flash 支持图片输入；老的 deepseek-chat 已退役并按其服务
const DEFAULT_MODEL = "deepseek-flash";

function fileKey(): string {
  for (const f of KEY_FILES) {
    try {
      if (existsSync(f)) {
        const v = readFileSync(f, "utf8").trim();
        if (v) return v;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

/** 优先级：环境变量 → 数据库设置 → data/ai-key.txt（兼容旧的 kimi-key.txt） */
export function resolveAiConfig(): AiConfig {
  const stored = getSetting<StoredAi>("ai", {});
  const envKey =
    process.env.LIFE_AI_API_KEY?.trim() ||
    process.env.LIFE_KIMI_API_KEY?.trim() ||
    "";
  const dbKey = (stored.apiKey ?? "").trim();
  const fKey = fileKey();

  const apiKey = envKey || dbKey || fKey;
  const source: AiConfig["source"] = envKey ? "env" : dbKey ? "db" : fKey ? "file" : "none";

  return {
    apiKey,
    source,
    model: stored.model?.trim() || process.env.LIFE_AI_MODEL?.trim() || DEFAULT_MODEL,
    base: stored.base?.trim() || process.env.LIFE_AI_BASE?.trim() || DEFAULT_BASE,
  };
}

export interface ParsedCourse {
  name?: string;
  weekday?: number;
  startPeriod?: number;
  endPeriod?: number;
  startTime?: string;
  endTime?: string;
  location?: string;
  weekType?: string;
  weekStart?: number;
  weekEnd?: number;
}

const PROMPT = `你是课表识别器。请从这张课表截图里提取所有课程，只输出 JSON，不要 markdown 代码块，不要解释。

格式：
{"courses":[{"name":"课程名","weekday":1,"startPeriod":1,"endPeriod":2,"startTime":"","endTime":"","location":"教室","weekType":"all","weekStart":null,"weekEnd":null}]}

规则：
- weekday 用 1-7 表示周一到周日
- 图上写「第3-4节」这类节次，就填 startPeriod/endPeriod，startTime/endTime 留空字符串
- 图上写具体时间，就填 startTime/endTime（HH:MM 24 小时制），节次留空
- weekType 取值：all（每周）、odd（单周）、even（双周）、range（指定周次范围）
- 图上写「1-8周」「9-16周」这种，weekType 填 range，weekStart/weekEnd 填数字
- 图上写「单周」「双周」「1-15周单周」这类，weekType 填 odd 或 even，weekStart/weekEnd 能看出范围就填
- 一个格子里有多门课就输出多条
- 地点认不出就留空
- 认不出的字段一律留空（weekType 认不出填 all），宁可少填也不要编造`;

function extractCourses(text: string): ParsedCourse[] {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const body = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("模型返回的不是合法 JSON");
  }
  const obj = parsed as { courses?: unknown } | unknown[];
  const list = Array.isArray(obj)
    ? obj
    : Array.isArray((obj as { courses?: unknown }).courses)
      ? (obj as { courses: unknown[] }).courses
      : [];
  return (list as ParsedCourse[]).filter((c) => c && typeof c === "object");
}

export async function parseTimetableImage(base64: string, mime: string): Promise<ParsedCourse[]> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");

  const res = await fetch(`${cfg.base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    // 把「模型不支持图片」翻译成人话
    if (/image|vision|multimodal|unsupported/i.test(text) && res.status >= 400 && res.status < 500) {
      throw new Error("VISION_UNSUPPORTED");
    }
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  return extractCourses(content);
}

/** 用 /models 探活，不消耗生成额度 */export async function testAiConfig(cfg: AiConfig): Promise<{ ok: boolean; detail: string }> {
  if (!cfg.apiKey) return { ok: false, detail: "NOKEY" };
  try {
    const res = await fetch(`${cfg.base.replace(/\/$/, "")}/models`, {
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return { ok: true, detail: "ok" };
    return { ok: false, detail: `${res.status} ${(await res.text()).slice(0, 120)}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

/** 名字里带这些的，基本都能读图 */
const VISION_HINTS =
  /(vision|multimodal|omni|vl\b|vlm|gpt-4o|gpt-4\.1|gpt-5|claude-3|gemini|deepseek-flash)/i;

export function looksVisionCapable(model: string): boolean {
  return VISION_HINTS.test(model);
}

/** 列出账号下可用模型，并标出哪些大概率能读图 */
export async function listModels(
  cfg: AiConfig,
): Promise<{ ok: boolean; models: string[]; vision: string[]; detail: string }> {
  if (!cfg.apiKey) return { ok: false, models: [], vision: [], detail: "NOKEY" };
  try {
    const res = await fetch(`${cfg.base.replace(/\/$/, "")}/models`, {
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return {
        ok: false,
        models: [],
        vision: [],
        detail: `${res.status} ${(await res.text()).slice(0, 120)}`,
      };
    }
    const data = (await res.json()) as { data?: { id?: string }[] };
    const models = (data.data ?? []).map((m) => m.id ?? "").filter(Boolean).sort();
    return { ok: true, models, vision: models.filter(looksVisionCapable), detail: "ok" };
  } catch (e) {
    return { ok: false, models: [], vision: [], detail: (e as Error).message };
  }
}

/* ---------------- 学习 Agent：OCR 与出卡片 ---------------- */

type Msg = { role: "user"; content: unknown };

async function chatOnce(
  cfg: AiConfig,
  messages: Msg[],
  temperature = 0,
  timeoutMs = 120_000,
): Promise<string> {
  const res = await fetch(`${cfg.base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model: cfg.model, temperature, messages }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (/image|vision|multimodal|unsupported/i.test(text) && res.status >= 400 && res.status < 500) {
      throw new Error("VISION_UNSUPPORTED");
    }
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

/** 把图片里的文字原样转录出来（用于扫描件/截图） */
export async function ocrImage(base64: string, mime: string): Promise<string> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");
  const content = await chatOnce(cfg, [
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
        {
          type: "text",
          text: "把这张图里的文字全部转录出来，保持原有段落与顺序。不要总结、不要解释、不要加 markdown。认不出的字用 ？ 代替。",
        },
      ],
    },
  ]);
  return content.trim();
}

export interface GeneratedCard {
  front: string;
  back: string;
  ref?: string;
}

export type CardMode = "knowledge" | "questions";

const KNOWLEDGE_PROMPT = (subject: string, count: number, text: string) => `你是知识点卡片生成器。基于下面这份「${subject}」的资料，生成 ${count} 张「知识点总结 + 详解」卡片，只输出 JSON：

{"cards":[{"front":"知识点（一句话概括，可自测）","back":"详解：定义、关键性质、适用条件、易错点，必要时给公式","ref":"出处，如 第3页 / 第2段"}]}

规则：
- 只根据资料内容，不要引入资料里没有的知识
- 一张卡片聚焦一个知识点；详解要能独立看懂
- 必须覆盖资料里的所有知识点，不得遗漏
- 优先覆盖核心概念、公式、方法、易混点，不要出「这段讲了什么」这种空泛卡片
- 资料有 OCR 噪声时跳过读不懂的部分
- 中文出题；若资料是英文，问题与答案都用英文

资料正文：
"""
${text.slice(0, 12000)}
"""`;

const QUESTIONS_PROMPT = (subject: string, count: number, text: string) => `你是出题器。下面是一份「${subject}」的题目资料（quiz / 作业 / 往年题）。请参考它们的题型、难度与考点分布，出 ${count} 道新题，只输出 JSON：

{"cards":[{"front":"题干（含选项，若有）","back":"答案 + 解析（说明为什么，必要时指出考点）","ref":"参考的题型·难度，如 选择题·中等"}]}

规则：
- 模仿资料里的题型与难度，但不要照抄原题，要出新题
- **必须覆盖资料里出现的所有知识点与题型，一个考点都不能遗漏**；给出的题量是下限，覆盖不全就继续出题
- 选择题必须把题干和每个选项写成不同行：题干一行，然后 A. …、B. …、C. …、D. … 各占一行
- 答案必须能确定；资料不足以判断时换一个题目
- 覆盖资料中出现的题型（选择、填空、判断、简答、计算等）
- 中文出题；若资料是英文，题目与答案都用英文

题目资料：
"""
${text.slice(0, 12000)}
"""`;

/** 从资料正文生成背记卡片 */
export async function generateCards(
  text: string,
  subject: string,
  count = 8,
  mode: CardMode = "knowledge",
  extra?: string,
): Promise<GeneratedCard[]> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");
  const prompt = mode === "questions" ? QUESTIONS_PROMPT : KNOWLEDGE_PROMPT;
  const base = prompt(subject, count, text);
  const raw = await chatOnce(
    cfg,
    [{ role: "user", content: extra ? `${base}\n\n本次额外要求（优先满足）：${extra}` : base }],
    0.2,
    300_000,
  );

  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const body = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("模型返回的不是合法 JSON");
  }
  const list = (parsed as { cards?: unknown }).cards;
  if (!Array.isArray(list)) throw new Error("模型没有返回 cards 数组");
  return (list as GeneratedCard[])
    .filter((c) => c && typeof c.front === "string" && typeof c.back === "string")
    .map((c) => ({
      front: String(c.front).trim(),
      back: String(c.back).trim(),
      ref: c.ref ? String(c.ref).trim() : undefined,
    }))
    .filter((c) => c.front && c.back);
}

/** 判一次作答：指出对的、错的、下一步怎么练 */
export interface AnswerFeedback {
  good: string;
  wrong: string;
  next: string;
  verdict: "right" | "partial" | "wrong";
}

export async function reviewAnswer(
  front: string,
  back: string,
  answer: string,
): Promise<AnswerFeedback> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");
  const prompt = `你在批改一道自测题的作答。只输出 JSON：

{"verdict":"right|partial|wrong","good":"作答里做对的部分（没有就写 未涉及）","wrong":"具体的错误或遗漏，指出是哪一步/哪个概念","next":"下一步怎么练：一个更小的练习或换个角度的变式，一句话"}

规则：
- 只依据给定参考答案判断，不要引入外部知识；参考答案本身可疑时在 wrong 里指出
- 不要给分数，不要客套；指出具体位置，而不是笼统说"不完整"
- 作答与答案意思一致但表述不同，算 right

题目：${front}

参考答案：${back}

学习者作答：${answer.slice(0, 3000)}`;

  const raw = await chatOnce(cfg, [{ role: "user", content: prompt }], 0.2);
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const body = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const parsed = JSON.parse(body) as Partial<AnswerFeedback>;
  const verdict =
    parsed.verdict === "right" || parsed.verdict === "partial" || parsed.verdict === "wrong"
      ? parsed.verdict
      : "partial";
  return {
    verdict,
    good: String(parsed.good ?? "").trim(),
    wrong: String(parsed.wrong ?? "").trim(),
    next: String(parsed.next ?? "").trim(),
  };
}


/** 把一章资料整理成「讲解 + 易错点」的可读讲义（不是问答卡） */
export async function explainChapter(
  subject: string,
  chapter: string | null,
  text: string,
  extra?: string,
): Promise<string> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");
  const where = chapter ? `第 ${chapter} 章` : "本次上传的内容";
  const prompt = `你在为「${subject}」的${where}写一份复习讲义，读者是要快速扫读的人。

严格按下面的骨架输出，不要加别的东西：

# ${where} · 复习讲义

## 一、知识点

### 1. <知识点名称，8 字以内>
- 是什么：<一句话，30 字以内>
- 关键点：<一条性质/公式/判断方法，30 字以内；有多条就分多行，每行一个>
- 例子：<具体数字或情境，30 字以内>

### 2. <下一个知识点>
…

## 二、易错点

### 1. <易错点名称，8 字以内>
- 错在哪：<20 字以内>
- 怎么避免：<20 字以内>

### 2. …

硬性要求：
- 每个知识点必须分「是什么 / 关键点 / 例子」三段，**每段一行、不超过 30 字**；写长了就是不合格
- 完整比简洁更重要：为了覆盖全部知识点，可以增加节数，但不能合并掉细节
- **必须覆盖资料里的所有知识点，一个都不能遗漏**；宁可多写几节，也不能漏
- 资料中出现的每个定义、公式、性质、方法、判断规则都要有对应的知识点
- 知识点的定义、公式、性质必须以资料为准，不得改写或添加资料里没有的结论
- **但例子要自己补**：资料给了具体数值就用资料的；资料没给数值、或只讲了抽象定义时，自己构造一个符合原理的具体例子（带数字最好），不要写「资料未涉及」
- 不要出题、不要写总结段、不要客套话

资料正文：
"""
${text.slice(0, 20000)}
"""`;
  const withExtra = extra
    ? `${prompt}

本次额外要求（优先满足，但不允许违反上面的覆盖与出处规则）：${extra}`
    : prompt;
  return (await chatOnce(cfg, [{ role: "user", content: withExtra }], 0.2, 300_000)).trim();
}


/** 重出其中一道题：难度不低于原题，且不能与原题重复 */
export async function regenerateQuestion(
  subject: string,
  text: string,
  oldQuestion: string,
  oldAnswer: string,
): Promise<{ q: string; a: string; ref: string | null }> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");
  const prompt = `你在为「${subject}」出一道新的练习题，用来替换下面这道旧题。

要求的输出（JSON）：
{"q":"题干；如果是选择题，选项 A. … B. … 各占一行","a":"答案 + 解析（说清为什么）","ref":"题型·难度"}

规则：
- 考点与旧题相同，但情境/数据/问法必须不同，不能重复旧题
- **难度不低于旧题**，优先出更进一步的变式（多一步推理、换一个条件、合并两个考点）
- 只用下面资料里出现的内容，不要引入资料外的知识
- 中文出题；资料是英文则用英文

旧题：${oldQuestion.slice(0, 800)}
旧题答案：${oldAnswer.slice(0, 800)}

资料正文：
"""
${text.slice(0, 12000)}
"""`;
  const raw = await chatOnce(cfg, [{ role: "user", content: prompt }], 0.4);
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const parsed = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned) as {
    q?: string;
    a?: string;
    ref?: string;
  };
  if (!parsed.q || !parsed.a) throw new Error("模型没有返回完整的题目");
  return { q: String(parsed.q).trim(), a: String(parsed.a).trim(), ref: parsed.ref ?? null };
}

/** 重写讲解里的某一节（保留其余内容） */
export async function rewriteSection(
  subject: string,
  chapter: string | null,
  text: string,
  heading: string,
  body: string,
): Promise<string> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");
  const where = chapter ? `第 ${chapter} 章` : "本内容";
  const prompt = `你在改写「${subject}」${where}讲义里的其中一节。只重写这一节，不要输出其它节。

当前小节标题：${heading}
当前内容：
${body.slice(0, 2000)}

要求：
- 保持同样的标题（以「### 」开头）
- 继续用「- 是什么 / - 关键点 / - 例子」三行结构，每行不超过 30 字
- 把原来讲得含糊、跳过推导或缺少例子的问题补上；有公式就写公式
- 定义与公式以资料为准；例子如果资料里没有具体数值，自己补一个符合原理的具体例子，不要写「资料未涉及」
- 只输出这一节的 Markdown（标题 + 三行），不要解释、不要代码块

资料正文：
"""
${text.slice(0, 14000)}
"""`;
  const out = (await chatOnce(cfg, [{ role: "user", content: prompt }], 0.35)).trim();
  return out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
}


/** 把用户的自然语言要求，变成「对哪一章做什么」 */
export interface InstructionPlan {
  action: "note" | "practice" | "both" | "none";
  chapter: string | null;
  message: string;
}

export async function planInstruction(
  subject: string,
  chapters: string[],
  request: string,
): Promise<InstructionPlan> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");
  const prompt = `你是学习页的操作规划器。用户对一个科目提出了修改要求，你需要判断该做什么。

科目：${subject}
已有章节：${chapters.length ? chapters.join("、") : "（无）"}

用户要求：${request}

只输出 JSON：
{"action":"note|practice|both|none","chapter":"章节号或 null","message":"一句话回应用户"}

判断规则：
- 提到"讲解/知识点/易错点/讲得浅/讲错"→ note
- 提到"题/练习/太难/太简单/多出几道"→ practice
- 两者都提到 → both
- 与学习内容无关或无法执行 → none，并在 message 里说明
- chapter 取用户明确提到的章节号（如"第3章"→"3"）；没提就填 null（表示当前章）`;
  const raw = await chatOnce(cfg, [{ role: "user", content: prompt }], 0);
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  const parsed = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned) as Partial<InstructionPlan>;
  const action =
    parsed.action === "note" || parsed.action === "practice" || parsed.action === "both" || parsed.action === "none"
      ? parsed.action
      : "none";
  return {
    action,
    chapter: parsed.chapter ? String(parsed.chapter) : null,
    message: String(parsed.message ?? "").trim(),
  };
}


/** 局部修改：只改用户点到的地方，其余原样保留 */
export interface AppliedEdit {
  target: "note" | "practice";
  heading?: string;
  append?: boolean;
  content?: string;
  index?: number;
  q?: string;
  a?: string;
  ref?: string | null;
}

export interface PatchResult {
  edits: AppliedEdit[];
  message: string;
}

export async function planPatch(
  subject: string,
  chapter: string | null,
  noteText: string,
  practiceJson: string,
  request: string,
): Promise<PatchResult> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");
  const where = chapter ? `第 ${chapter} 章` : "本内容";
  const prompt = `你是「${subject}」${where}学习内容的编辑器。用户提出修改要求，你只改动与要求直接相关的部分，其余内容必须原样保留。

当前讲解（Markdown，每节以「### 」开头）：
"""
${noteText.slice(0, 8000)}
"""

当前练习题（JSON 数组，index 从 0 开始）：
"""
${practiceJson.slice(0, 6000)}
"""

用户要求：${request}

只输出 JSON：
{"edits":[
 {"target":"note","heading":"### 2. 有效数字规则","content":"### 2. 有效数字规则\n- 是什么：…\n- 关键点：…\n- 例子：…"},
 {"target":"note","append":true,"content":"### 47. 新知识点\n- 是什么：…"},
 {"target":"practice","index":2,"q":"新的题干","a":"答案 + 解析"},
 {"target":"practice","append":true,"q":"新题","a":"答案 + 解析","ref":"选择题·中等"}
],"message":"一句话说明改了什么"}

规则：
- 只返回需要改的条目；没被提到的节和题一律不要出现
- heading 必须是上面已存在的完整标题行（含「### 」前缀）
- 新增知识点用 append，content 必须是完整的一节（含标题行）
- 改写小节时保留「- 是什么 / - 关键点 / - 例子」结构，每行不超过 30 字
- 定义与公式以资料为准；例子可以自己构造具体数值，遇到资料没给例子的地方必须补一个
- 若用户要求整体重写，才返回所有条目`;
  const raw = await chatOnce(cfg, [{ role: "user", content: prompt }], 0.2, 240_000);
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  const parsed = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned) as {
    edits?: AppliedEdit[];
    message?: string;
  };
  if (!Array.isArray(parsed.edits)) throw new Error("模型没有返回 edits");
  return { edits: parsed.edits, message: String(parsed.message ?? "").trim() };
}
