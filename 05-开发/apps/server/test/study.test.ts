import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "life-study-"));
process.env.LIFE_DATA_DIR = dir;
// 没有 API key 时，AI 相关接口应该明确报 NOKEY 而不是崩
delete process.env.LIFE_AI_API_KEY;

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

test("学习：建科目 → 加资料 → 校对 → 卡片 → 复习", async () => {
  const sub = await call("/study/subjects", {
    method: "POST",
    body: JSON.stringify({ name: "[测试] 数字信号处理" }),
  });
  assert.equal(sub.status, 201);
  const subjectId = sub.body.id;

  const mat = await call("/study/materials", {
    method: "POST",
    body: JSON.stringify({
      subjectId,
      title: "[测试] 第三章",
      kind: "text",
      content: "傅里叶变换把时域信号变到频域。DFT 是离散形式。",
    }),
  });
  assert.equal(mat.status, 201);
  assert.equal(mat.body.status, "raw", "新资料默认待校对");

  const verified = await call(`/study/materials/${mat.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "verified" }),
  });
  assert.equal(verified.body.status, "verified");

  const card = await call("/study/cards", {
    method: "POST",
    body: JSON.stringify({
      subjectId,
      materialId: mat.body.id,
      front: "傅里叶变换的作用？",
      back: "把时域信号变到频域",
      ref: "第 1 段",
    }),
  });
  assert.equal(card.status, 201);
  assert.equal(card.body.box, 1);

  const queue = await call(`/study/review/queue?subjectId=${subjectId}`);
  assert.equal(queue.status, 200);
  assert.equal(queue.body.cards.length, 1, "新卡片当天就到期");

  const reviewed = await call(`/study/cards/${card.body.id}/review`, {
    method: "POST",
    body: JSON.stringify({ rating: "good" }),
  });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.box, 2, "good 升一格");
  assert.ok(reviewed.body.due_date > new Date().toISOString().slice(0, 10), "下次到期在未来");

  const again = await call(`/study/cards/${card.body.id}/review`, {
    method: "POST",
    body: JSON.stringify({ rating: "again" }),
  });
  assert.equal(again.body.box, 1, "again 回到第一格");
});

test("学习：未校对资料不能出卡片（409）", async () => {
  const subs = await call("/study/subjects");
  const subjectId = subs.body[0].id;
  const mat = await call("/study/materials", {
    method: "POST",
    body: JSON.stringify({ subjectId, title: "[测试] 待校对", kind: "text", content: "内容" }),
  });
  const gen = await call(`/study/materials/${mat.body.id}/generate`, {
    method: "POST",
    body: JSON.stringify({ count: 5 }),
  });
  assert.equal(gen.status, 409);
  assert.equal(gen.body.error, "not_verified");
});

test("学习：没配 AI 时出卡片返回 NOKEY（400）而不是 500", async () => {
  const subs = await call("/study/subjects");
  const subjectId = subs.body[0].id;
  const mat = await call("/study/materials", {
    method: "POST",
    body: JSON.stringify({ subjectId, title: "[测试] 已校对", kind: "text", content: "一些内容" }),
  });
  await call(`/study/materials/${mat.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "verified" }),
  });
  const gen = await call(`/study/materials/${mat.body.id}/generate`, {
    method: "POST",
    body: JSON.stringify({ count: 5 }),
  });
  assert.equal(gen.status, 400);
  assert.equal(gen.body.error, "NOKEY");
});

test("学习：统计与考试接口", async () => {
  const stats = await call("/study/stats");
  assert.equal(stats.status, 200);
  assert.equal(typeof stats.body.due, "number");

  const exams = await call("/study/exams", {
    method: "POST",
    body: JSON.stringify({ title: "[测试] 期末考试", date: "2026-12-20" }),
  });
  assert.equal(exams.status, 201);
  const list = await call("/study/exams");
  assert.ok(list.body.some((e: { title: string }) => e.title === "[测试] 期末考试"));
});
