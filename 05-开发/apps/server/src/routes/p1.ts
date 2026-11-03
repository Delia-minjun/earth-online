import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db.ts";
import { buildWeek, isoWeekOf, weekId } from "../week.ts";

export const api = new Hono();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const zDate = z.string().regex(DATE_RE, "expected yyyy-mm-dd");

type Row = Record<string, unknown>;

function ensureWeek(isoYear: number, isoWeek: number) {
  const info = buildWeek(isoYear, isoWeek);
  getDb()
    .prepare(
      `INSERT INTO week (id, iso_year, iso_week, start_date) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(info.id, isoYear, isoWeek, info.startDate);
  return info;
}

function weekOfDate(date: string) {
  const { isoYear, isoWeek } = isoWeekOf(new Date(`${date}T00:00:00`));
  return ensureWeek(isoYear, isoWeek);
}

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const uid = () => crypto.randomUUID();

async function readBody<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false as const, error: "invalid json" };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  return { ok: true as const, data: parsed.data };
}

/* ---------------- meta ---------------- */

api.get("/meta", (c) => {
  const db = getDb();
  return c.json({
    areas: db.prepare("SELECT id, name, name_en, color FROM area WHERE archived = 0 ORDER BY sort").all() as Row[],
    categories: db.prepare("SELECT id, name, name_en, color FROM category ORDER BY sort").all() as Row[],
    today: today(),
  });
});

/* ---------------- day ---------------- */

api.get("/day", (c) => {
  const date = c.req.query("date") ?? today();
  const week = weekOfDate(date);
  const db = getDb();

  const tasks = db
    .prepare(
      `SELECT id, title, status, priority, scheduled_date, done_at, area_id, is_focus
         FROM task
        WHERE deleted_at IS NULL
          AND (scheduled_date = ? OR (is_focus = 1 AND scheduled_date IS NULL AND status != 'done'))
        ORDER BY status = 'done', priority DESC, created_at ASC`,
    )
    .all(date) as Row[];

  const blocks = db
    .prepare(
      `SELECT b.id, b.start_min, b.end_min, b.title, b.category_id, b.source, c.name AS category_name, c.color AS category_color
         FROM time_block b LEFT JOIN category c ON c.id = b.category_id
        WHERE b.date = ? AND b.deleted_at IS NULL
        ORDER BY b.start_min`,
    )
    .all(date) as Row[];

  const habits = db
    .prepare(
      `SELECT h.id, h.name, COALESCE(l.done, 0) AS done
         FROM habit h
         LEFT JOIN habit_log l ON l.habit_id = h.id AND l.date = ?
        WHERE h.archived = 0
        ORDER BY h.sort`,
    )
    .all(date) as Row[];

  const journal = (db
    .prepare("SELECT date, mood, body FROM journal_entry WHERE date = ?")
    .get(date) ?? null) as Row | null;

  return c.json({ date, week, tasks, blocks, habits, journal });
});

/* ---------------- tasks ---------------- */

const taskCreate = z.object({
  title: z.string().trim().min(1).max(200),
  date: zDate.optional(),
  areaId: z.string().optional(),
  priority: z.number().int().min(0).max(9).optional(),
});

api.post("/tasks", async (c) => {
  const r = await readBody(c, taskCreate);
  if (!r.ok) return c.json({ error: r.error }, 400);

  const date = r.data.date ?? today();
  const week = weekOfDate(date);
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO task (id, week_id, title, status, priority, scheduled_date, is_focus, area_id)
       VALUES (?, ?, ?, 'todo', ?, ?, 1, ?)`,
    )
    .run(id, week.id, r.data.title, r.data.priority ?? 0, date, r.data.areaId ?? null);

  const row = getDb().prepare("SELECT * FROM task WHERE id = ?").get(id);
  return c.json(row, 201);
});

const taskPatch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["todo", "doing", "done", "dropped"]).optional(),
  date: zDate.nullable().optional(),
});

api.patch("/tasks/:id", async (c) => {
  const id = c.req.param("id");
  const r = await readBody(c, taskPatch);
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const exists = db.prepare("SELECT id FROM task WHERE id = ? AND deleted_at IS NULL").get(id);
  if (!exists) return c.json({ error: "not found" }, 404);

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (r.data.title !== undefined) {
    sets.push("title = ?");
    vals.push(r.data.title);
  }
  if (r.data.status !== undefined) {
    sets.push("status = ?");
    vals.push(r.data.status);
    sets.push("done_at = ?");
    vals.push(r.data.status === "done" ? new Date().toISOString() : null);
  }
  if (r.data.date !== undefined) {
    sets.push("scheduled_date = ?");
    vals.push(r.data.date);
  }
  if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);

  sets.push("updated_at = datetime('now')");
  vals.push(id);
  db.prepare(`UPDATE task SET ${sets.join(", ")} WHERE id = ?`).run(...(vals as never[]));

  return c.json(db.prepare("SELECT * FROM task WHERE id = ?").get(id));
});

api.delete("/tasks/:id", (c) => {
  const id = c.req.param("id");
  getDb().prepare("UPDATE task SET deleted_at = datetime('now') WHERE id = ?").run(id);
  return c.json({ ok: true });
});

/* ---------------- time blocks ---------------- */

const blockCreate = z
  .object({
    date: zDate.optional(),
    startMin: z.number().int().min(0).max(24 * 60),
    endMin: z.number().int().min(0).max(24 * 60),
    title: z.string().trim().min(1).max(120),
    categoryId: z.string().optional(),
  })
  .refine((v) => v.endMin > v.startMin, { message: "endMin must be > startMin" });

api.post("/blocks", async (c) => {
  const r = await readBody(c, blockCreate);
  if (!r.ok) return c.json({ error: r.error }, 400);

  const date = r.data.date ?? today();
  const id = uid();
  getDb()
    .prepare(
      `INSERT INTO time_block (id, date, start_min, end_min, title, category_id, source)
       VALUES (?, ?, ?, ?, ?, ?, 'plan')`,
    )
    .run(id, date, r.data.startMin, r.data.endMin, r.data.title, r.data.categoryId ?? null);
  return c.json(getDb().prepare("SELECT * FROM time_block WHERE id = ?").get(id), 201);
});

api.delete("/blocks/:id", (c) => {
  const id = c.req.param("id");
  getDb().prepare("UPDATE time_block SET deleted_at = datetime('now') WHERE id = ?").run(id);
  return c.json({ ok: true });
});

/* ---------------- habits ---------------- */

api.post("/habits", async (c) => {
  const r = await readBody(c, z.object({ name: z.string().trim().min(1).max(40) }));
  if (!r.ok) return c.json({ error: r.error }, 400);
  const id = uid();
  const db = getDb();
  const next = (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM habit").get() as { n: number }).n;
  db.prepare("INSERT INTO habit (id, name, sort) VALUES (?, ?, ?)").run(id, r.data.name, next);
  return c.json(db.prepare("SELECT * FROM habit WHERE id = ?").get(id), 201);
});

api.delete("/habits/:id", (c) => {
  getDb().prepare("UPDATE habit SET archived = 1 WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

api.post("/habits/:id/toggle", async (c) => {
  const r = await readBody(c, z.object({ date: zDate.optional() }));
  if (!r.ok) return c.json({ error: r.error }, 400);
  const date = r.data.date ?? today();
  const id = c.req.param("id");
  const db = getDb();
  const existing = db
    .prepare("SELECT done FROM habit_log WHERE habit_id = ? AND date = ?")
    .get(id, date) as { done: number } | undefined;
  if (existing) {
    db.prepare("DELETE FROM habit_log WHERE habit_id = ? AND date = ?").run(id, date);
    return c.json({ habitId: id, date, done: 0 });
  }
  db.prepare("INSERT INTO habit_log (habit_id, date, done) VALUES (?, ?, 1)").run(id, date);
  return c.json({ habitId: id, date, done: 1 });
});

/* ---------------- journal ---------------- */

api.put("/journal/:date", async (c) => {
  const date = c.req.param("date");
  if (!DATE_RE.test(date)) return c.json({ error: "bad date" }, 400);
  const r = await readBody(c, z.object({ body: z.string().max(20000), mood: z.number().int().min(1).max(5).nullable().optional() }));
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  db.prepare(
    `INSERT INTO journal_entry (date, body, mood, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET body = excluded.body, mood = COALESCE(excluded.mood, journal_entry.mood), updated_at = datetime('now')`,
  ).run(date, r.data.body, r.data.mood ?? null);
  return c.json(db.prepare("SELECT date, mood, body FROM journal_entry WHERE date = ?").get(date));
});

/* ---------------- week ---------------- */

api.get("/week/current", (c) => {
  const { isoYear, isoWeek } = isoWeekOf(new Date());
  return c.json(ensureWeek(isoYear, isoWeek));
});

api.get("/week/:year/:week", (c) => {
  const year = Number(c.req.param("year"));
  const week = Number(c.req.param("week"));
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
    return c.json({ error: "bad week" }, 400);
  }
  const info = ensureWeek(year, week);
  const db = getDb();

  const tasks = db
    .prepare(
      `SELECT id, title, status, scheduled_date, priority, is_focus
         FROM task WHERE deleted_at IS NULL AND scheduled_date BETWEEN ? AND ?
        ORDER BY scheduled_date, priority DESC`,
    )
    .all(info.startDate, info.endDate) as Row[];

  const blocks = db
    .prepare(
      `SELECT b.id, b.date, b.start_min, b.end_min, b.title, b.category_id, c.color AS category_color
         FROM time_block b LEFT JOIN category c ON c.id = b.category_id
        WHERE b.deleted_at IS NULL AND b.date BETWEEN ? AND ?
        ORDER BY b.date, b.start_min`,
    )
    .all(info.startDate, info.endDate) as Row[];

  return c.json({ week: info, weekId: weekId(year, week), tasks, blocks });
});

/* ---------------- weekly review ---------------- */

api.get("/review/:weekId", (c) => {
  const weekIdParam = c.req.param("weekId");
  const row = getDb().prepare("SELECT * FROM weekly_review WHERE week_id = ?").get(weekIdParam);
  return c.json(row ?? { week_id: weekIdParam, keep: "", improve: "", stop: "", start: "" });
});

api.put("/review/:weekId", async (c) => {
  const weekIdParam = c.req.param("weekId");
  const r = await readBody(
    c,
    z.object({
      keep: z.string().max(4000).optional(),
      improve: z.string().max(4000).optional(),
      stop: z.string().max(4000).optional(),
      start: z.string().max(4000).optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const cur = (db.prepare("SELECT * FROM weekly_review WHERE week_id = ?").get(weekIdParam) ?? {
    keep: "",
    improve: "",
    stop: "",
    start: "",
  }) as Record<string, string>;
  db.prepare(
    `INSERT INTO weekly_review (week_id, keep, improve, stop, start, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(week_id) DO UPDATE SET
       keep = excluded.keep, improve = excluded.improve, stop = excluded.stop, start = excluded.start, updated_at = datetime('now')`,
  ).run(
    weekIdParam,
    r.data.keep ?? cur.keep ?? "",
    r.data.improve ?? cur.improve ?? "",
    r.data.stop ?? cur.stop ?? "",
    r.data.start ?? cur.start ?? "",
  );
  return c.json(db.prepare("SELECT * FROM weekly_review WHERE week_id = ?").get(weekIdParam));
});
