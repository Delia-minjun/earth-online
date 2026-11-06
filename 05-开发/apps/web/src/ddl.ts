/** DDL 紧急度的统一判定与配色，保证各处标签颜色一致 */

export type DdlTone = "far" | "soon" | "close" | "overdue";

const DAY_MS = 86_400_000;

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** 距离 DDL 还有几天，负数表示已过期 */
export function ddlDaysLeft(due: string, today = todayStr()): number {
  const a = new Date(`${due}T00:00:00`).getTime();
  const b = new Date(`${today}T00:00:00`).getTime();
  return Math.round((a - b) / DAY_MS);
}

/**
 * 7 天以上：灰；3–7 天：淡黄；3 天以内：淡红；已逾期：褐黑。
 * 已完成的任务不再提醒，一律当"远"处理。
 */
export function ddlTone(due: string | null | undefined, done = false): DdlTone {
  if (!due) return "far";
  const left = ddlDaysLeft(due);
  if (left < 0) return done ? "far" : "overdue";
  if (done) return "far";
  if (left <= 3) return "close";
  if (left <= 7) return "soon";
  return "far";
}

/** 与页面莫兰迪色板对齐的四档样式 */
export const DDL_TONE_CLASS: Record<DdlTone, string> = {
  far: "bg-surface-2 text-ink-3",
  soon: "bg-[#F3EDDA] text-[#97845A]",
  close: "bg-warn-soft text-warn",
  overdue: "bg-[#E8E1D5] text-[#4A3F35] font-medium",
};
