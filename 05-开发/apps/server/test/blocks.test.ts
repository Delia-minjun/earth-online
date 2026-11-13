import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "life-blocks-"));
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

const DAY = "2026-11-16"; // 周一

test("新建日程后可以改时间和标题", async () => {
  const created = await call("/blocks", {
    method: "POST",
    body: JSON.stringify({ date: DAY, startMin: 480, endMin: 540, title: "写作业", categoryId: "cat-study" }),
  });
  assert.equal(created.status, 201);

  const patched = await call(`/blocks/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ startMin: 600, endMin: 660, title: "写作业（改）", note: "在图书馆" }),
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.start_min, 600);
  assert.equal(patched.body.end_min, 660);
  assert.equal(patched.body.title, "写作业（改）");
  assert.equal(patched.body.note, "在图书馆");
});

test("改到与别的日程重叠时返回 409，且原值不变", async () => {
  const a = await call("/blocks", {
    method: "POST",
    body: JSON.stringify({ date: DAY, startMin: 720, endMin: 780, title: "A" }),
  });
  await call("/blocks", {
    method: "POST",
    body: JSON.stringify({ date: DAY, startMin: 840, endMin: 900, title: "B" }),
  });

  const clash = await call(`/blocks/${a.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ startMin: 860, endMin: 920 }),
  });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.error, "overlap");

  const day = await call(`/day?date=${DAY}`);
  const still = day.body.blocks.find((b: { id: string }) => b.id === a.body.id);
  assert.equal(still.start_min, 720, "冲突时应保持原时间");
});

test("只改标题不触发冲突检查", async () => {
  const day = await call(`/day?date=${DAY}`);
  const target = day.body.blocks[0];
  const res = await call(`/blocks/${target.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "只改名字" }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "只改名字");
  assert.equal(res.body.start_min, target.start_min);
});