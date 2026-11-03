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

const DEFAULT_BASE = "https://api.deepseek.com/v1";
const DEFAULT_MODEL = "deepseek-chat";

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
}

const PROMPT = `你是课表识别器。请从这张课表截图里提取所有课程，只输出 JSON，不要 markdown 代码块，不要解释。

格式：
{"courses":[{"name":"课程名","weekday":1,"startPeriod":1,"endPeriod":2,"startTime":"","endTime":"","location":"教室"}]}

规则：
- weekday 用 1-7 表示周一到周日
- 图上写「第3-4节」这类节次，就填 startPeriod/endPeriod，startTime/endTime 留空字符串
- 图上写具体时间，就填 startTime/endTime（HH:MM 24 小时制），节次留空
- 一个格子里有多门课就输出多条
- 地点认不出就留空
- 认不出的字段一律留空，宁可少填也不要编造`;

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
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  return extractCourses(content);
}

/** 用 /models 探活，不消耗生成额度 */
export async function testAiConfig(cfg: AiConfig): Promise<{ ok: boolean; detail: string }> {
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

/** 列出账号下可用模型，顺便帮用户挑带视觉的那个 */
export async function listModels(
  cfg: AiConfig,
): Promise<{ ok: boolean; models: string[]; detail: string }> {
  if (!cfg.apiKey) return { ok: false, models: [], detail: "NOKEY" };
  try {
    const res = await fetch(`${cfg.base.replace(/\/$/, "")}/models`, {
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { ok: false, models: [], detail: `${res.status} ${(await res.text()).slice(0, 120)}` };
    }
    const data = (await res.json()) as { data?: { id?: string }[] };
    const models = (data.data ?? []).map((m) => m.id ?? "").filter(Boolean).sort();
    return { ok: true, models, detail: "ok" };
  } catch (e) {
    return { ok: false, models: [], detail: (e as Error).message };
  }
}
