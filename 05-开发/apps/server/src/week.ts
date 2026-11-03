import type { WeekInfo } from "@life/shared";

const DAY_MS = 86_400_000;

/** 某天属于哪个 ISO 周 */
export function isoWeekOf(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // 移到本周四
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const isoWeek = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return { isoYear, isoWeek };
}

/** 该 ISO 周的周一（UTC 零点） */
export function mondayOf(isoYear: number, isoWeek: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * DAY_MS);
  return new Date(week1Monday.getTime() + (isoWeek - 1) * 7 * DAY_MS);
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekId(isoYear: number, isoWeek: number): string {
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

export function buildWeek(isoYear: number, isoWeek: number): WeekInfo {
  const start = mondayOf(isoYear, isoWeek);
  const today = ymd(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY_MS);
    const date = ymd(d);
    return {
      date,
      weekday: i + 1,
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      isToday: date === today,
    };
  });
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return {
    id: weekId(isoYear, isoWeek),
    isoYear,
    isoWeek,
    startDate: ymd(start),
    endDate: ymd(end),
    days,
  };
}
