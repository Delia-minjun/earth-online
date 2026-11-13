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

const CARD_PROMPT = (subject: string, count: number, text: string) => `你是背书卡片生成器。基于下面这份「${subject}」的学习资料，生成 ${count} 张问答卡片，只输出 JSON：

{"cards":[{"front":"问题（简短、可自测）","back":"答案（要点式，别超过 80 字）","ref":"出处提示，如 第3段 / 公式2"}]}

规则：
- 只根据资料内容出题，不要引入资料里没有的知识；资料没讲到的不要编
- 一个问题只考一个点；答案要能独立看懂
- 优先考概念、定义、公式、易混点，不要出「这段讲了什么」这种空泛题
- 中文出题；若资料是英文，问题与答案都用英文

资料正文：
""" 
${text.slice(0, 12000)}
"""`;

/** 从资料正文生成背记卡片 */
export async function generateCards(
  text: string,
  subject: string,
  count = 8,
): Promise<GeneratedCard[]> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey) throw new Error("NOKEY");
  const raw = await chatOnce(cfg, [{ role: "user", content: CARD_PROMPT(subject, count, text) }], 0.2);

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