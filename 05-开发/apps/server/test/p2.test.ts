import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "earth-online-p2-"));
const webDir = mkdtempSync(join(tmpdir(), "earth-online-p2-web-"));
process.env.LIFE_DATA_DIR = dataDir;

const { migrate } = await import("../src/migrate.ts");
const { createApp } = await import("../src/app.ts");

migrate();
const app = createApp(webDir);

const call = (method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const get = (p: string) => call("GET", p);
const post = (p: string, b?: unknown) => call("POST", p, b);
const put = (p: string, b?: unknown) => call("PUT", p, b);

after(() => {
  for (const dir of [dataDir, webDir]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* 忽略 Windows 上的占用 */
    }
  }
});

test("账单类别：预置支出与收入类别都在", async () => {
  const cats = (await (await get("/money/categories")).json()) as { name: string; kind: string }[];
  const expense = cats.filter((c) => c.kind === "expense").map((c) => c.name);
  const income = cats.filter((c) => c.kind === "income").map((c) => c.name);
  assert.ok(expense.includes("食品") && expense.includes("出行"));
  assert.ok(income.includes("工资"));
});

test("记账：支出与收入分开汇总，分类占比正确", async () => {
  await post("/money", { date: "2026-11-02", amount: 25.5, categoryId: "mc-food", note: "午饭" });
  await post("/money", { date: "2026-11-02", amount: 10, categoryId: "mc-transport" });
  await post("/money", { date: "2026-11-03", amount: 30, categoryId: "mc-food" });
  await post("/money", { date: "2026-11-03", kind: "income", amount: 5000, categoryId: "mc-salary" });

  const res = await get("/money?month=2026-11");
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    entries: unknown[];
    summary: { expense: number; income: number; byCategory: Record<string, { amount: number }> };
  };
  assert.equal(body.entries.length, 4);
  assert.equal(body.summary.expense, 65.5);
  assert.equal(body.summary.income, 5000);
  assert.equal(body.summary.byCategory["mc-food"]?.amount, 55.5);
});

test("记账：删除后不再计入汇总", async () => {
  const created = (await (await post("/money", { date: "2026-11-04", amount: 99 })).json()) as { id: string };
  await call("DELETE", `/money/${created.id}`);
  const body = (await (await get("/money?month=2026-11")).json()) as { summary: { expense: number } };
  assert.equal(body.summary.expense, 65.5, "删掉的 99 元不该计入");
});

test("记账：金额必须为正数", async () => {
  const res = await post("/money", { amount: -5 });
  assert.equal(res.status, 400);
});

test("预算：默认 0，保存后读得回来", async () => {
  const initial = (await (await get("/settings/budget")).json()) as { total: number };
  assert.equal(initial.total, 0);

  const saved = await put("/settings/budget", { total: 3000, byCategory: { "mc-food": 1200 } });
  assert.equal(saved.status, 200);

  const again = (await (await get("/settings/budget")).json()) as {
    total: number;
    byCategory: Record<string, number>;
  };
  assert.equal(again.total, 3000);
  assert.equal(again.byCategory["mc-food"], 1200);
});

test("身体：体重与训练类型各自写入，互不覆盖", async () => {
  await put("/body/2026-11-03", { weight: 62.4 });
  const res = await put("/body/2026-11-03", { workout: "有氧,臀腿" });
  const row = (await res.json()) as { weight: number; workout: string };
  assert.equal(row.weight, 62.4, "只改训练类型不该冲掉体重");
  assert.equal(row.workout, "有氧,臀腿");

  const list = (await (await get("/body?from=2026-11-01&to=2026-11-30")).json()) as { date: string }[];
  assert.equal(list.length, 1);
});

test("身体：体重超出合理范围被拒绝", async () => {
  const res = await put("/body/2026-11-05", { weight: 900 });
  assert.equal(res.status, 400);
});

test("饮食：三个餐次独立保存，重复保存只留最后一条", async () => {
  await put("/meals/2026-11-03", { breakfast: "燕麦 + 鸡蛋" });
  await put("/meals/2026-11-03", { lunch: "食堂 · 番茄牛腩" });
  const res = await put("/meals/2026-11-03", { dinner: "沙拉" });
  const row = (await res.json()) as { breakfast: string; lunch: string; dinner: string };
  assert.equal(row.breakfast, "燕麦 + 鸡蛋");
  assert.equal(row.lunch, "食堂 · 番茄牛腩");
  assert.equal(row.dinner, "沙拉");
});

test("月历：汇总当日时间块、任务完成与支出", async () => {
  await post("/blocks", { date: "2026-11-06", startMin: 540, endMin: 660, title: "写代码" });
  const task = (await (await post("/tasks", { title: "跑测试", date: "2026-11-06" })).json()) as { id: string };
  await call("PATCH", `/tasks/${task.id}`, { status: "done" });
  await post("/money", { date: "2026-11-06", amount: 18, categoryId: "mc-food" });

  const body = (await (await get("/calendar/2026-11")).json()) as {
    byDate: Record<string, { blocks: number; minutes: number; tasks: number; done: number; expense: number }>;
  };
  const day = body.byDate["2026-11-06"];
  assert.ok(day);
  assert.equal(day.blocks, 1);
  assert.equal(day.minutes, 120);
  assert.equal(day.tasks, 1);
  assert.equal(day.done, 1);
  assert.equal(day.expense, 18);
});
