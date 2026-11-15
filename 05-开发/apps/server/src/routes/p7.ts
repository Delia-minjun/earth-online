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

/** 从一句话里取章节号，取不到返回 null */
function guessChapter(request: string): string | null {
  const raw =
    request.match(/第\s*([0-9]+(?:\s*-\s*[0-9]+)?)\s*章/)?.[1] ??
    request.match(/\bch(?:apter)?\s*([0-9]+)/i)?.[1] ??
    null;
  if (raw) return raw.replace(/\s+/g, "-");
  const lec = request.match(/\bL\s*([0-9]+)/i)?.[1];
  return lec ? `L${lec}` : null;
}

/** 关键词判断该改什么（内容不存在时的兜底） */
function guessAction(request: string): "note" | "practice" | "both" {
  const wantsPractice = /(题|练习|刷题|quiz|考试|做题|选择题|计算题)/i.test(request);
  const wantsNote = /(讲解|知识点|讲义|易错|讲得|讲浅|讲深|补充|例子|总结|梳理)/i.test(request);
  if (wantsNote && wantsPractice) return "both";
  return wantsPractice ? "practice" : "note";
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
      /** 用户显式选的章节；null/缺省表示「自动判断」 */
      chapter: z.string().trim().max(20).nullable().optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const subject = db.prepare("SELECT name FROM subject WHERE id = ?").get(r.data.subjectId) as
    | { name: string }
    | undefined;
  if (!subject) return c.json({ error: "not_found" }, 404);

  const findNote = (chapter: string | null) =>
    db
      .prepare(
        `SELECT id, content FROM study_note
          WHERE subject_id = ? AND IFNULL(chapter, '') = IFNULL(?, '')`,
      )
      .get(r.data.subjectId, chapter) as { id: string; content: string } | undefined;

  const findPractice = (chapter: string | null) =>
    db
      .prepare(
        `SELECT id, items FROM chapter_practice
          WHERE subject_id = ? AND IFNULL(chapter, '') = IFNULL(?, '')`,
      )
      .get(r.data.subjectId, chapter) as { id: string; items: string } | undefined;

  // 1) 定章：显式选择 > 文字里的「第N章」 > 唯一有内容的那一章 > 不分章
  const candidates: (string | null)[] = [];
  if (r.data.chapter) candidates.push(r.data.chapter);
  const guessed = guessChapter(r.data.request);
  if (guessed && !candidates.includes(guessed)) candidates.push(guessed);

  const existing = db
    .prepare(
      `SELECT DISTINCT chapter FROM (
         SELECT chapter FROM study_note WHERE subject_id = ? AND chapter IS NOT NULL
         UNION SELECT chapter FROM chapter_practice WHERE subject_id = ? AND chapter IS NOT NULL
       )`,
    )
    .all(r.data.subjectId, r.data.subjectId) as { chapter: string }[];
  // 只有一章时不必猜，直接落到那一章
  if (existing.length === 1 && !candidates.includes(existing[0]!.chapter)) {
    candidates.push(existing[0]!.chapter);
  }
  candidates.push(null);

  const target = candidates.find((ch) => findNote(ch) || findPractice(ch)) ?? candidates[0] ?? null;
  const note = findNote(target);
  const practice = findPractice(target);

  /* ---------- 情况一：这一章已有内容，只打补丁 ---------- */
  if (note || practice) {
    let patch;
    try {
      patch = await planPatch(
        subject.name,
        target,
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
        } else if (typeof edit.index === "number" && edit.q && edit.a && items[edit.index]) {
          items[edit.index] = { q: edit.q, a: edit.a, ref: edit.ref ?? null };
          itemsChanged += 1;
        }
      }
    }

    if (noteChanged === 0 && itemsChanged === 0) {
      return c.json({ action: "none", chapter: target, message: patch.message || "没有找到需要改的地方" });
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
          target,
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
        ).run(uid(), r.data.subjectId, target, JSON.stringify(items));
      }
    }

    const parts: string[] = [];
    if (noteChanged) parts.push(`讲解了 ${noteChanged} 处`);
    if (itemsChanged) parts.push(`题目改了 ${itemsChanged} 处`);
    return c.json({ action: "patch", chapter: target, message: parts.join("；") });
  }

  /* ---------- 情况二：这一章还没有内容，生成 ---------- */
  let action = guessAction(r.data.request);
  let planChapter = target;
  if (!guessed && !r.data.chapter) {
    // 完全没提章节、也没有任何内容可参照时，才让模型帮忙判断
    try {
      const plan = await planInstruction(subject.name, existing.map((x) => x.chapter), r.data.request);
      if (plan.action === "none") {
        return c.json({ action: "none", message: plan.message || "不清楚要改什么，换个说法试试" });
      }
      action = plan.action;
      planChapter = plan.chapter ?? planChapter;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "NOKEY") return c.json({ error: "NOKEY" }, 400);
      return c.json({ error: `规划失败：${msg}` }, 502);
    }
  }

  // 自动判断但没说章节、又有多章时，先问清楚，别瞎猜
  if (!r.data.chapter && !guessed && existing.length > 1) {
    return c.json({
      action: "none",
      chapter: null,
      message: `要改哪一章？在上方选章节，或在话里写明「第 N 章」（现有 ${existing
        .map((x) => x.chapter)
        .join("、")}）`,
    });
  }

  const loadMats = (role: "knowledge" | "questions") =>
    (
      planChapter === null
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
            .all(r.data.subjectId, role, planChapter)
    ) as { title: string; content: string }[];

  const join = (mats: { title: string; content: string }[]) =>
    mats.map((m) => `【${m.title}】\n${m.content}`).join("\n\n").slice(0, 40000);

  const done: string[] = [];
  try {
    const jobs: Promise<void>[] = [];
    if (action === "note" || action === "both") {
      const mats = loadMats("knowledge");
      if (mats.length === 0)
        done.push(planChapter ? `第 ${planChapter} 章没有知识类资料` : "这一章还没有知识类资料");
      else {
        jobs.push(
          (async () => {
            const content = await explainChapter(subject.name, planChapter, join(mats), r.data.request);
            const existed = findNote(planChapter);
            if (existed) {
              db.prepare(
                "UPDATE study_note SET content = ?, updated_at = datetime('now') WHERE id = ?",
              ).run(content, existed.id);
            } else {
              db.prepare(
                "INSERT INTO study_note (id, subject_id, chapter, content) VALUES (?, ?, ?, ?)",
              ).run(uid(), r.data.subjectId, planChapter, content);
            }
            done.push("讲解已生成");
          })(),
        );
      }
    }
    if (action === "practice" || action === "both") {
      const mats = loadMats("questions");
      if (mats.length === 0)
        done.push(planChapter ? `第 ${planChapter} 章没有题目类资料` : "这一章还没有题目类资料");
      else {
        jobs.push(
          (async () => {
            const cards = await generateCards(join(mats), subject.name, 10, "questions", r.data.request);
            const items = cards.map((x) => ({ q: x.front, a: x.back, ref: x.ref ?? null }));
            const existed = findPractice(planChapter);
            if (existed) {
              db.prepare(
                "UPDATE chapter_practice SET items = ?, updated_at = datetime('now') WHERE id = ?",
              ).run(JSON.stringify(items), existed.id);
            } else {
              db.prepare(
                "INSERT INTO chapter_practice (id, subject_id, chapter, items) VALUES (?, ?, ?, ?)",
              ).run(uid(), r.data.subjectId, planChapter, JSON.stringify(items));
            }
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

  return c.json({ action, chapter: planChapter, message: done.join("；") });
});
