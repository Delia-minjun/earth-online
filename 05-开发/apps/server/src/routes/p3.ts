import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db.ts";
import { DATE_RE, today } from "../lib/dates.ts";
import { balance, bumpArea, earn, getRules, saveRules, settleAreas, spend } from "../lib/coins.ts";

export const p3 = new Hono();

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

const ENTRY_COLS = "id, date, amount, kind, ref_id, note, created_at";

function weekStart(d: string): string {
  const date = new Date(`${d}T00:00:00`);
  const dow = date.getDay() || 7; // 周一=1
  date.setDate(date.getDate() - (dow - 1));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/* ---------------- 钱包 ---------------- */

p3.get("/coins", (c) => {
  const d = c.req.query("date") ?? today();
  const db = getDb();
  const wd = weekStart(d);

  const sum = (from: string, to: string, sign: "in" | "out") =>
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS n FROM coin_entry
            WHERE date BETWEEN ? AND ? AND amount ${sign === "in" ? ">" : "<"} 0`,
        )
        .get(from, to) as { n: number }
    ).n;

  const entries = db
    .prepare(`SELECT ${ENTRY_COLS} FROM coin_entry ORDER BY created_at DESC LIMIT 60`)
    .all();

  return c.json({
    date: d,
    balance: balance(),
    todayIn: sum(d, d, "in"),
    todayOut: Math.abs(sum(d, d, "out")),
    weekIn: sum(wd, d, "in"),
    weekOut: Math.abs(sum(wd, d, "out")),
    rules: getRules(),
    entries,
  });
});

p3.get("/coins/entries", (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
  const rows = getDb()
    .prepare(`SELECT ${ENTRY_COLS} FROM coin_entry ORDER BY created_at DESC LIMIT ?`)
    .all(limit);
  return c.json(rows);
});

p3.get("/coins/rules", (c) => c.json(getRules()));

p3.put("/coins/rules", async (c) => {
  const r = await readBody(
    c,
    z.object({
      taskPer30: z.number().min(0).max(100).optional(),
      habit: z.number().min(0).max(100).optional(),
      habitStreak7: z.number().min(0).max(500).optional(),
      focus25: z.number().min(0).max(100).optional(),
      review: z.number().min(0).max(500).optional(),
      dailyCap: z.number().min(0).max(10000).optional(),
      decayPerDay: z.number().min(0).max(0.5).optional(),
      decayFloor: z.number().min(0).max(1).optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);
  saveRules(r.data);
  return c.json(getRules());
});

/* ---------------- 领域进度条 ---------------- */

p3.get("/areas/progress", (c) => {
  const rows = settleAreas();
  const areas = getDb().prepare("SELECT id, name, color FROM area WHERE archived = 0 ORDER BY sort").all() as {
    id: string;
    name: string;
    color: string;
  }[];
  const map = new Map(rows.map((r) => [r.area_id, r.value]));
  return c.json(
    areas.map((a) => ({ id: a.id, name: a.name, color: a.color, pct: map.get(a.id) ?? 0.5 })),
  );
});

/* ---------------- 奖赏商店 ---------------- */

const SHOP_COLS = "id, name, price, money, money_category_id, archived, sort";

p3.get("/rewards", (c) => {
  const rows = getDb()
    .prepare(`SELECT ${SHOP_COLS} FROM reward_item WHERE archived = 0 ORDER BY sort, name`)
    .all();
  return c.json(rows);
});

const rewardBody = z.object({
  name: z.string().trim().min(1).max(30),
  price: z.number().int().min(1).max(100000),
  money: z.number().int().min(0).max(100000).optional(),
  moneyCategoryId: z.string().optional(),
});

p3.post("/rewards", async (c) => {
  const r = await readBody(c, rewardBody);
  if (!r.ok) return c.json({ error: r.error }, 400);
  const db = getDb();
  const id = uid();
  const next =
    (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM reward_item").get() as { n: number }).n;
  db.prepare(
    `INSERT INTO reward_item (id, name, price, money, money_category_id, sort) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, r.data.name, r.data.price, r.data.money ?? 0, r.data.moneyCategoryId ?? null, next);
  return c.json(db.prepare(`SELECT ${SHOP_COLS} FROM reward_item WHERE id = ?`).get(id), 201);
});

p3.patch("/rewards/:id", async (c) => {
  const id = c.req.param("id");
  const r = await readBody(c, rewardBody.partial());
  if (!r.ok) return c.json({ error: r.error }, 400);

  const db = getDb();
  const cur = db.prepare(`SELECT ${SHOP_COLS} FROM reward_item WHERE id = ?`).get(id) as
    | { name: string; price: number; money: number; money_category_id: string | null }
    | undefined;
  if (!cur) return c.json({ error: "not found" }, 404);

  db.prepare(
    `UPDATE reward_item SET name = ?, price = ?, money = ?, money_category_id = ? WHERE id = ?`,
  ).run(
    r.data.name ?? cur.name,
    r.data.price ?? cur.price,
    r.data.money ?? cur.money,
    r.data.moneyCategoryId !== undefined ? r.data.moneyCategoryId : cur.money_category_id,
    id,
  );
  return c.json(db.prepare(`SELECT ${SHOP_COLS} FROM reward_item WHERE id = ?`).get(id));
});

p3.delete("/rewards/:id", (c) => {
  getDb().prepare("UPDATE reward_item SET archived = 1 WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

/** 兑换：先有币才能兑换，不允许透支；若奖赏配了真实金额，同时记一笔支出 */
p3.post("/rewards/:id/redeem", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const item = db
    .prepare(`SELECT ${SHOP_COLS} FROM reward_item WHERE id = ? AND archived = 0`)
    .get(id) as { name: string; price: number; money: number; money_category_id: string | null } | undefined;
  if (!item) return c.json({ error: "not found" }, 404);

  // 防手抖：同一个奖赏 3 秒内重复兑换只算一次（双击、网络重试都挡得住）
  const recent = db
    .prepare(
      `SELECT created_at FROM coin_entry
        WHERE kind = 'redeem' AND ref_id = ?
          AND created_at > datetime('now', '-3 seconds')
        LIMIT 1`,
    )
    .get(id);
  if (recent) return c.json({ error: "duplicate" }, 409);

  const ok = spend({ amount: item.price, kind: "redeem", refId: id, note: item.name });
  if (!ok) return c.json({ error: "insufficient" }, 409);

  if (item.money > 0) {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    db.prepare(
      `INSERT INTO money_entry (id, date, kind, amount, category_id, note, created_at)
       VALUES (?, ?, 'expense', ?, ?, ?, datetime('now'))`,
    ).run(
      uid(),
      today(),
      item.money,
      item.money_category_id ?? null,
      `兑换奖赏：${item.name} · ${time}`,
    );
  }

  return c.json({ ok: true, balance: balance() });
});

/* ---------------- 手动领取（只给复盘之类无法自动判定的） ---------------- */

p3.post("/coins/earn", async (c) => {
  const r = await readBody(
    c,
    z.object({
      kind: z.enum(["review", "bonus"]),
      amount: z.number().int().min(1).max(500),
      date: z.string().regex(DATE_RE).optional(),
      refId: z.string().optional(),
      note: z.string().max(120).optional(),
      areaId: z.string().optional(),
    }),
  );
  if (!r.ok) return c.json({ error: r.error }, 400);

  const res = earn({
    amount: r.data.amount,
    kind: r.data.kind,
    refId: r.data.refId ?? null,
    note: r.data.note ?? null,
    date: r.data.date,
  });
  if (!res.ok) return c.json({ error: res.reason }, 409);

  bumpArea(r.data.areaId, 0.1);
  return c.json({ ok: true, amount: res.amount, balance: balance() });
});
