import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db.ts";
import { getSetting, setSetting } from "../lib/settings.ts";
import { DATE_RE, MONTH_RE, today } from "../lib/dates.ts";

export const p2 = new Hono();

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

/* ---------------- 记账 ---------------- */

/* ---------------- 记账 ---------------- */

const moneyCreate = z.object({
  date: z.string().regex(DATE_RE).optional(),
  kind: z.enum(["expense", "income"]).default("expense"),
  amount: z.number().positive().max(1_000_000),
  categoryId: z.string().optional(),
  note: z.string().trim().max(200).optional(),
});

p2.get("/money/categories", (c) => {
    const rows = getDb()
      .prepare(
        `SELECT id, name, name_en AS nameEn, kind, color, sort
           FROM money_category WHERE archived = 0 ORDER BY kind, sort`,
      )
      .all();
    return c.json(rows);
  });

  p2.post("/money/categories", async (c) => {
    const r = await readBody(
      c,
      z.object({
        name: z.string().trim().min(1).max(12),
        kind: z.enum(["expense", "income"]).default("expense"),
        color: z.string().optional(),
      }),
    );
    if (!r.ok) return c.json({ error: r.error }, 400);
    const db = getDb();
    const id = uid();
    const next = (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM money_category").get() as { n: number }).n;
    db.prepare("INSERT INTO money_category (id, name, kind, color, sort) VALUES (?, ?, ?, ?, ?)").run(
      id,
      r.data.name,
      r.data.kind,
      r.data.color ?? null,
      next,
    );
    return c.json(db.prepare("SELECT * FROM money_category WHERE id = ?").get(id), 201);
  });

  p2.delete("/money/categories/:id", (c) => {
    getDb().prepare("UPDATE money_category SET archived = 1 WHERE id = ?").run(c.req.param("id"));
    return c.json({ ok: true });
  });

  p2.get("/money", (c) => {
    const month = c.req.query("month") ?? today().slice(0, 7);
    if (!MONTH_RE.test(month)) return c.json({ error: "bad month" }, 400);

    const db = getDb();
    const rows = db
      .prepare(
        `SELECT m.id, m.date, m.kind, m.amount, m.category_id AS categoryId, m.note,
                c.name AS categoryName, c.color AS categoryColor
           FROM money_entry m
           LEFT JOIN money_category c ON c.id = m.category_id
          WHERE m.deleted_at IS NULL AND substr(m.date, 1, 7) = ?
          ORDER BY m.date DESC, m.created_at DESC`,
      )
      .all(month) as Array<{ kind: string; amount: number; categoryId: string | null; categoryName: string | null }>;

    let expense = 0;
    let income = 0;
    const byCategory: Record<string, { name: string; amount: number; color: string | null }> = {};
    for (const r of rows) {
      if (r.kind === "income") {
        income += r.amount;
        continue;
      }
      expense += r.amount;
      const key = r.categoryId ?? "uncategorized";
      const bucket = (byCategory[key] ??= {
        name: r.categoryName ?? "未分类",
        amount: 0,
        color: null,
      });
      bucket.amount += r.amount;
    }

    return c.json({ month, entries: rows, summary: { expense, income, byCategory } });
  });

  p2.post("/money", async (c) => {
    const r = await readBody(c, moneyCreate);
    if (!r.ok) return c.json({ error: r.error }, 400);

    const db = getDb();
    const id = uid();
    const date = r.data.date ?? today();
    db.prepare(
      `INSERT INTO money_entry (id, date, kind, amount, category_id, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, date, r.data.kind, r.data.amount, r.data.categoryId ?? null, r.data.note ?? null);
    return c.json(db.prepare("SELECT * FROM money_entry WHERE id = ?").get(id), 201);
  });

  p2.delete("/money/:id", (c) => {
    getDb().prepare("UPDATE money_entry SET deleted_at = datetime('now') WHERE id = ?").run(c.req.param("id"));
    return c.json({ ok: true });
  });

  /* ---------------- 类别字典 ---------------- */

  p2.get("/categories", (c) => {
    const rows = getDb()
      .prepare("SELECT id, name, name_en AS nameEn, color, sort FROM category ORDER BY sort")
      .all();
    return c.json(rows);
  });

  p2.post("/categories", async (c) => {
    const r = await readBody(
      c,
      z.object({ name: z.string().trim().min(1).max(12), color: z.string().optional() }),
    );
    if (!r.ok) return c.json({ error: r.error }, 400);
    const db = getDb();
    const id = uid();
    const next = (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM category").get() as { n: number }).n;
    db.prepare("INSERT INTO category (id, name, color, sort) VALUES (?, ?, ?, ?)").run(
      id,
      r.data.name,
      r.data.color ?? "#9BA7B0",
      next,
    );
    return c.json(db.prepare("SELECT * FROM category WHERE id = ?").get(id), 201);
  });

  p2.patch("/categories/:id", async (c) => {
    const id = c.req.param("id");
    const r = await readBody(
      c,
      z.object({ name: z.string().trim().min(1).max(12).optional(), color: z.string().optional() }),
    );
    if (!r.ok) return c.json({ error: r.error }, 400);

    const db = getDb();
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (r.data.name !== undefined) {
      sets.push("name = ?");
      vals.push(r.data.name);
    }
    if (r.data.color !== undefined) {
      sets.push("color = ?");
      vals.push(r.data.color);
    }
    if (!sets.length) return c.json({ error: "nothing to update" }, 400);
    vals.push(id);
    db.prepare(`UPDATE category SET ${sets.join(", ")} WHERE id = ?`).run(...(vals as never[]));
    return c.json(db.prepare("SELECT * FROM category WHERE id = ?").get(id));
  });

  p2.delete("/categories/:id", (c) => {
    // category 表没有 archived 列，这里直接检查有没有被时间块占用
    const db = getDb();
    const id = c.req.param("id");
    const used = db
      .prepare("SELECT COUNT(*) AS n FROM time_block WHERE category_id = ? AND deleted_at IS NULL")
      .get(id) as { n: number };
    if ((used?.n ?? 0) > 0) return c.json({ error: "in use" }, 409);
    db.prepare("DELETE FROM category WHERE id = ?").run(id);
    return c.json({ ok: true });
  });

  p2.patch("/money/categories/:id", async (c) => {
    const id = c.req.param("id");
    const r = await readBody(
      c,
      z.object({
        name: z.string().trim().min(1).max(12).optional(),
        color: z.string().optional(),
      }),
    );
    if (!r.ok) return c.json({ error: r.error }, 400);

    const db = getDb();
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (r.data.name !== undefined) {
      sets.push("name = ?");
      vals.push(r.data.name);
    }
    if (r.data.color !== undefined) {
      sets.push("color = ?");
      vals.push(r.data.color);
    }
    if (!sets.length) return c.json({ error: "nothing to update" }, 400);
    vals.push(id);
    db.prepare(`UPDATE money_category SET ${sets.join(", ")} WHERE id = ?`).run(...(vals as never[]));
    return c.json(db.prepare("SELECT * FROM money_category WHERE id = ?").get(id));
  });

  /* ---------------- 预算 ---------------- */

  const budgetSchema = z.object({
    total: z.number().min(0).max(10_000_000).default(0),
    byCategory: z.record(z.string(), z.number().min(0)).default({}),
  });

  p2.get("/settings/budget", (c) => c.json(getSetting("budget", { total: 0, byCategory: {} })));

  p2.put("/settings/budget", async (c) => {
    const r = await readBody(c, budgetSchema);
    if (!r.ok) return c.json({ error: r.error }, 400);
    setSetting("budget", r.data);
    return c.json(r.data);
  });

  /* ---------------- 身体 ---------------- */

  p2.get("/body", (c) => {
    const from = c.req.query("from") ?? today();
    const to = c.req.query("to") ?? today();
    const rows = getDb()
      .prepare(
        `SELECT date, weight, workout FROM body_log
          WHERE date BETWEEN ? AND ? ORDER BY date`,
      )
      .all(from, to);
    return c.json(rows);
  });

  p2.put("/body/:date", async (c) => {
    const date = c.req.param("date");
    if (!DATE_RE.test(date)) return c.json({ error: "bad date" }, 400);
    const r = await readBody(
      c,
      z.object({
        weight: z.number().min(20).max(300).nullable().optional(),
        workout: z.string().max(60).nullable().optional(),
      }),
    );
    if (!r.ok) return c.json({ error: r.error }, 400);

    const db = getDb();
    const cur = (db.prepare("SELECT * FROM body_log WHERE date = ?").get(date) ?? {
      weight: null,
      workout: null,
    }) as { weight: number | null; workout: string | null };

    db.prepare(
      `INSERT INTO body_log (date, weight, workout, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET
         weight = excluded.weight, workout = excluded.workout, updated_at = datetime('now')`,
    ).run(
      date,
      r.data.weight !== undefined ? r.data.weight : cur.weight,
      r.data.workout !== undefined ? r.data.workout : cur.workout,
    );
    return c.json(db.prepare("SELECT * FROM body_log WHERE date = ?").get(date));
  });

  /* ---------------- 饮食 ---------------- */

  const mealSchema = z.object({
    breakfast: z.string().max(400).optional(),
    lunch: z.string().max(400).optional(),
    dinner: z.string().max(400).optional(),
    snack: z.string().max(400).optional(),
  });

  p2.get("/meals/:date", (c) => {
    const date = c.req.param("date");
    const row = getDb().prepare("SELECT * FROM meal_day WHERE date = ?").get(date);
    return c.json(row ?? { date, breakfast: "", lunch: "", dinner: "", snack: "" });
  });

  p2.put("/meals/:date", async (c) => {
    const date = c.req.param("date");
    if (!DATE_RE.test(date)) return c.json({ error: "bad date" }, 400);
    const r = await readBody(c, mealSchema);
    if (!r.ok) return c.json({ error: r.error }, 400);

    const db = getDb();
    const cur = (db.prepare("SELECT * FROM meal_day WHERE date = ?").get(date) ?? {
      breakfast: "",
      lunch: "",
      dinner: "",
      snack: "",
    }) as Record<string, string>;

    db.prepare(
      `INSERT INTO meal_day (date, breakfast, lunch, dinner, snack, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET
         breakfast = excluded.breakfast, lunch = excluded.lunch,
         dinner = excluded.dinner, snack = excluded.snack, updated_at = datetime('now')`,
    ).run(
      date,
      r.data.breakfast ?? cur.breakfast ?? "",
      r.data.lunch ?? cur.lunch ?? "",
      r.data.dinner ?? cur.dinner ?? "",
      r.data.snack ?? cur.snack ?? "",
    );
    return c.json(db.prepare("SELECT * FROM meal_day WHERE date = ?").get(date));
  });

  /* ---------------- 月历 ---------------- */

  p2.get("/calendar/:month", (c) => {
    const month = c.req.param("month");
    if (!MONTH_RE.test(month)) return c.json({ error: "bad month" }, 400);

    const db = getDb();
    const blocks = db
      .prepare(
        `SELECT date, COUNT(*) AS n, SUM(end_min - start_min) AS minutes
           FROM time_block
          WHERE deleted_at IS NULL AND substr(date, 1, 7) = ?
          GROUP BY date`,
      )
      .all(month) as Array<{ date: string; n: number; minutes: number }>;

    const tasks = db
      .prepare(
        `SELECT scheduled_date AS date, COUNT(*) AS total,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
           FROM task
          WHERE deleted_at IS NULL AND scheduled_date IS NOT NULL AND substr(scheduled_date, 1, 7) = ?
          GROUP BY scheduled_date`,
      )
      .all(month) as Array<{ date: string; total: number; done: number }>;

    const money = db
      .prepare(
        `SELECT date, SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END) AS expense
           FROM money_entry
          WHERE deleted_at IS NULL AND substr(date, 1, 7) = ?
          GROUP BY date`,
      )
      .all(month) as Array<{ date: string; expense: number }>;

    const byDate: Record<string, { blocks: number; minutes: number; tasks: number; done: number; expense: number }> = {};
    const ensure = (date: string) =>
      (byDate[date] ??= { blocks: 0, minutes: 0, tasks: 0, done: 0, expense: 0 });

    for (const b of blocks) {
      const d = ensure(b.date);
      d.blocks = b.n ?? 0;
      d.minutes = b.minutes ?? 0;
    }
    for (const t of tasks) {
      const d = ensure(t.date);
      d.tasks = t.total ?? 0;
      d.done = t.done ?? 0;
    }
    for (const m of money) ensure(m.date).expense = m.expense ?? 0;

    return c.json({ month, byDate });
  });
