import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../db.ts";

const KEY_FILE = join(DATA_DIR, "kimi-key.txt");

/** 优先读环境变量，其次读 data/kimi-key.txt（该文件不入库） */
export function kimiKey(): string | null {
  const env = process.env.LIFE_KIMI_API_KEY?.trim();
  if (env) return env;
  try {
    if (existsSync(KEY_FILE)) {
      const v = readFileSync(KEY_FILE, "utf8").trim();
      if (v) return v;
    }
  } catch {
    /* ignore */
  }
  return null;
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
  const list = Array.isArray(obj) ? obj : Array.isArray((obj as { courses?: unknown }).courses) ? (obj as { courses: unknown[] }).courses : [];
  return (list as ParsedCourse[]).filter((c) => c && typeof c === "object");
}

export async function parseTimetableImage(base64: string, mime: string): Promise<ParsedCourse[]> {
  const key = kimiKey();
  if (!key) throw new Error("NOKEY");

  const res = await fetch(`${process.env.LIFE_KIMI_BASE ?? "https://api.moonshot.cn/v1"}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: process.env.LIFE_KIMI_MODEL ?? "kimi-latest",
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
    throw new Error(`Kimi ${res.status}: ${text.slice(0, 180)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  return extractCourses(content);
}
