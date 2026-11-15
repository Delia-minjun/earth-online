import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db.ts";
import { explainChapter, generateCards, planInstruction } from "../lib/ai.ts";

export const p7 = new Hono();

async function readBody<T extends z.ZodTypeAny>(c: { req: { json: () => Promise<unknown> } }, schema: T) {
  try {
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "bad body" };
    return { ok: true as const, data: parsed.data as z.infer<T> };
  } catch {
    return { ok: false as const, error: "invalid json" };
  }
}

const uid = () => crypto.randomUUID();

/**
 * 用一句话指挥学习内容：
 * 用户写「第 3 章讲得太浅，多补例子」→ 规划器决定改讲解还是出题，
 * 再把这句要求塞进生成提示词，重写对应内容。
 */

/** 本地关键词判断，省掉一次规划调用；判断不了再交给模型 */
function localPlan(request: string): { action: "note" | "practice" | "both"; chapter: string | null } | null {
  const wantsPractice = /(题|练习|刷题|quiz|考试|做题|选择题|计算题)/i.test(request);
  const wantsNote = /(讲解|知识点|讲义|易错|讲得|讲浅|讲深|补充|例子|总结|梳理)/i.test(request);
  if (!wantsNote && !wantsPractice) return null;

  const chapter =
    request.match(/第\s*([0-9]+(?:\s*-\s*[0-9]+)?)\s*章/)?.[1]?.replace(/\s+/g, "-") ??
    request.match(/\bch(?:apter)?\s*([0-9]+)/i)?.[1] ??
    request.match(/\bL\s*([0-9]+)/i)?.[1] === undefined
      ? (request.match(/第\s*([0-9]+(?:\s*-\s*[0-9]+)?)\s*章/)?.[1]?.replace(/\s+/g, "-") ??
        request.match(/\bch(?:apter)?\s*([0-9]+)/i)?.[1] ??
        null)
      : `L${request.match(/\bL\s*([0-9]+)/i)![1]}`;

  const action = wantsNote && wantsPractice ? "both" : wantsNote ? "note" : "practice";
  return { action, chapter };
}

p7.post("/study/instruct", async (c) => {
  const r = await readBody(
    c,
    z.object({
      subjectId: z.string(),
      request: z.string().trim().min(1).max(500),
      /** 没说章节时用当前正在看的章节 */
      chapter: z.string().trim().max(20).nullable().optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const subject = db.prepare("SELECT name FROM subject WHERE id = ?").get(r.data.subjectId) as
    | { name: string }
    | undefined;
  if (!subject) return c.json({ error: "not_found" }, 404);

  const chapters = (
    db
      .prepare(
        `SELECT DISTINCT chapter FROM material
          WHERE subject_id = ? AND chapter IS NOT NULL AND deleted_at IS NULL ORDER BY chapter`,
      )
      .all(r.data.subjectId) as { chapter: string }[]
  ).map((x) => x.chapter);

  // 先用关键词判断，省一次模型调用；判断不了再问模型
  const quick = localPlan(r.data.request);
  let plan: { action: "note" | "practice" | "both" | "none"; chapter: string | null; message: string };
  if (quick) {
    plan = { ...quick, message: "" };
  } else {
    try {
      plan = await planInstruction(subject.name, chapters, r.data.request);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "NOKEY") return c.json({ error: "NOKEY" }, 400);
      return c.json({ error: `规划失败：${msg}` }, 502);
    }
  }

  if (plan.action === "none") {
    return c.json({ action: "none", message: plan.message || "没看懂要改什么，换个说法试试" });
  }

  const chapter = plan.chapter ?? r.data.chapter ?? null;
  const done: string[] = [];

  const loadMats = (role: "knowledge" | "questions") =>
    (
      chapter === null
        ? db
            .prepare(
              `SELECT title, content FROM material
                WHERE subject_id = ? AND role = ? AND chapter IS NULL
                  AND deleted_at IS NULL AND content != '' ORDER BY created_at`,
            )
            .all(r.data.subjectId, role)
        : db
            .prepare(
              `SELECT title, content FROM material
                WHERE subject_id = ? AND role = ? AND chapter = ?
                  AND deleted_at IS NULL AND content != '' ORDER BY created_at`,
            )
            .all(r.data.subjectId, role, chapter)
    ) as { title: string; content: string }[];

  try {
    const runNote = plan.action === "note" || plan.action === "both";
    const runPractice = plan.action === "practice" || plan.action === "both";

    const noteJob = (async () => {
    if (runNote) {
      const mats = loadMats("knowledge");
      if (mats.length === 0) {
        done.push(`第 ${chapter ?? "当前"} 章没有知识类资料`);
      } else {
        const text = mats.map((m) => `【${m.title}】\n${m.content}`).join("\n\n").slice(0, 40000);
        const content = await explainChapter(subject.name, chapter, text, r.data.request);
        const existing = db
          .prepare(
            `SELECT id FROM study_note WHERE subject_id = ? AND IFNULL(chapter, '') = IFNULL(?, '')`,
          )
          .get(r.data.subjectId, chapter) as { id: string } | undefined;
        if (existing) {
          db.prepare(
            "UPDATE study_note SET content = ?, updated_at = datetime('now') WHERE id = ?",
          ).run(content, existing.id);
        } else {
          db.prepare(
            "INSERT INTO study_note (id, subject_id, chapter, content) VALUES (?, ?, ?, ?)",
          ).run(uid(), r.data.subjectId, chapter, content);
        }
        return "讲解已更新";
      }
    }
    return null;
    })();

    const practiceJob = (async () => {
    if (runPractice) {
      const mats = loadMats("questions");
      if (mats.length === 0) {
        done.push(`第 ${chapter ?? "当前"} 章没有题目类资料`);
      } else {
        const text = mats.map((m) => `【${m.title}】\n${m.content}`).join("\n\n").slice(0, 40000);
        const cards = await generateCards(text, subject.name, 10, "questions", r.data.request);
        const items = cards.map((x) => ({ q: x.front, a: x.back, ref: x.ref ?? null }));
        const existing = db
          .prepare(
            `SELECT id FROM chapter_practice WHERE subject_id = ? AND IFNULL(chapter, '') = IFNULL(?, '')`,
          )
          .get(r.data.subjectId, chapter) as { id: string } | undefined;
        if (existing) {
          db.prepare(
            "UPDATE chapter_practice SET items = ?, updated_at = datetime('now') WHERE id = ?",
          ).run(JSON.stringify(items), existing.id);
        } else {
          db.prepare(
            "INSERT INTO chapter_practice (id, subject_id, chapter, items) VALUES (?, ?, ?, ?)",
          ).run(uid(), r.data.subjectId, chapter, JSON.stringify(items));
        }
        return `练习题已更新（${items.length} 题）`;
      }
    }
    return null;
    })();

    // 两个生成同时跑，等于把等待时间减半
    const [noteMsg, practiceMsg] = await Promise.all([noteJob, practiceJob]);
    if (noteMsg) done.push(noteMsg);
    if (practiceMsg) done.push(practiceMsg);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOKEY") return c.json({ error: "NOKEY" }, 400);
    return c.json({ error: msg }, 502);
  }

  return c.json({
    action: plan.action,
    chapter,
    message: done.join("；") || plan.message,
  });
});
