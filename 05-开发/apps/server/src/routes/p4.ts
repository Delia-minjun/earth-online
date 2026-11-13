import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db.ts";
import { today } from "../lib/dates.ts";
import { earn, getRules } from "../lib/coins.ts";

export const p4 = new Hono();

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

const SESSION_COLS =
  "id, date, kind, task_id, started_at, planned_min, ended_at, actual_sec, status, block_id";

/* 当前正在跑的会话：多端互斥靠它（同一时刻只允许一个） */
p4.get("/focus/active", (c) => {
  const row = getDb()
    .prepare(`SELECT ${SESSION_COLS} FROM focus_session WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`)
    .get();
  return c.json(row ?? null);
});

p4.get("/focus/recent", (c) => {
  const date = c.req.query("date") ?? today();
  const rows = getDb()
    .prepare(
      `SELECT ${SESSION_COLS} FROM focus_session
        WHERE date = ? AND status != 'running' ORDER BY started_at DESC LIMIT 20`,
    )
    .all(date);
  return c.json(rows);
});

p4.post("/focus/start", async (c) => {
  const r = await readBody(
    c,
    z.object({
      kind: z.enum(["focus", "break"]).default("focus"),
      plannedMin: z.number().int().min(0).max(240).default(25),
      taskId: z.string().nullable().optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const running = db
    .prepare(`SELECT ${SESSION_COLS} FROM focus_session WHERE status = 'running' LIMIT 1`)
    .get();
  if (running) return c.json({ error: "busy", session: running }, 409);

  const id = uid();
  const startedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO focus_session (id, date, kind, task_id, started_at, planned_min) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, today(), r.data.kind, r.data.taskId ?? null, startedAt, r.data.plannedMin);

  return c.json(
    db.prepare(`SELECT ${SESSION_COLS} FROM focus_session WHERE id = ?`).get(id),
    201,
  );
});

/**
 * 结束会话：需要前端点「完成」确认（防挂机）。
 * - 实际时长按时间戳算，不信前端传的秒数（前端只用来对时）
 * - 专注会话自动写一条时间块（来源 focus）
 * - 每满 25 分钟发 focus25 币，一次会话只发一次
 */
p4.post("/focus/:id/finish", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const s = db
    .prepare(`SELECT ${SESSION_COLS} FROM focus_session WHERE id = ? AND status = 'running'`)
    .get(id) as
    | {
        date: string;
        kind: string;
        task_id: string | null;
        started_at: string;
        planned_min: number;
      }
    | undefined;
  if (!s) return c.json({ error: "not found" }, 404);

  const endedAt = new Date();
  const actualSec = Math.max(
    0,
    Math.round((endedAt.getTime() - new Date(s.started_at).getTime()) / 1000),
  );

  let blockId: string | null = null;
  let coins = 0;

  if (s.kind === "focus" && actualSec >= 60) {
    const start = new Date(s.started_at);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = Math.min(24 * 60, startMin + Math.round(actualSec / 60));
    const task = s.task_id
      ? (db.prepare("SELECT title FROM task WHERE id = ?").get(s.task_id) as { title: string } | undefined)
      : undefined;
    const title = task?.title ?? "专注";

    blockId = uid();
    db.prepare(
      `INSERT INTO time_block (id, date, start_min, end_min, title, category_id, source)
       VALUES (?, ?, ?, ?, ?, ?, 'focus')`,
    ).run(blockId, s.date, startMin, endMin, title, "cat-study");

    const rules = getRules();
    const chunks = Math.floor(actualSec / (25 * 60));
    if (chunks > 0) {
      const res = earn({
        amount: chunks * rules.focus25,
        kind: "focus",
        refId: id,
        note: title,
        date: s.date,
      });
      if (res.ok) coins = res.amount;
    }
  }

  db.prepare(
    `UPDATE focus_session SET status = 'done', ended_at = ?, actual_sec = ?, block_id = ? WHERE id = ?`,
  ).run(endedAt.toISOString(), actualSec, blockId, id);

  return c.json({
    ...(db.prepare(`SELECT ${SESSION_COLS} FROM focus_session WHERE id = ?`).get(id) as object),
    coins,
  });
});

/** 作废：不写时间块、不发币 */
p4.post("/focus/:id/void", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const s = db.prepare("SELECT id FROM focus_session WHERE id = ? AND status = 'running'").get(id);
  if (!s) return c.json({ error: "not found" }, 404);
  db.prepare(`UPDATE focus_session SET status = 'void', ended_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id,
  );
  return c.json({ ok: true });
});
