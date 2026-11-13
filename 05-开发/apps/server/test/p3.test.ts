import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "life-p3-"));
process.env.LIFE_DATA_DIR = dir;

const { migrate } = await import("../src/migrate.ts");
const { createApp } = await import("../src/app.ts");

migrate();
const app = createApp(join(dir, "nope"));

const call = async (path: string, init?: RequestInit) => {
  const res = await app.request(`/api${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

test("钱包：初始余额为 0，规则带默认值", async () => {
  const w = await call("/coins");
  assert.equal(w.status, 200);
  assert.equal(w.body.balance, 0);
  assert.equal(w.body.rules.dailyCap, 200);
});

test("发币：同一 refId 不重复发放", async () => {
  const a = await call("/coins/earn", {
    method: "POST",
    body: JSON.stringify({ kind: "review", amount: 10, refId: "week-1" }),
  });
  assert.equal(a.status, 200);
  assert.equal(a.body.amount, 10);

  const b = await call("/coins/earn", {
    method: "POST",
    body: JSON.stringify({ kind: "review", amount: 10, refId: "week-1" }),
  });
  assert.equal(b.status, 409);
});

test("发币：单日上限会截断", async () => {
  await call("/coins/rules", { method: "PUT", body: JSON.stringify({ dailyCap: 15 }) });
  const r = await call("/coins/earn", {
    method: "POST",
    body: JSON.stringify({ kind: "bonus", amount: 100, note: "超额测试" }),
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.amount, 5); // 已有 10，上限 15
  assert.equal(r.body.balance, 15);
  await call("/coins/rules", { method: "PUT", body: JSON.stringify({ dailyCap: 200 }) });
});

test("兑换：币不够返回 409，够则扣币并记支出", async () => {
  const item = await call("/rewards", {
    method: "POST",
    body: JSON.stringify({ name: "奶茶", price: 100, money: 18 }),
  });
  assert.equal(item.status, 201);

  const poor = await call(`/rewards/${item.body.id}/redeem`, { method: "POST" });
  assert.equal(poor.status, 409, "余额 15 < 100，不允许透支");

  await call("/coins/earn", {
    method: "POST",
    body: JSON.stringify({ kind: "bonus", amount: 150, note: "补币" }),
  });

  const ok = await call(`/rewards/${item.body.id}/redeem`, { method: "POST" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.balance, 65);

  const month = new Date().toISOString().slice(0, 7);
  const money = await call(`/money?month=${month}`);
  const list = Array.isArray(money.body) ? money.body : (money.body.entries ?? []);
  assert.ok(
    list.some((m: { note: string | null }) => (m.note ?? "").includes("兑换奖赏")),
    "兑换带真实金额的奖赏应自动记一笔支出",
  );
});

test("领域进度条：返回六条且都在 0..1", async () => {
  const r = await call("/areas/progress");
  assert.equal(r.status, 200);
  assert.ok(r.body.length >= 1);
  for (const row of r.body) {
    assert.ok(row.pct >= 0 && row.pct <= 1, `${row.name} 的数值应在 0..1`);
  }
});

test("完成任务自动发币，重复勾选不重复发", async () => {
  const task = await call("/tasks", { method: "POST", body: JSON.stringify({ title: "[测试] 写作业" }) });
  assert.equal(task.status, 201);

  const before = (await call("/coins")).body.balance;
  await call(`/tasks/${task.body.id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
  const mid = (await call("/coins")).body.balance;
  assert.equal(mid - before, 3, "完成一个任务发 3 币");

  await call(`/tasks/${task.body.id}`, { method: "PATCH", body: JSON.stringify({ status: "todo" }) });
  await call(`/tasks/${task.body.id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
  const after = (await call("/coins")).body.balance;
  assert.equal(after, mid, "取消再勾选不应重复发币");
});

test("习惯打卡发币", async () => {
  const habit = await call("/habits", { method: "POST", body: JSON.stringify({ name: "[测试] 散步" }) });
  assert.equal(habit.status, 201);

  const before = (await call("/coins")).body.balance;
  const done = await call(`/habits/${habit.body.id}/toggle`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert.equal(done.status, 200);
  const after = (await call("/coins")).body.balance;
  assert.equal(after - before, 2, "打卡发 2 币");
});
