import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db.ts";
import { explainChapter, generateCards, planInstruction, planPatch } from "../lib/ai.ts";

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

/** 没有现成内容时的兜底：关键词判断该生成什么 */
function localPlan(request: string): { action: "note" | "practice" | "both"; chapter: string | null } {
  const wantsPractice = /(题|练习|刷题|quiz|考试|做题|选择题|计算题)/i.test(request);
  const wantsNote = /(讲解|知识点|讲义|易错|讲得|讲浅|讲深|补充|例子|总结|梳理)/i.test(request);
  const chRaw =
    request.match(/第\s*([0-9]+(?:\s*-\s*[0-9]+)?)\s*章/)?.[1] ??
    request.match(/\bch(?:apter)?\s*([0-9]+)/i)?.[1] ??
    null;
  const chapter = chRaw ? chRaw.replace(/\s+/g, "-") : null;
  const action = wantsNote && wantsPractice ? "both" : wantsPractice ? "practice" : "note";
  return { action, chapter };
}

/** 把一节内容替换进整篇 Markdown（找不到就追加） */
function replaceSection(doc: string, heading: string, content: string): string {
  const lines = doc.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading.trim());
  if (start < 0) return `${doc.trimEnd()}\n\n${content.trim()}\n`;
  let end = start + 1;
  while (end < lines.length && !/^#{2,4}\s/.test(lines[end]!.trim())) end += 1;
  return [...lines.slice(0, start), ...content.trim().split("\n"), ...lines.slice(end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

p7.post("/study/instruct", async (c) => {
  const r = await readBody(
    c,
    z.object({
      subjectId: z.string(),
      request: z.string().trim().min(1).max(500),
      /** 用户显式选的章节，优先于模型判断 */
      chapter: z.string().trim().max(20).nullable().optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const subject = db.prepare("SELECT name FROM subject WHERE id = ?").get(r.data.subjectId) as
    | { name: string }
    | undefined;
  if (!subject) return c.json({ error: "not_found" }, 404);

  const chapter = r.data.chapter ?? null;

  const note = db
    .prepare(
      `SELECT id, content FROM study_note
        WHERE subject_id = ? AND IFNULL(chapter, '') = IFNULL(?, '')`,
    )
    .get(r.data.subjectId, chapter) as { id: string; content: string } | undefined;

  const practice = db
    .prepare(
      `SELECT id, items FROM chapter_practice
        WHERE subject_id = ? AND IFNULL(chapter, '') = IFNULL(?, '')`,
    )
    .get(r.data.subjectId, chapter) as { id: string; items: string } | undefined;

  /* ---------- 情况一：已有内容，只打补丁 ---------- */
  if (note || practice) {
    let patch;
    try {
      patch = await planPatch(
        subject.name,
        chapter,
        note?.content ?? "（本章还没有讲解）",
        practice?.items ?? "[]",
        r.data.request,
      );
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "NOKEY") return c.json({ error: "NOKEY" }, 400);
      return c.json({ error: `修改失败：${msg}` }, 502);
    }

    let noteText = note?.content ?? "";
    const items = JSON.parse(practice?.items ?? "[]") as { q: string; a: string; ref: string | null }[];
    let noteChanged = 0;
    let itemsChanged = 0;

    for (const edit of patch.edits) {
      if (edit.target === "note" && edit.content) {
        if (edit.append || !edit.heading) {
          noteText = `${noteText.trimEnd()}\n\n${edit.content.trim()}\n`;
        } else {
          noteText = replaceSection(noteText, edit.heading, edit.content);
        }
        noteChanged += 1;
      } else if (edit.target === "practice") {
        if (edit.append && edit.q && edit.a) {
          items.push({ q: edit.q, a: edit.a, ref: edit.ref ?? null });
          itemsChanged += 1;
        } else if (typeof edit.index === "number" && edit.q && edit.a) {
          if (items[edit.index]) {
            items[edit.index] = { q: edit.q, a: edit.a, ref: edit.ref ?? null };
            itemsChanged += 1;
          }
        }
      }
    }

    if (noteChanged === 0 && itemsChanged === 0) {
      return c.json({ action: "none", chapter, message: patch.message || "没有找到需要改的地方" });
    }

    if (noteChanged > 0) {
      if (note) {
        db.prepare("UPDATE study_note SET content = ?, updated_at = datetime('now') WHERE id = ?").run(
          noteText,
          note.id,
        );
      } else {
        db.prepare("INSERT INTO study_note (id, subject_id, chapter, content) VALUES (?, ?, ?, ?)").run(
          uid(),
          r.data.subjectId,
          chapter,
          noteText,
        );
      }
    }

    if (itemsChanged > 0) {
      if (practice) {
        db.prepare(
          "UPDATE chapter_practice SET items = ?, updated_at = datetime('now') WHERE id = ?",
        ).run(JSON.stringify(items), practice.id);
      } else {
        db.prepare(
          "INSERT INTO chapter_practice (id, subject_id, chapter, items) VALUES (?, ?, ?, ?)",
        ).run(uid(), r.data.subjectId, chapter, JSON.stringify(items));
      }
    }

    const parts: string[] = [];
    if (noteChanged) parts.push(`讲解了 ${noteChanged} 处`);
    if (itemsChanged) parts.push(`题目改了 ${itemsChanged} 处`);
    return c.json({ action: "patch", chapter, message: parts.join("；") });
  }

  /* ---------- 情况二：还没有内容，按意图生成 ---------- */
  const quick = localPlan(r.data.request);
  let plan: { action: "note" | "practice" | "both" | "none"; chapter: string | null; message: string } = {
    ...quick,
    chapter: quick.chapter ?? chapter,
    message: "",
  };
  if (!quick.action) {
    try {
      plan = await planInstruction(subject.name, [], r.data.request);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "NOKEY") return c.json({ error: "NOKEY" }, 400);
      return c.json({ error: `规划失败：${msg}` }, 502);
    }
  }
  if (plan.action === "none") {
    return c.json({ action: "none", message: plan.message || "这一章还没有内容，先上传资料" });
  }

  const target = plan.chapter ?? chapter;
  const loadMats = (role: "knowledge" | "questions") =>
    (
      target === null
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
            .all(r.data.subjectId, role, target)
    ) as { title: string; content: string }[];

  const join = (mats: { title: string; content: string }[]) =>
    mats.map((m) => `【${m.title}】\n${m.content}`).join("\n\n").slice(0, 40000);

  const done: string[] = [];
  try {
    const jobs: Promise<void>[] = [];
    if (plan.action === "note" || plan.action === "both") {
      const mats = loadMats("knowledge");
      if (mats.length === 0) done.push("这一章还没有知识类资料");
      else {
        jobs.push(
          (async () => {
            const content = await explainChapter(subject.name, target, join(mats), r.data.request);
            db.prepare(
              "INSERT INTO study_note (id, subject_id, chapter, content) VALUES (?, ?, ?, ?)",
            ).run(uid(), r.data.subjectId, target, content);
            done.push("讲解已生成");
          })(),
        );
      }
    }
    if (plan.action === "practice" || plan.action === "both") {
      const mats = loadMats("questions");
      if (mats.length === 0) done.push("这一章还没有题目类资料");
      else {
        jobs.push(
          (async () => {
            const cards = await generateCards(join(mats), subject.name, 10, "questions", r.data.request);
            const items = cards.map((x) => ({ q: x.front, a: x.back, ref: x.ref ?? null }));
            db.prepare(
              "INSERT INTO chapter_practice (id, subject_id, chapter, items) VALUES (?, ?, ?, ?)",
            ).run(uid(), r.data.subjectId, target, JSON.stringify(items));
            done.push(`练习题已生成（${items.length} 题）`);
          })(),
        );
      }
    }
    await Promise.all(jobs);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOKEY") return c.json({ error: "NOKEY" }, 400);
    return c.json({ error: msg }, 502);
  }

  return c.json({ action: plan.action, chapter: target, message: done.join("；") });
});
