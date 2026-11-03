import { test } from "node:test";
import assert from "node:assert/strict";
import { activeIn, weekLabel, weeksOverlap, type WeekRule } from "../src/lib/weeks.ts";
import { isoWeekOf, mondayOf, weekId, ymd } from "../src/week.ts";

const rule = (week_type: string, week_start: number | null = null, week_end: number | null = null): WeekRule => ({
  week_type,
  week_start,
  week_end,
});

test("没设教学周时一律算上课", () => {
  assert.equal(activeIn(rule("odd"), null), true);
  assert.equal(activeIn(rule("range", 10, 12), null), true);
});

test("单双周按奇偶生效", () => {
  const odd = rule("odd");
  const even = rule("even");
  assert.equal(activeIn(odd, 9), true);
  assert.equal(activeIn(odd, 10), false);
  assert.equal(activeIn(even, 10), true);
  assert.equal(activeIn(even, 9), false);
});

test("周次范围的边界是闭区间", () => {
  const r = rule("range", 3, 6);
  assert.equal(activeIn(r, 2), false);
  assert.equal(activeIn(r, 3), true);
  assert.equal(activeIn(r, 6), true);
  assert.equal(activeIn(r, 7), false);
});

test("周次范围只给起点时，之后都上", () => {
  const r = rule("range", 5, null);
  assert.equal(activeIn(r, 4), false);
  assert.equal(activeIn(r, 5), true);
  assert.equal(activeIn(r, 20), true);
});

test("每周与任何规则都重叠", () => {
  assert.equal(weeksOverlap(rule("all"), rule("odd")), true);
});

test("单周与双周同时间段不算冲突", () => {
  assert.equal(weeksOverlap(rule("odd"), rule("even")), false);
});

test("1-8 周与 9-16 周不重叠，1-8 与 5-16 重叠", () => {
  assert.equal(weeksOverlap(rule("range", 1, 8), rule("range", 9, 16)), false);
  assert.equal(weeksOverlap(rule("range", 1, 8), rule("range", 5, 16)), true);
});

test("单周与 2-4 周重叠（第 3 周），单周与 2-2 周不重叠", () => {
  assert.equal(weeksOverlap(rule("odd"), rule("range", 2, 4)), true);
  assert.equal(weeksOverlap(rule("odd"), rule("range", 2, 2)), false);
});

test("周规则的可读标签", () => {
  assert.equal(weekLabel(rule("all")), "");
  assert.equal(weekLabel(rule("odd")), "单周");
  assert.equal(weekLabel(rule("even")), "双周");
  assert.equal(weekLabel(rule("range", 3, 6)), "3-6 周");
  assert.equal(weekLabel(rule("range", 5, null)), "5 周起");
});

test("ISO 周换算：2026-11-03 是 2026 年第 45 周", () => {
  const { isoYear, isoWeek } = isoWeekOf(new Date(2026, 10, 3));
  assert.equal(isoYear, 2026);
  assert.equal(isoWeek, 45);
  assert.equal(weekId(isoYear, isoWeek), "2026-W45");
});

test("周一是周的开始：2026-W45 的周一是 11 月 2 日", () => {
  assert.equal(ymd(mondayOf(2026, 45)), "2026-11-02");
});

test("跨年：2026-12-31 属于 2026-W53", () => {
  const { isoYear, isoWeek } = isoWeekOf(new Date(2026, 11, 31));
  assert.equal(isoYear, 2026);
  assert.equal(isoWeek, 53);
});
