/** 周次规则：某门课在第 N 个教学周是否上课 */

export type WeekType = "all" | "odd" | "even" | "range";

export interface WeekRule {
  week_type: string;
  week_start: number | null;
  week_end: number | null;
}

/**
 * week 为 null 表示还不知道当前是第几教学周（没设学期）——
 * 这时一律算「上」，宁可多显示，也不要让课凭空消失。
 */
export function activeIn(rule: WeekRule, week: number | null): boolean {
  if (week === null) return true;
  if (rule.week_type === "odd") return week % 2 === 1;
  if (rule.week_type === "even") return week % 2 === 0;
  if (rule.week_type === "range") {
    if (rule.week_start !== null && week < rule.week_start) return false;
    if (rule.week_end !== null && week > rule.week_end) return false;
    return true;
  }
  return true;
}

/** 两条周规则有没有交叠的周 —— 单周课和双周课同时间段不算冲突 */
export function weeksOverlap(a: WeekRule, b: WeekRule): boolean {
  for (let w = 1; w <= 30; w += 1) {
    if (activeIn(a, w) && activeIn(b, w)) return true;
  }
  return false;
}

/** 一周上几次的描述，给前端显示用 */
export function weekLabel(rule: WeekRule): string {
  if (rule.week_type === "odd") return "单周";
  if (rule.week_type === "even") return "双周";
  if (rule.week_type === "range") {
    const a = rule.week_start ?? 1;
    const b = rule.week_end;
    return b === null ? `${a} 周起` : `${a}-${b} 周`;
  }
  return "";
}
