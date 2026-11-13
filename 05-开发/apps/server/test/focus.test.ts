import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "life-focus-"));
process.env.LIFE_DATA_DIR = dir;

const { migrate } = await import("../src/migrate.ts");
const { createApp } = await import("../src/app.ts");
const { getDb } = await import("../src/db.ts");

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

/** 把会话的开始时间往前挪，模拟已经专注了很久 */
const backdate = (id: string, minutes: number) => {
  const past = new Date(Date.now() - minutes * 60_000).toISOString();
  getDb().prepare("UPDATE focus_session SET started_at = ? WHERE id = ?").run(past, id);
};

test("番茄钟：同一时刻只允许一个会话", async () => {
  const a = await call("/focus/start", { method: "POST", body: JSON.stringify({ plannedMin: 25 }) });
  assert.equal(a.status, 201);

  const b = await call("/focus/start", { method: "POST", body: JSON.stringify({ plannedMin: 25 }) });
  assert.equal(b.status, 409, "已有进行中的会话时不允许再开");

  const active = await call("/focus/active");
  assert.equal(active.body.id, a.body.id);

  await call(`/focus/${a.body.id}/void`, { method: "POST" });
  assert.equal((await call("/focus/active")).body, null);
});

test("番茄钟：作废不写时间块、不发币", async () => {
  const s = await call("/focus/start", { method: "POST", body: JSON.stringify({ plannedMin: 25 }) });
  backdate(s.body.id, 30);

  await call(`/focus/${s.body.id}/void`, { method: "POST" });

  const day = await call("/day");
  assert.equal(day.body.blocks.length, 0, "作废不应产生时间块");
  assert.equal((await call("/coins")).body.balance, 0, "作废不发币");
});

test("番茄钟：满 25 分钟写时间块并按规则发币", async () => {
  const s = await call("/focus/start", { method: "POST", body: JSON.stringify({ plannedMin: 25 }) });
  backdate(s.body.id, 26);

  const done = await call(`/focus/${s.body.id}/finish`, { method: "POST", body: "{}" });
  assert.equal(done.status, 200);
  assert.ok(done.body.block_id, "应自动写一条时间块");
  assert.equal(done.body.coins, 3, "26 分钟 = 一个 25 分钟块 = 3 币");

  const day = await call("/day");
  const block = day.body.blocks.find((b: { id: string }) => b.id === done.body.block_id);
  assert.ok(block, "时间块能在当天查到");
  assert.ok(block.end_min - block.start_min >= 25, "时长按实际时间戳算");
  assert.equal((await call("/coins")).body.balance, 3);
});

test("番茄钟：不到 25 分钟不发币", async () => {
  const s = await call("/focus/start", { method: "POST", body: JSON.stringify({ plannedMin: 25 }) });
  backdate(s.body.id, 10);

  const done = await call(`/focus/${s.body.id}/finish`, { method: "POST", body: "{}" });
  assert.equal(done.body.coins, 0, "10 分钟不足一个 25 分钟块");
  assert.ok(done.body.block_id, "但仍然记录时间块（≥1 分钟）");
});
