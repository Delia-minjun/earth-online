import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db.ts";
import { DATE_RE, today } from "../lib/dates.ts";
import { generateCards, ocrImage } from "../lib/ai.ts";
import { extractDocument } from "../lib/office.ts";
import { bumpArea, earn, getRules } from "../lib/coins.ts";

export const p5 = new Hono();

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

/** 间隔重复：box 1..5 对应 1 / 3 / 7 / 21 / 60 天 */
const BOX_DAYS = [1, 3, 7, 21, 60];

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


function mimeOf(filename: string): string {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}
/* ---------------- 科目 ---------------- */

const SUBJECT_COLS = "id, name, color, archived, sort";

p5.get("/study/subjects", (c) => {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.name, s.color, s.sort,
              (SELECT COUNT(*) FROM material m WHERE m.subject_id = s.id AND m.deleted_at IS NULL) AS materials,
              (SELECT COUNT(*) FROM card c WHERE c.subject_id = s.id AND c.deleted_at IS NULL) AS cards,
              (SELECT COUNT(*) FROM card c WHERE c.subject_id = s.id AND c.deleted_at IS NULL AND c.due_date <= ?) AS due
         FROM subject s
        WHERE s.archived = 0
        ORDER BY s.sort, s.name`,
    )
    .all(today());
  return c.json(rows);
});

p5.post("/study/subjects", async (c) => {
  const r = await readBody(c, z.object({ name: z.string().trim().min(1).max(40), color: z.string().optional() }));
  if (!r.ok) return c.json({ error: r.error }, 400);
  const db = getDb();
  const id = uid();
  const next = (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM subject").get() as { n: number }).n;
  const COLORS = ["#9BA7B0", "#A8B5A2", "#CBBB9A", "#B0A6BC", "#C9A9A6", "#CDBDB0"];
  db.prepare("INSERT INTO subject (id, name, color, sort) VALUES (?, ?, ?, ?)").run(
    id,
    r.data.name,
    r.data.color ?? COLORS[next % COLORS.length]!,
    next,
  );
  return c.json(db.prepare(`SELECT ${SUBJECT_COLS} FROM subject WHERE id = ?`).get(id), 201);
});

p5.patch("/study/subjects/:id", async (c) => {
  const id = c.req.param("id");
  const r = await readBody(c, z.object({ name: z.string().trim().min(1).max(40).optional(), color: z.string().optional() }));
  if (!r.ok) return c.json({ error: r.error }, 400);
  const db = getDb();
  const cur = db.prepare("SELECT * FROM subject WHERE id = ?").get(id) as
    | { name: string; color: string | null }
    | undefined;
  if (!cur) return c.json({ error: "not found" }, 404);
  db.prepare("UPDATE subject SET name = ?, color = ? WHERE id = ?").run(
    r.data.name ?? cur.name,
    r.data.color ?? cur.color,
    id,
  );
  return c.json(db.prepare(`SELECT ${SUBJECT_COLS} FROM subject WHERE id = ?`).get(id));
});

p5.delete("/study/subjects/:id", (c) => {
  getDb().prepare("UPDATE subject SET archived = 1 WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});


/** 从标题/文件名猜章节（与前端 lib/chapter.ts 同一套规则） */
function guessChapter(text: string): string | null {
  const name = text.replace(/\.[^.]+$/, "");
  const cn = name.match(/第\s*([0-9]+(?:\s*[-–~]\s*[0-9]+)?)\s*[章讲课]/);
  if (cn?.[1]) return cn[1].replace(/\s+/g, "").replace(/[–~]/g, "-");
  const en = name.match(/\b(?:ch|chap|chapter)\s*([0-9]+(?:\s*([-–~])\s*[0-9]+)?)/i);
  if (en?.[1]) return en[1].replace(/\s+/g, "").replace(/[–~]/g, "-");
  const lec = name.match(/\b(?:l|lec|lecture)\s*([0-9]+)/i);
  if (lec?.[1]) return `L${lec[1]}`;
  const lead = name.match(/^\s*0*([0-9]{1,2})(?=[\s._\-–—])/);
  if (lead?.[1]) return lead[1];
  return null;
}

/* ---------------- 资料 ---------------- */

const MATERIAL_COLS =
  "id, subject_id, title, kind, source, content, status, page_from, page_to, created_at, role, chapter";

p5.get("/study/materials", (c) => {
  const subjectId = c.req.query("subjectId");
  const db = getDb();

  // 历史资料补章节：只在能猜出来时写回，猜不到保持为空
  const missing = db
    .prepare(`SELECT id, title, source FROM material WHERE deleted_at IS NULL AND chapter IS NULL`)
    .all() as { id: string; title: string; source: string | null }[];
  const fix = db.prepare("UPDATE material SET chapter = ? WHERE id = ?");
  for (const m of missing) {
    const guess = guessChapter(m.source ?? m.title);
    if (guess) fix.run(guess, m.id);
  }
  const rows = subjectId
    ? db
        .prepare(
          `SELECT ${MATERIAL_COLS} FROM material
            WHERE deleted_at IS NULL AND subject_id = ? ORDER BY created_at DESC`,
        )
        .all(subjectId)
    : db
        .prepare(`SELECT ${MATERIAL_COLS} FROM material WHERE deleted_at IS NULL ORDER BY created_at DESC`)
        .all();
  return c.json(rows);
});

const materialBody = z.object({
  subjectId: z.string(),
  title: z.string().trim().min(1).max(120),
  kind: z.enum(["text", "image", "link"]).default("text"),
  content: z.string().max(200_000).default(""),
  source: z.string().max(2000).optional(),
  /** 传了图片就做 OCR，结果写进 content，状态置为 raw（待校对） */
  imageBase64: z.string().optional(),
  imageMime: z.string().optional(),
  role: z.enum(["knowledge", "questions"]).default("knowledge"),
  chapter: z.string().trim().max(20).nullable().optional(),
});

p5.post("/study/materials", async (c) => {
  const r = await readBody(c, materialBody);
  if (!r.ok) return c.json({ error: r.error }, 400);

  let content = r.data.content;
  let title = r.data.title;
  let error: string | null = null;

  if (r.data.imageBase64) {
    try {
      const text = await ocrImage(r.data.imageBase64, r.data.imageMime ?? "image/png");
      if (text) content = text;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "NOKEY") error = "NOKEY";
      else if (msg === "VISION_UNSUPPORTED") error = "VISION_UNSUPPORTED";
      else error = msg;
    }
    if (!title.trim()) title = "扫描件";
  }

  const db = getDb();
  const id = uid();
  db.prepare(
    `INSERT INTO material (id, subject_id, title, kind, source, content, status, page_from, page_to)
     VALUES (?, ?, ?, ?, ?, ?, 'verified', NULL, NULL)`,
  ).run(id, r.data.subjectId, title, r.data.kind, r.data.source ?? null, content);
  db.prepare("UPDATE material SET role = ?, chapter = ? WHERE id = ?").run(
    r.data.role,
    r.data.chapter ?? null,
    id,
  );

  return c.json(
    {
      ...(db.prepare(`SELECT ${MATERIAL_COLS} FROM material WHERE id = ?`).get(id) as object),
      ocrError: error,
    },
    201,
  );
});


/** 上传文件（md / txt / docx / pptx / pdf / 图片）→ 抽文字入库，状态仍是「待校对」 */
p5.post("/study/materials/file", async (c) => {
  const r = await readBody(
    c,
    z.object({
      subjectId: z.string(),
      filename: z.string().min(1).max(200),
      base64: z.string().min(16),
      title: z.string().trim().max(120).optional(),
      role: z.enum(["knowledge", "questions"]).default("knowledge"),
      chapter: z.string().trim().max(20).nullable().optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  let buf: Buffer;
  try {
    buf = Buffer.from(r.data.base64, "base64");
  } catch {
    return c.json({ error: "bad_base64" }, 400);
  }
  if (buf.length > 25 * 1024 * 1024) return c.json({ error: "too_large" }, 413);

  const { kind, text } = await extractDocument(r.data.filename, buf);
  if (kind === "unknown") return c.json({ error: "unsupported_type" }, 400);

  const db = getDb();
  const id = uid();
  const title = r.data.title?.trim() || r.data.filename.replace(/\.[^.]+$/, "");

  if (kind === "image") {
    // 图片走 OCR
    let content = "";
    let error: string | null = null;
    try {
      content = await ocrImage(buf.toString("base64"), mimeOf(r.data.filename));
    } catch (e) {
      const msg = (e as Error).message;
      error = msg === "NOKEY" || msg === "VISION_UNSUPPORTED" ? msg : msg;
    }
    if (!content.trim()) return c.json({ error: error ?? "ocr_empty" }, 422);
    db.prepare(
      `INSERT INTO material (id, subject_id, title, kind, source, content, status)
       VALUES (?, ?, ?, 'image', ?, ?, 'verified')`,
    ).run(id, r.data.subjectId, title, r.data.filename, content);
    db.prepare("UPDATE material SET role = ?, chapter = ? WHERE id = ?").run(
      r.data.role,
      r.data.chapter ?? null,
      id,
    );
    return c.json(db.prepare(`SELECT ${MATERIAL_COLS} FROM material WHERE id = ?`).get(id), 201);
  }

  const body = text.slice(0, 200_000);
  if (!body.trim()) {
    return c.json({ error: kind === "pdf" ? "pdf_no_text" : "empty_content" }, 422);
  }
  // 乱码检测：控制字符/替换字符占比过高，说明是没有 ToUnicode 的 PDF 或二进制被当成文本
  const bad = (body.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  if (bad / Math.max(1, body.length) > 0.05) {
    return c.json({ error: "garbled_text" }, 422);
  }

  db.prepare(
    `INSERT INTO material (id, subject_id, title, kind, source, content, status)
     VALUES (?, ?, ?, ?, ?, ?, 'verified')`,
  ).run(id, r.data.subjectId, title, kind === "text" ? "text" : "file", r.data.filename, body);
  db.prepare("UPDATE material SET role = ?, chapter = ? WHERE id = ?").run(
    r.data.role,
    r.data.chapter ?? null,
    id,
  );

  return c.json(
    {
      ...(db.prepare(`SELECT ${MATERIAL_COLS} FROM material WHERE id = ?`).get(id) as object),
      extracted: kind,
      chars: body.length,
    },
    201,
  );
});

/** 前端把 PDF 渲染成图片后逐页发来，这里走视觉模型 OCR，合并成一份资料 */
p5.post("/study/materials/ocr-pages", async (c) => {
  const r = await readBody(
    c,
    z.object({
      subjectId: z.string(),
      title: z.string().trim().min(1).max(120),
      role: z.enum(["knowledge", "questions"]).default("knowledge"),
      chapter: z.string().trim().max(20).nullable().optional(),
      pages: z
        .array(z.object({ base64: z.string().min(16), mime: z.string().default("image/jpeg") }))
        .min(1)
        .max(20),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const parts: string[] = [];
  for (let i = 0; i < r.data.pages.length; i += 1) {
    const page = r.data.pages[i]!;
    try {
      const text = await ocrImage(page.base64, page.mime);
      if (text.trim()) parts.push(`【第 ${i + 1} 页】\n${text.trim()}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "NOKEY" || msg === "VISION_UNSUPPORTED") return c.json({ error: msg }, 400);
      return c.json({ error: `page ${i + 1}: ${msg}` }, 502);
    }
  }
  if (parts.length === 0) return c.json({ error: "ocr_empty" }, 422);

  const body = parts.join("\n\n").slice(0, 200_000);
  const db = getDb();
  const id = uid();
  db.prepare(
    `INSERT INTO material (id, subject_id, title, kind, source, content, status)
     VALUES (?, ?, ?, 'image', ?, ?, 'verified')`,
  ).run(id, r.data.subjectId, r.data.title, `pdf-${r.data.pages.length}p`, body);
  db.prepare("UPDATE material SET role = ?, chapter = ? WHERE id = ?").run(
    r.data.role,
    r.data.chapter ?? null,
    id,
  );

  return c.json(db.prepare(`SELECT ${MATERIAL_COLS} FROM material WHERE id = ?`).get(id), 201);
});


/** 按类别出卡片：knowledge 生成知识点详解卡；questions 参考题型难度出新题 */
p5.post("/study/generate", async (c) => {
  const r = await readBody(
    c,
    z.object({
      subjectId: z.string(),
      role: z.enum(["knowledge", "questions"]),
      chapter: z.string().trim().max(20).nullable().optional(),
      count: z.number().int().min(3).max(30).default(8),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const subject = db.prepare("SELECT name FROM subject WHERE id = ?").get(r.data.subjectId) as
    | { name: string }
    | undefined;
  if (!subject) return c.json({ error: "not_found" }, 404);

  const chapter = r.data.chapter ?? null;
  const mats = (
    chapter === null
      ? db
          .prepare(
            `SELECT title, content FROM material
              WHERE subject_id = ? AND role = ? AND chapter IS NULL
                AND deleted_at IS NULL AND content != ''
              ORDER BY created_at`,
          )
          .all(r.data.subjectId, r.data.role)
      : db
          .prepare(
            `SELECT title, content FROM material
              WHERE subject_id = ? AND role = ? AND chapter = ?
                AND deleted_at IS NULL AND content != ''
              ORDER BY created_at`,
          )
          .all(r.data.subjectId, r.data.role, chapter)
  ) as { title: string; content: string }[];

  if (mats.length === 0) return c.json({ error: "no_material" }, 409);

  const text = mats
    .map((m) => `【${m.title}】\n${m.content}`)
    .join("\n\n")
    .slice(0, 40000);

  let cards;
  try {
    cards = await generateCards(text, subject.name, r.data.count, r.data.role);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOKEY") return c.json({ error: "NOKEY" }, 400);
    return c.json({ error: msg }, 502);
  }
  if (cards.length === 0) return c.json({ error: "no_cards" }, 502);

  const ins = db.prepare(
    `INSERT INTO card (id, subject_id, material_id, front, back, ref, box, due_date, chapter)
     VALUES (?, ?, NULL, ?, ?, ?, 1, ?, ?)`,
  );
  const made = cards.map((card) => {
    const cid = uid();
    ins.run(cid, r.data.subjectId, card.front, card.back, card.ref ?? null, today(), chapter);
    return { id: cid, front: card.front, back: card.back, ref: card.ref ?? null };
  });
  return c.json({ cards: made }, 201);
});

p5.patch("/study/materials/:id", async (c) => {
  const id = c.req.param("id");
  const r = await readBody(
    c,
    z.object({
      title: z.string().trim().min(1).max(120).optional(),
      content: z.string().max(200_000).optional(),
      status: z.enum(["raw", "verified"]).optional(),
      chapter: z.string().trim().max(20).nullable().optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const cur = db.prepare(`SELECT ${MATERIAL_COLS} FROM material WHERE id = ? AND deleted_at IS NULL`).get(id) as
    | { title: string; content: string; status: string; chapter: string | null }
    | undefined;
  if (!cur) return c.json({ error: "not found" }, 404);

  db.prepare("UPDATE material SET title = ?, content = ?, status = ?, chapter = ? WHERE id = ?").run(
    r.data.title ?? cur.title,
    r.data.content ?? cur.content,
    r.data.status ?? cur.status,
    r.data.chapter !== undefined ? r.data.chapter : cur.chapter,
    id,
  );
  return c.json(db.prepare(`SELECT ${MATERIAL_COLS} FROM material WHERE id = ?`).get(id));
});

p5.delete("/study/materials/:id", (c) => {
  getDb()
    .prepare("UPDATE material SET deleted_at = datetime('now') WHERE id = ?")
    .run(c.req.param("id"));
  return c.json({ ok: true });
});

/* ---------------- 卡片 ---------------- */

const CARD_COLS = "id, subject_id, material_id, front, back, ref, box, due_date, reviewed_at, chapter";

p5.get("/study/cards", (c) => {
  const subjectId = c.req.query("subjectId");
  const db = getDb();
  const rows = subjectId
    ? db
        .prepare(
          `SELECT ${CARD_COLS} FROM card WHERE deleted_at IS NULL AND subject_id = ?
            ORDER BY due_date, created_at`,
        )
        .all(subjectId)
    : db.prepare(`SELECT ${CARD_COLS} FROM card WHERE deleted_at IS NULL ORDER BY due_date LIMIT 500`).all();
  return c.json(rows);
});

p5.post("/study/cards", async (c) => {
  const r = await readBody(
    c,
    z.object({
      subjectId: z.string(),
      materialId: z.string().optional(),
      front: z.string().trim().min(1).max(500),
      back: z.string().trim().min(1).max(2000),
      ref: z.string().max(120).optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const id = uid();
  db.prepare(
    `INSERT INTO card (id, subject_id, material_id, front, back, ref, box, due_date)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  ).run(id, r.data.subjectId, r.data.materialId ?? null, r.data.front, r.data.back, r.data.ref ?? null, today());
  return c.json(db.prepare(`SELECT ${CARD_COLS} FROM card WHERE id = ?`).get(id), 201);
});

p5.patch("/study/cards/:id", async (c) => {
  const id = c.req.param("id");
  const r = await readBody(
    c,
    z.object({
      front: z.string().trim().min(1).max(500).optional(),
      back: z.string().trim().min(1).max(2000).optional(),
      ref: z.string().max(120).nullable().optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const cur = db.prepare(`SELECT ${CARD_COLS} FROM card WHERE id = ? AND deleted_at IS NULL`).get(id) as
    | { front: string; back: string; ref: string | null }
    | undefined;
  if (!cur) return c.json({ error: "not found" }, 404);

  db.prepare("UPDATE card SET front = ?, back = ?, ref = ? WHERE id = ?").run(
    r.data.front ?? cur.front,
    r.data.back ?? cur.back,
    r.data.ref !== undefined ? r.data.ref : cur.ref,
    id,
  );
  return c.json(db.prepare(`SELECT ${CARD_COLS} FROM card WHERE id = ?`).get(id));
});

p5.delete("/study/cards/:id", (c) => {
  getDb().prepare("UPDATE card SET deleted_at = datetime('now') WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

/** 从「已校对」的资料出卡片；资料没校对就不让出，避免拿错字去背 */
p5.post("/study/materials/:id/generate", async (c) => {
  const id = c.req.param("id");
  const r = await readBody(c, z.object({ count: z.number().int().min(3).max(30).default(8) }));
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const m = db
    .prepare(
      `SELECT m.id, m.subject_id, m.title, m.content, m.status, s.name AS subject_name
         FROM material m JOIN subject s ON s.id = m.subject_id
        WHERE m.id = ? AND m.deleted_at IS NULL`,
    )
    .get(id) as
    | { id: string; subject_id: string; title: string; content: string; status: string; subject_name: string }
    | undefined;
  if (!m) return c.json({ error: "not found" }, 404);
  if (!m.content.trim()) return c.json({ error: "empty_content" }, 409);

  let cards;
  try {
    cards = await generateCards(m.content, m.subject_name, r.data.count);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOKEY") return c.json({ error: "NOKEY" }, 400);
    return c.json({ error: msg }, 502);
  }
  if (cards.length === 0) return c.json({ error: "no_cards" }, 502);

  const ins = db.prepare(
    `INSERT INTO card (id, subject_id, material_id, front, back, ref, box, due_date)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  const made = cards.map((card) => {
    const cid = uid();
    ins.run(cid, m.subject_id, m.id, card.front, card.back, card.ref ?? m.title, today());
    return { id: cid, front: card.front, back: card.back, ref: card.ref ?? m.title };
  });
  return c.json({ cards: made }, 201);
});

/* ---------------- 复习 ---------------- */

/** 今日队列：到期（due_date <= 今天）的卡片，按逾期天数与 box 排 */
p5.get("/study/review/queue", (c) => {
  const d = c.req.query("date") ?? today();
  const subjectId = c.req.query("subjectId");
  const db = getDb();
  const base = `SELECT c.id, c.subject_id, c.front, c.back, c.ref, c.box, c.due_date,
                       s.name AS subject_name, s.color AS subject_color
                  FROM card c JOIN subject s ON s.id = c.subject_id
                 WHERE c.deleted_at IS NULL AND c.due_date <= ?`;
  const rows = subjectId
    ? db.prepare(`${base} AND c.subject_id = ? ORDER BY c.due_date, c.box`).all(d, subjectId)
    : db.prepare(`${base} ORDER BY c.due_date, c.box`).all(d);
  return c.json({ date: d, cards: rows });
});

/** 自评三档：again 回第一格，good 进一格，easy 进两格 */
p5.post("/study/cards/:id/review", async (c) => {
  const id = c.req.param("id");
  const r = await readBody(c, z.object({ rating: z.enum(["again", "good", "easy"]) }));
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const card = db.prepare(`SELECT ${CARD_COLS} FROM card WHERE id = ? AND deleted_at IS NULL`).get(id) as
    | { box: number; subject_id: string }
    | undefined;
  if (!card) return c.json({ error: "not found" }, 404);

  const prev = card.box;
  const next =
    r.data.rating === "again" ? 1 : Math.min(BOX_DAYS.length, prev + (r.data.rating === "easy" ? 2 : 1));
  const due = addDays(today(), BOX_DAYS[next - 1]!);

  db.prepare("UPDATE card SET box = ?, due_date = ?, reviewed_at = datetime('now') WHERE id = ?").run(
    next,
    due,
    id,
  );
  db.prepare(
    `INSERT INTO card_review (id, card_id, rating, prev_box, next_box) VALUES (?, ?, ?, ?, ?)`,
  ).run(uid(), id, r.data.rating, prev, next);

  // 复习 = 学习：给「学业事业」加进度，满 10 张发一次币（防刷）
  bumpArea("area-study", 0.04);
  const done = (
    db
      .prepare("SELECT COUNT(*) AS n FROM card_review WHERE date(at) = ?")
      .get(today()) as { n: number }
  ).n;
  let coins = 0;
  if (done % 10 === 0) {
    const res = earn({
      amount: getRules().focus25,
      kind: "focus",
      refId: `cards:${today()}:${done}`,
      note: "复习卡片",
    });
    if (res.ok) coins = res.amount;
  }

  return c.json({
    ...(db.prepare(`SELECT ${CARD_COLS} FROM card WHERE id = ?`).get(id) as object),
    coins,
  });
});

/** 学习统计：今日复习张数、到期数、各科目掌握度 */
p5.get("/study/stats", (c) => {
  const db = getDb();
  const d = c.req.query("date") ?? today();
  const reviewedToday = (
    db.prepare("SELECT COUNT(*) AS n FROM card_review WHERE date(at) = ?").get(d) as { n: number }
  ).n;
  const due = (
    db
      .prepare("SELECT COUNT(*) AS n FROM card WHERE deleted_at IS NULL AND due_date <= ?")
      .get(d) as { n: number }
  ).n;
  const total = (db.prepare("SELECT COUNT(*) AS n FROM card WHERE deleted_at IS NULL").get() as { n: number }).n;
  const byBox = db
    .prepare("SELECT box, COUNT(*) AS n FROM card WHERE deleted_at IS NULL GROUP BY box")
    .all();
  return c.json({ date: d, reviewedToday, due, total, byBox });
});

/* ---------------- 考试 ---------------- */

p5.get("/study/exams", (c) => {
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.title, e.date, e.subject_id, s.name AS subject_name
         FROM exam e LEFT JOIN subject s ON s.id = e.subject_id
        WHERE e.deleted_at IS NULL ORDER BY e.date`,
    )
    .all();
  return c.json(rows);
});

p5.post("/study/exams", async (c) => {
  const r = await readBody(
    c,
    z.object({ title: z.string().trim().min(1).max(60), date: z.string().regex(DATE_RE), subjectId: z.string().optional() }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);
  const db = getDb();
  const id = uid();
  db.prepare("INSERT INTO exam (id, subject_id, title, date) VALUES (?, ?, ?, ?)").run(
    id,
    r.data.subjectId ?? null,
    r.data.title,
    r.data.date,
  );
  return c.json(db.prepare("SELECT * FROM exam WHERE id = ?").get(id), 201);
});

p5.delete("/study/exams/:id", (c) => {
  getDb().prepare("UPDATE exam SET deleted_at = datetime('now') WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});
