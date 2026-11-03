import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db.ts";
import { buildWeek, isoWeekOf, weekId } from "../week.ts";
import { parseTimetableImage } from "../lib/kimi.ts";
import {
  DEFAULT_PERIODS,
  getSetting,
  resolvePeriods,
  setSetting,
  type PeriodsConfig,
} from "../lib/settings.ts";

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

/** 1 = 周一 … 7 = 周日 */
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00`).getDay() || 7;
}

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

  const courses = db
    .prepare(
      `SELECT id, name, weekday, start_min, end_min, location, color
         FROM course WHERE archived = 0 AND weekday = ?
        ORDER BY start_min`,
    )
    .all(weekdayOf(date)) as Row[];

  return c.json({ date, week, tasks, blocks, habits, journal, courses });
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
  const db = getDb();

  // 同一时刻不能有两件事：服务端也拒一次，别只靠前端置灰
  const clash = db
    .prepare(
      `SELECT id, title, start_min, end_min FROM time_block
        WHERE date = ? AND deleted_at IS NULL AND ? < end_min AND ? > start_min
        LIMIT 1`,
    )
    .get(date, r.data.startMin, r.data.endMin) as
    | { id: string; title: string; start_min: number; end_min: number }
    | undefined;
  if (clash) {
    return c.json(
      { error: "overlap", clash: { title: clash.title, startMin: clash.start_min, endMin: clash.end_min } },
      409,
    );
  }

  // 课表时间也属于已占用
  const courseClash = db
    .prepare(
      `SELECT name, start_min, end_min FROM course
        WHERE archived = 0 AND weekday = ? AND ? < end_min AND ? > start_min
        LIMIT 1`,
    )
    .get(weekdayOf(date), r.data.startMin, r.data.endMin) as
    | { name: string; start_min: number; end_min: number }
    | undefined;
  if (courseClash) {
    return c.json(
      {
        error: "overlap",
        clash: { title: courseClash.name, startMin: courseClash.start_min, endMin: courseClash.end_min },
      },
      409,
    );
  }

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

/* ---------------- courses ---------------- */

const COURSE_COLS = "id, name, weekday, start_min, end_min, location, color";

api.get("/courses", (c) => {
  const rows = getDb()
    .prepare(
      `SELECT ${COURSE_COLS} FROM course WHERE archived = 0 ORDER BY weekday, start_min`,
    )
    .all();
  return c.json(rows);
});

const courseCreate = z
  .object({
    name: z.string().trim().min(1).max(60),
    weekday: z.number().int().min(1).max(7),
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
    location: z.string().trim().max(60).optional(),
  })
  .refine((v) => v.endMin > v.startMin, { message: "endMin must be > startMin" });

api.post("/courses", async (c) => {
  const r = await readBody(c, courseCreate);
  if (!r.ok) return c.json({ error: r.error }, 400);
  const db = getDb();

  const clash = db
    .prepare(
      `SELECT name, start_min, end_min FROM course
        WHERE archived = 0 AND weekday = ? AND ? < end_min AND ? > start_min
        LIMIT 1`,
    )
    .get(r.data.weekday, r.data.startMin, r.data.endMin) as
    | { name: string; start_min: number; end_min: number }
    | undefined;
  if (clash) {
    return c.json(
      {
        error: "overlap",
        clash: { title: clash.name, startMin: clash.start_min, endMin: clash.end_min },
      },
      409,
    );
  }

  const id = uid();
  db.prepare(
    `INSERT INTO course (id, name, weekday, start_min, end_min, location)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, r.data.name, r.data.weekday, r.data.startMin, r.data.endMin, r.data.location ?? null);

  return c.json(db.prepare(`SELECT ${COURSE_COLS} FROM course WHERE id = ?`).get(id), 201);
});

api.delete("/courses/:id", (c) => {
  getDb()
    .prepare("UPDATE course SET archived = 1, updated_at = datetime('now') WHERE id = ?")
    .run(c.req.param("id"));
  return c.json({ ok: true });
});

/* ---------------- periods & timetable import ---------------- */

api.get("/settings/periods", (c) => c.json(getSetting<PeriodsConfig>("periods", DEFAULT_PERIODS)));

api.put("/settings/periods", async (c) => {
  const r = await readBody(
    c,
    z.object({
      firstStart: z.string().regex(/^\d{2}:\d{2}$/),
      lessonMin: z.number().int().min(20).max(120),
      breakMin: z.number().int().min(0).max(60),
      count: z.number().int().min(1).max(20),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);
  setSetting("periods", r.data);
  return c.json(r.data);
});

const toMinOf = (s?: string): number | null => {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

api.post("/courses/parse-image", async (c) => {
  const r = await readBody(
    c,
    z.object({ imageBase64: z.string().min(100), mimeType: z.string().default("image/png") }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  let parsed;
  try {
    parsed = await parseTimetableImage(r.data.imageBase64, r.data.mimeType ?? "image/png");
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOKEY") {
      return c.json({ error: "nokey", message: "没有配置 Kimi API Key" }, 400);
    }
    return c.json({ error: "vision_failed", message: msg }, 502);
  }

  const cfg = getSetting<PeriodsConfig>("periods", DEFAULT_PERIODS);

  const candidates = parsed.map((p, i) => {
    const weekday = Number(p.weekday);
    const byPeriod = resolvePeriods(p.startPeriod, p.endPeriod, cfg);
    const startMin = byPeriod ? byPeriod.startMin : toMinOf(p.startTime);
    const endMin = byPeriod ? byPeriod.endMin : toMinOf(p.endTime);
    const name = (p.name ?? "").trim();
    const ok =
      Boolean(name) &&
      Number.isInteger(weekday) &&
      weekday >= 1 &&
      weekday <= 7 &&
      startMin !== null &&
      endMin !== null &&
      endMin > startMin;
    return {
      key: `cand-${i}`,
      name,
      weekday: Number.isInteger(weekday) ? weekday : null,
      startMin,
      endMin,
      location: (p.location ?? "").trim(),
      ok,
    };
  });

  return c.json({ candidates, periods: cfg });
});

api.post("/courses/bulk", async (c) => {
  const r = await readBody(
    c,
    z.object({
      courses: z
        .array(
          z.object({
            name: z.string().trim().min(1).max(60),
            weekday: z.number().int().min(1).max(7),
            startMin: z.number().int().min(0).max(1440),
            endMin: z.number().int().min(0).max(1440),
            location: z.string().trim().max(60).optional(),
          }),
        )
        .min(1)
        .max(80),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  let inserted = 0;
  const skipped: { name: string; reason: string }[] = [];

  for (const course of r.data.courses) {
    if (course.endMin <= course.startMin) {
      skipped.push({ name: course.name, reason: "invalid-range" });
      continue;
    }
    const clash = db
      .prepare(
        `SELECT id FROM course WHERE archived = 0 AND weekday = ?
           AND ? < end_min AND ? > start_min LIMIT 1`,
      )
      .get(course.weekday, course.startMin, course.endMin);
    if (clash) {
      skipped.push({ name: course.name, reason: "overlap" });
      continue;
    }
    db.prepare(
      `INSERT INTO course (id, name, weekday, start_min, end_min, location)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(uid(), course.name, course.weekday, course.startMin, course.endMin, course.location ?? null);
    inserted += 1;
  }

  return c.json({ inserted, skipped });
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

  const courses = db
    .prepare(
      `SELECT ${COURSE_COLS} FROM course WHERE archived = 0 ORDER BY weekday, start_min`,
    )
    .all() as Row[];

  return c.json({ week: info, weekId: weekId(year, week), tasks, blocks, courses });
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
