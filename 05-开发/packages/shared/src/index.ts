/**
 * 前后端共享的类型与常量。
 * P0 只放最小集合：周信息 + 设计令牌。
 */

export interface WeekDay {
  /** ISO 日期，yyyy-mm-dd */
  date: string;
  /** 1 = 周一 … 7 = 周日 */
  weekday: number;
  /** 页面上的短标签，如 "11/3" */
  label: string;
  isToday: boolean;
}

export interface WeekInfo {
  id: string;
  isoYear: number;
  isoWeek: number;
  startDate: string;
  endDate: string;
  days: WeekDay[];
}

export interface HealthInfo {
  ok: boolean;
  version: string;
  now: string;
  db: string;
}

/** 需求文档 §10 的色板，供前端与将来的导出功能共用 */
export const PALETTE = {
  bg: "#F4F2EE",
  surface: "#FFFFFF",
  line: "#E7E3DC",
  ink: "#33322F",
  ink2: "#6E6B66",
  ink3: "#A29E96",
  accent: "#8FA38E",
  accentSoft: "#E7ECE6",
  warn: "#C08B7D",
  warnSoft: "#F6ECE8",
  categories: {
    study: "#9BA7B0",
    life: "#CBBB9A",
    habit: "#A8B5A2",
    leisure: "#B0A6BC",
    body: "#C9A9A6",
  },
} as const;
