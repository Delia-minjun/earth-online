import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "earth-regressions-"));
process.env.LIFE_DATA_DIR = dir;
const { migrate } = await import("../src/migrate.ts");
const { createApp } = await import("../src/app.ts");
const { getDb } = await import("../src/db.ts");
const { bumpArea, settleAreas, saveRules } = await import("../src/lib/coins.ts");
const { today, shiftDate } = await import("../src/lib/dates.ts");
migrate();
const db = getDb();
const app = createApp(dir);

after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(res.ok, `${method} ${path}: ${res.status} ${await res.clone().text()}`);
  return res.json() as Promise<any>;
}

test("任务进度：重复完成仅增长一次，达到发币上限也不能刷进度", async () => {
  const area = await call("POST", "/areas", { name: "进度回归" });
  saveRules({ dailyCap: 0 });
  try {
    const task = await call("POST", "/tasks", { title: "不能重复领取", areaId: area.id });
    await call("PATCH", `/tasks/${task.id}`, { status: "done" });
    assert.equal(settleAreas().find((a) => a.area_id === area.id)?.value, 0.6);
    await call("PATCH", `/tasks/${task.id}`, { status: "done" });
    await call("PATCH", `/tasks/${task.id}`, { status: "todo" });
    await call("PATCH", `/tasks/${task.id}`, { status: "done" });
    assert.equal(settleAreas().find((a) => a.area_id === area.id)?.value, 0.6);
  } finally {
    saveRules({ dailyCap: 200 });
  }
});

test("领域进度：增长前结算 30 天衰减，当天读取不再次衰减", () => {
  const d = today();
  db.prepare("INSERT OR REPLACE INTO area_progress VALUES (?, ?, ?)")
    .run("area-study", 1, shiftDate(d, -30));
  bumpArea("area-study", 0.1);
  const expected = Math.pow(0.99, 30) + 0.1;
  const value = settleAreas().find((a) => a.area_id === "area-study")!.value;
  assert.ok(Math.abs(value - expected) < 1e-10);
  assert.equal(settleAreas().find((a) => a.area_id === "area-study")!.value, value);

  db.prepare("UPDATE area_progress SET value = 0.5, updated_on = ? WHERE area_id = ?")
    .run(shiftDate(d, -300), "area-study");
  bumpArea("area-study", 0.1);
  assert.equal(settleAreas().find((a) => a.area_id === "area-study")!.value, 0.5);
});

test("分类：有正常时间块时拒删，软删除后可删除且保留历史时间块", async () => {
  const category = await call("POST", "/categories", { name: "分类回归" });
  const block = await call("POST", "/blocks", {
    date: "2026-01-01", startMin: 0, endMin: 10, title: "历史记录", categoryId: category.id,
  });
  assert.equal((await app.request(`/api/categories/${category.id}`, { method: "DELETE" })).status, 409);
  await call("DELETE", `/blocks/${block.id}`);
  await call("DELETE", `/categories/${category.id}`);
  const historical = db.prepare("SELECT category_id, deleted_at FROM time_block WHERE id = ?")
    .get(block.id) as { category_id: string | null; deleted_at: string };
  assert.equal(historical.category_id, null);
  assert.ok(historical.deleted_at);
});

test("番茄钟：跨午夜的 30 分钟完整拆为 10 + 20 分钟，发币一次", async (t) => {
  const start = new Date(2026, 10, 12, 23, 50);
  t.mock.timers.enable({ apis: ["Date"], now: start.getTime() });
  const session = await call("POST", "/focus/start", { plannedMin: 25 });
  t.mock.timers.tick(30 * 60_000);
  const done = await call("POST", `/focus/${session.id}/finish`);
  assert.equal(done.actual_sec, 1800);
  assert.equal(done.coins, 3);
  const blocks = db.prepare("SELECT id, date, start_min, end_min FROM time_block WHERE source = 'focus' ORDER BY date").all() as
    { id: string; date: string; start_min: number; end_min: number }[];
  assert.deepEqual(blocks.map(({ date, start_min, end_min }) => ({ date, start_min, end_min })), [
    { date: "2026-11-12", start_min: 1430, end_min: 1440 },
    { date: "2026-11-13", start_min: 0, end_min: 20 },
  ]);
  assert.equal(done.block_id, blocks[0].id);
  assert.equal((await app.request(`/api/focus/${session.id}/finish`, { method: "POST" })).status, 404);
});

test("番茄钟：删除默认分类后依然可以结束，时间块归入未分类", async (t) => {
  // 先软删除前一个测试的时间块，默认分类才允许被删除。
  const blocks = db.prepare("SELECT id FROM time_block WHERE category_id = 'cat-study'").all() as { id: string }[];
  for (const b of blocks) await call("DELETE", `/blocks/${b.id}`);
  await call("DELETE", "/categories/cat-study");
  t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 10, 14, 10).getTime() });
  const session = await call("POST", "/focus/start", { plannedMin: 25 });
  t.mock.timers.tick(26 * 60_000);
  const done = await call("POST", `/focus/${session.id}/finish`);
  assert.equal(done.status, "done");
  assert.equal(done.coins, 3);
  assert.equal((db.prepare("SELECT category_id FROM time_block WHERE id = ?").get(done.block_id) as
    { category_id: null }).category_id, null);
  assert.equal(await call("GET", "/focus/active"), null);
});

test("升级迁移：已完成或曾领过任务奖励的历史任务不重复领取进度", () => {
  const legacy = new DatabaseSync(":memory:");
  try {
    legacy.exec(`
      CREATE TABLE task (id TEXT PRIMARY KEY, status TEXT);
      CREATE TABLE coin_entry (kind TEXT, ref_id TEXT);
      INSERT INTO task VALUES ('done', 'done'), ('reopened', 'todo'), ('new', 'todo');
      INSERT INTO coin_entry VALUES ('task', 'reopened'), ('habit', 'new');
    `);
    legacy.exec(readFileSync(new URL("../migrations/011_task_progress.sql", import.meta.url), "utf8"));
    const flags = legacy.prepare("SELECT id, progress_awarded FROM task ORDER BY id").all();
    assert.deepEqual(flags.map((r) => [r.id, r.progress_awarded]), [
      ["done", 1], ["new", 0], ["reopened", 1],
    ]);
  } finally {
    legacy.close();
  }
});

test("番茄钟：发币失败时回滚时间块，重试后只记录一次", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 10, 15, 10).getTime() });
  const session = await call("POST", "/focus/start", { plannedMin: 25 });
  t.mock.timers.tick(26 * 60_000);
  const before = (db.prepare("SELECT COUNT(*) AS n FROM time_block").get() as { n: number }).n;
  db.exec(`CREATE TEMP TRIGGER fail_focus_coins BEFORE INSERT ON coin_entry
    WHEN NEW.kind = 'focus' BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;`);
  try {
    assert.equal((await app.request(`/api/focus/${session.id}/finish`, { method: "POST" })).status, 500);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM time_block").get() as { n: number }).n, before);
    assert.equal((await call("GET", "/focus/active")).id, session.id);
  } finally {
    db.exec("DROP TRIGGER fail_focus_coins");
  }
  const done = await call("POST", `/focus/${session.id}/finish`);
  assert.equal(done.coins, 3);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM time_block").get() as { n: number }).n, before + 1);
});
