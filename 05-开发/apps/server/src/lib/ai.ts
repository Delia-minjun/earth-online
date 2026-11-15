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

async function chatOnce(cfg: AiConfig, messages: Msg[], temperature = 0): Promise<string> {
  const res = await fetch(`${cfg.base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(120_000),
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
): Promise<GeneratedCard[]> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");
  const prompt = mode === "questions" ? QUESTIONS_PROMPT : KNOWLEDGE_PROMPT;
  const raw = await chatOnce(cfg, [{ role: "user", content: prompt(subject, count, text) }], 0.2);

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
): Promise<string> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");
  const where = chapter ? `第 ${chapter} 章` : "本次上传的内容";
  const prompt = `你在为「${subject}」的${where}写一份可直接阅读的复习讲义，面向本人。

要求：
- 按知识点逐条讲解，每条给出：是什么、为什么/关键性质、必要时给公式或判断方法、一个具体例子
- 只使用下面资料里出现的内容；资料没讲到的不要补，不确定的地方明确写「资料未涉及」
- 最后单独一节「易错点」，列出容易混淆或容易做错的 3–6 条，每条说明错在哪、怎么避免
- 用 Markdown：二级标题分节，列表用 -，公式用行内代码或纯文本，不要用代码块包裹整篇
- 不要出题、不要写问答、不要写客套话或总结段落

资料正文：
"""
${text.slice(0, 20000)}
"""`;
  return (await chatOnce(cfg, [{ role: "user", content: prompt }], 0.3)).trim();
}
