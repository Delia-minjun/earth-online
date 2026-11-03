import { getDb } from "../db.ts";

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().prepare("SELECT value FROM setting WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO setting (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, JSON.stringify(value));
}

/** 作息时间表：把「第 N 节」换算成具体时间 */
export interface PeriodsConfig {
  /** 第 1 节开始时间 HH:MM */
  firstStart: string;
  /** 每节多少分钟 */
  lessonMin: number;
  /** 课间多少分钟 */
  breakMin: number;
  /** 一天最多几节 */
  count: number;
}

export const DEFAULT_PERIODS: PeriodsConfig = {
  firstStart: "08:00",
  lessonMin: 45,
  breakMin: 5,
  count: 12,
};

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export const hhmmOf = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function periodRange(n: number, cfg: PeriodsConfig): { start: number; end: number } {
  const step = cfg.lessonMin + cfg.breakMin;
  const start = toMin(cfg.firstStart) + (n - 1) * step;
  return { start, end: start + cfg.lessonMin };
}

export function resolvePeriods(
  startPeriod: number | undefined,
  endPeriod: number | undefined,
  cfg: PeriodsConfig,
): { startMin: number; endMin: number } | null {
  if (!startPeriod || !endPeriod) return null;
  if (startPeriod < 1 || endPeriod < startPeriod || endPeriod > cfg.count) return null;
  const a = periodRange(startPeriod, cfg);
  const b = periodRange(endPeriod, cfg);
  return { startMin: a.start, endMin: b.end };
}
