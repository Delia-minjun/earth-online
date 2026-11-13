import { getDb } from "../db.ts";
import { getSetting, setSetting } from "./settings.ts";
import { today } from "./dates.ts";

/** 价目表：全部可自定义，存在 setting 里，缺字段用默认值补齐 */
export type CoinRules = {
  /** 任务：每满 30 分钟给几币 */
  taskPer30: number;
  /** 习惯打卡一次 */
  habit: number;
  /** 习惯连续 7 天额外奖励 */
  habitStreak7: number;
  /** 专注 25 分钟 */
  focus25: number;
  /** 周复盘 */
  review: number;
  /** 单日发币上限（防刷） */
  dailyCap: number;
  /** 进度条每日衰减比例 */
  decayPerDay: number;
  /** 进度条下限 */
  decayFloor: number;
};

export const DEFAULT_RULES: CoinRules = {
  taskPer30: 3,
  habit: 2,
  habitStreak7: 10,
  focus25: 3,
  review: 10,
  dailyCap: 200,
  decayPerDay: 0.01,
  decayFloor: 0.4,
};

export function getRules(): CoinRules {
  const saved = getSetting<Partial<CoinRules> | null>("coins.rules", null);
  if (!saved) return DEFAULT_RULES;
  return { ...DEFAULT_RULES, ...saved };
}

export function saveRules(patch: Partial<CoinRules>): CoinRules {
  const next = { ...getRules(), ...patch };
  setSetting("coins.rules", next);
  return next;
}

const uid = () => crypto.randomUUID();

export function balance(): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM coin_entry")
    .get() as { n: number };
  return row.n;
}

/** 某天已发放（只看正数）的总和，用于单日上限 */
export function earnedOn(date: string): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM coin_entry WHERE date = ? AND amount > 0")
    .get(date) as { n: number };
  return row.n;
}

/**
 * 记一笔收入。给同一来源重复打分会重复发币，所以调用方要保证幂等
 * （例如用 ref_id 去重）。
 */
export function earn(input: {
  amount: number;
  kind: string;
  refId?: string | null;
  note?: string | null;
  date?: string;
}): { ok: true; amount: number } | { ok: false; reason: "duplicate" | "capped" } {
  const db = getDb();
  const date = input.date ?? today();

  if (input.refId) {
    const dup = db
      .prepare("SELECT 1 FROM coin_entry WHERE kind = ? AND ref_id = ? LIMIT 1")
      .get(input.kind, input.refId);
    if (dup) return { ok: false, reason: "duplicate" };
  }

  const rules = getRules();
  const room = rules.dailyCap - earnedOn(date);
  if (room <= 0) return { ok: false, reason: "capped" };
  const amount = Math.min(input.amount, room);
  if (amount <= 0) return { ok: false, reason: "capped" };

  db.prepare(
    `INSERT INTO coin_entry (id, date, amount, kind, ref_id, note) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(uid(), date, amount, input.kind, input.refId ?? null, input.note ?? null);
  return { ok: true, amount };
}

export function spend(input: {
  amount: number;
  kind: string;
  refId?: string | null;
  note?: string | null;
  date?: string;
}): boolean {
  if (balance() < input.amount) return false; // 不允许透支
  getDb()
    .prepare(
      `INSERT INTO coin_entry (id, date, amount, kind, ref_id, note) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      uid(),
      input.date ?? today(),
      -Math.abs(input.amount),
      input.kind,
      input.refId ?? null,
      input.note ?? null,
    );
  return true;
}

/* ---------------- 领域进度条 ---------------- */

const FLOOR_DEFAULT = 0.4;

type ProgressRow = { value: number; updated_on: string | null };

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function decayedValue(cur: ProgressRow | undefined, date: string, rules: CoinRules): number {
  const value = cur?.value ?? 0.5;
  const days = cur?.updated_on ? daysBetween(cur.updated_on, date) : 0;
  return days > 0
    ? Math.max(rules.decayFloor ?? FLOOR_DEFAULT, value * Math.pow(1 - rules.decayPerDay, days))
    : value;
}

/**
 * 惰性结算：从上次结算日到今天，每过一天按 decayPerDay 相对衰减，永不低于下限。
 * 只动进度条，不碰币与任何记录。
 */
export function settleAreas(): { area_id: string; value: number }[] {
  const db = getDb();
  const rules = getRules();
  const d = today();

  const areas = db.prepare("SELECT id FROM area WHERE archived = 0 ORDER BY sort").all() as {
    id: string;
  }[];

  const rows: { area_id: string; value: number }[] = [];
  for (const area of areas) {
    const cur = db
      .prepare("SELECT value, updated_on FROM area_progress WHERE area_id = ?")
      .get(area.id) as ProgressRow | undefined;

    const value = decayedValue(cur, d, rules);

    db.prepare(
      `INSERT INTO area_progress (area_id, value, updated_on) VALUES (?, ?, ?)
       ON CONFLICT(area_id) DO UPDATE SET value = excluded.value, updated_on = excluded.updated_on`,
    ).run(area.id, value, d);

    rows.push({ area_id: area.id, value });
  }
  return rows;
}

/** 某领域有行为时给进度条加一笔，上限 1 */
export function bumpArea(areaId: string | null | undefined, delta = 0.1): void {
  if (!areaId) return;
  const db = getDb();
  const cur = db
    .prepare("SELECT value, updated_on FROM area_progress WHERE area_id = ?")
    .get(areaId) as ProgressRow | undefined;
  const d = today();
  const next = Math.min(1, decayedValue(cur, d, getRules()) + delta);
  db.prepare(
    `INSERT INTO area_progress (area_id, value, updated_on) VALUES (?, ?, ?)
     ON CONFLICT(area_id) DO UPDATE SET value = excluded.value, updated_on = excluded.updated_on`,
  ).run(areaId, next, d);
}
