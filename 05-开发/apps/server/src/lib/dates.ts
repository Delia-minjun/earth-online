import { isoWeekOf } from "../week.ts";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-\d{2}$/;

/** 本地时区的今天，yyyy-mm-dd */
export function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 1 = 周一 … 7 = 周日 */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00`).getDay() || 7;
}

/** yyyy-mm-dd 加减天数 */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return today0(d);
}

function today0(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 某天所在 ISO 周的年与周号 */
export function isoWeekOfDate(date: string): { isoYear: number; isoWeek: number } {
  return isoWeekOf(new Date(`${date}T00:00:00`));
}
