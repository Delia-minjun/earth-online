import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db.ts";
import { DATE_RE } from "../lib/dates.ts";
import { addXp, earn } from "../lib/coins.ts";

export const p6 = new Hono();

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

interface MilestoneRow {
  id: string;
  coins: number;
  months: number | null;
  title: string;
  area_id: string | null;
  due_date: string | null;
  note: string | null;
  done_at: string | null;
  sort: number;
}

/** 里程碑 = 阶段目标；下面挂少量可验证的小步 */
p6.get("/milestones", (c) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT m.id, m.title, m.area_id, m.due_date, m.months, m.note, m.done_at, m.sort, m.coins,
              a.name AS area_name, a.color AS area_color
         FROM milestone m LEFT JOIN area a ON a.id = m.area_id
        WHERE m.deleted_at IS NULL
        ORDER BY (m.done_at IS NOT NULL), m.sort, m.created_at`,
    )
    .all() as unknown as (MilestoneRow & { area_name: string | null; area_color: string | null })[];

  const steps = db
    .prepare(
      `SELECT id, milestone_id, title, done_at, sort FROM milestone_step ORDER BY sort, rowid`,
    )
    .all() as { id: string; milestone_id: string; title: string; done_at: string | null; sort: number }[];

  const byMilestone = new Map<string, typeof steps>();
  for (const s of steps) {
    const list = byMilestone.get(s.milestone_id) ?? [];
    list.push(s);
    byMilestone.set(s.milestone_id, list);
  }
  return c.json(rows.map((m) => ({ ...m, steps: byMilestone.get(m.id) ?? [] })));
});

const milestoneBody = z.object({
  title: z.string().trim().min(1).max(80),
  areaId: z.string().nullable().optional(),
  dueDate: z.string().regex(DATE_RE).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
  steps: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  coins: z.number().int().min(0).max(1000).optional(),
  months: z.number().int().min(1).max(60).nullable().optional(),
});

p6.post("/milestones", async (c) => {
  const r = await readBody(c, milestoneBody);
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const id = uid();
  const next = (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM milestone").get() as { n: number }).n;
  // 有月数就用「开始日 + N 个月」推导到期日，避免手填日期
  const months = r.data.months ?? null;
  const dueDate =
    months !== null
      ? (
          db
            .prepare("SELECT date('now', ?) AS d")
            .get(`+${months} months`) as { d: string }
        ).d
      : (r.data.dueDate ?? null);

  db.prepare(
    `INSERT INTO milestone (id, title, area_id, due_date, months, note, sort, coins)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    r.data.title,
    r.data.areaId ?? null,
    dueDate,
    months,
    r.data.note ?? null,
    next,
    r.data.coins ?? 30,
  );

  const ins = db.prepare("INSERT INTO milestone_step (id, milestone_id, title, sort) VALUES (?, ?, ?, ?)");
  (r.data.steps ?? []).forEach((t, i) => ins.run(uid(), id, t, i));

  return c.json(db.prepare("SELECT * FROM milestone WHERE id = ?").get(id), 201);
});

p6.patch("/milestones/:id", async (c) => {
  const id = c.req.param("id");
  const r = await readBody(
    c,
    z.object({
      title: z.string().trim().min(1).max(80).optional(),
      areaId: z.string().nullable().optional(),
      dueDate: z.string().regex(DATE_RE).nullable().optional(),
      note: z.string().trim().max(200).nullable().optional(),
      done: z.boolean().optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const cur = db.prepare("SELECT * FROM milestone WHERE id = ? AND deleted_at IS NULL").get(id) as
    | MilestoneRow
    | undefined;
  if (!cur) return c.json({ error: "not found" }, 404);

  const wasDone = Boolean(cur.done_at);
  const nowDone = r.data.done ?? wasDone;

  db.prepare(
    `UPDATE milestone SET title = ?, area_id = ?, due_date = ?, note = ?, done_at = ? WHERE id = ?`,
  ).run(
    r.data.title ?? cur.title,
    r.data.areaId !== undefined ? r.data.areaId : cur.area_id,
    r.data.dueDate !== undefined ? r.data.dueDate : cur.due_date,
    r.data.note !== undefined ? r.data.note : cur.note,
    nowDone ? cur.done_at ?? new Date().toISOString() : null,
    id,
  );

  // 第一次标记完成时：给主领域一笔经验 + 里程碑币（refId 去重，反复勾不重复发）
  if (!wasDone && nowDone) {
    if (cur.area_id) addXp(cur.area_id, 60, "milestone", id);
    if (cur.coins > 0) {
      earn({ amount: cur.coins, kind: "milestone", refId: id, note: cur.title });
    }
  }

  return c.json(db.prepare("SELECT * FROM milestone WHERE id = ?").get(id));
});

p6.delete("/milestones/:id", (c) => {
  getDb().prepare("UPDATE milestone SET deleted_at = datetime('now') WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

/* ---------------- 小步 ---------------- */

p6.post("/milestones/:id/steps", async (c) => {
  const id = c.req.param("id");
  const r = await readBody(c, z.object({ title: z.string().trim().min(1).max(80) }));
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM milestone WHERE id = ? AND deleted_at IS NULL").get(id);
  if (!exists) return c.json({ error: "not found" }, 404);

  const sid = uid();
  const next = (
    db
      .prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM milestone_step WHERE milestone_id = ?")
      .get(id) as { n: number }
  ).n;
  db.prepare("INSERT INTO milestone_step (id, milestone_id, title, sort) VALUES (?, ?, ?, ?)").run(
    sid,
    id,
    r.data.title,
    next,
  );
  return c.json(db.prepare("SELECT * FROM milestone_step WHERE id = ?").get(sid), 201);
});

p6.patch("/milestone-steps/:id", async (c) => {
  const id = c.req.param("id");
  const r = await readBody(c, z.object({ done: z.boolean(), title: z.string().trim().min(1).max(80).optional() }));
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const cur = db.prepare("SELECT * FROM milestone_step WHERE id = ?").get(id) as
    | { title: string; done_at: string | null }
    | undefined;
  if (!cur) return c.json({ error: "not found" }, 404);

  db.prepare("UPDATE milestone_step SET title = ?, done_at = ? WHERE id = ?").run(
    r.data.title ?? cur.title,
    r.data.done ? cur.done_at ?? new Date().toISOString() : null,
    id,
  );
  return c.json(db.prepare("SELECT * FROM milestone_step WHERE id = ?").get(id));
});

p6.delete("/milestone-steps/:id", (c) => {
  getDb().prepare("DELETE FROM milestone_step WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});
