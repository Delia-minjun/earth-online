/**
 * 示例数据：仅用于 P0/P1 的视觉评审。
 * 接入真实接口后整份删除（P1 起用服务端数据）。
 */

export const DEMO_FOCUS = [
  { id: "f1", time: "09:00", title: "小组组会 · 确定分工", cat: "study", done: true },
  { id: "f2", time: "14:00", title: "人形机器人强化学习 · 实验课", cat: "study", done: false },
  { id: "f3", time: "20:00", title: "英语精读 1 篇", cat: "study", done: false },
];

export const DEMO_BLOCKS = [
  { id: "b1", start: "08:00", end: "08:45", title: "英语精读", cat: "study" },
  { id: "b2", start: "10:00", end: "11:30", title: "强化学习", cat: "study" },
  { id: "b3", start: "12:00", end: "13:00", title: "午饭 · 午休", cat: "life" },
  { id: "b4", start: "15:00", end: "16:00", title: "取快递 · 洗衣", cat: "life" },
  { id: "b5", start: "19:00", end: "20:00", title: "健身 · 臀腿日", cat: "body" },
];

export const DEMO_HABITS = [
  { id: "h1", name: "早睡", done: true },
  { id: "h2", name: "喝水", done: true },
  { id: "h3", name: "护肤", done: false },
  { id: "h4", name: "早起", done: true },
  { id: "h5", name: "背单词", done: false },
  { id: "h6", name: "运动", done: true },
];

export const DEMO_MONEY = { spentToday: 38, budgetLeft: 762 };
export const DEMO_BODY = { weight: 62.4, workout: "臀腿日" };
export const DEMO_MEALS = [
  { id: "m1", slot: "早", text: "豆浆 + 鸡蛋" },
  { id: "m2", slot: "午", text: "食堂 · 一荤一素" },
  { id: "m3", slot: "晚", text: "" },
];
export const DEMO_NOTE = "今早效率高，下午有点散。晚上把策划案开头写完。";

export const DEMO_REWARD = {
  balance: 1284,
  weekIn: 86,
  weekOut: 40,
  areas: [
    { key: "health", pct: 0.72 },
    { key: "study", pct: 0.88 },
    { key: "relation", pct: 0.55 },
    { key: "finance", pct: 0.63 },
    { key: "growth", pct: 0.64 },
    { key: "fun", pct: 0.41 },
  ],
  shop: [
    { id: "r1", name: "奶茶一杯", price: 30, cat: "life" },
    { id: "r2", name: "看一集剧", price: 40, cat: "leisure" },
    { id: "r3", name: "游戏 1 小时", price: 60, cat: "leisure" },
    { id: "r4", name: "买一本书", price: 150, cat: "study" },
    { id: "r5", name: "周末出游", price: 400, cat: "body" },
    { id: "r6", name: "睡到自然醒", price: 80, cat: "habit" },
  ],
  ledger: [
    { id: "l1", at: "11/03 21:40", text: "兑换 · 看一集剧", delta: -40 },
    { id: "l2", at: "11/03 19:10", text: "完成 · 健身臀腿日", delta: 3 },
    { id: "l3", at: "11/02 23:50", text: "完成 · 周复盘", delta: 10 },
    { id: "l4", at: "11/02 22:00", text: "全勤周奖励", delta: 20 },
  ],
};

export const CAT_COLOR: Record<string, string> = {
  study: "#9BA7B0",
  life: "#CBBB9A",
  habit: "#A8B5A2",
  leisure: "#B0A6BC",
  body: "#C9A9A6",
};
