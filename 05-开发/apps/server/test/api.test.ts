import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 必须在导入 db.ts 之前设置，否则会落到真实数据目录
const dataDir = mkdtempSync(join(tmpdir(), "earth-online-test-"));
const webDir = mkdtempSync(join(tmpdir(), "earth-online-web-"));
process.env.LIFE_DATA_DIR = dataDir;

const { migrate } = await import("../src/migrate.ts");
const { createApp } = await import("../src/app.ts");

migrate();
const app = createApp(webDir);

const json = (method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const get = (path: string) => json("GET", path);
const post = (path: string, body?: unknown) => json("POST", path, body);
const put = (path: string, body?: unknown) => json("PUT", path, body);
const patch = (path: string, body?: unknown) => json("PATCH", path, body);

after(() => {
  for (const dir of [dataDir, webDir]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows 上可能因为 WAL 文件被占用删不掉，忽略 */
    }
  }
});

test("健康检查返回 ok 且指向测试库", async () => {
  const res = await get("/health");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; db: string };
  assert.equal(body.ok, true);
  assert.ok(body.db.startsWith(dataDir), "健康检查里的 db 路径应指向临时目录");
});

test("任务：创建后出现在今日，改状态后标记完成", async () => {
  const created = await post("/tasks", { title: "写测试" });
  assert.equal(created.status, 201);
  const task = (await created.json()) as { id: string; status: string; priority: number };
  assert.equal(task.status, "todo");

  const day = (await (await get("/day")).json()) as { tasks: { id: string; title: string }[] };
  assert.ok(day.tasks.some((t) => t.id === task.id), "新建任务应出现在今日");

  const done = await patch(`/tasks/${task.id}`, { status: "done" });
  assert.equal(done.status, 200);
  assert.equal(((await done.json()) as { status: string }).status, "done");
});

test("任务：可以改标题、优先级、日期，改日期会跟着换周", async () => {
  const created = (await (await post("/tasks", { title: "旧标题" })).json()) as { id: string };
  const res = await patch(`/tasks/${created.id}`, {
    title: "新标题",
    priority: 2,
    date: "2026-11-05",
  });
  assert.equal(res.status, 200);
  const row = (await res.json()) as { title: string; priority: number; scheduled_date: string; week_id: string };
  assert.equal(row.title, "新标题");
  assert.equal(row.priority, 2);
  assert.equal(row.scheduled_date, "2026-11-05");
  assert.equal(row.week_id, "2026-W45", "2026-11-05 属于第 45 周");
});

test("时间块：同一时段不能重叠，冲突返回 409", async () => {
  const first = await post("/blocks", { startMin: 480, endMin: 600, title: "上午学习" });
  assert.equal(first.status, 201);

  const second = await post("/blocks", { startMin: 540, endMin: 660, title: "冲突块" });
  assert.equal(second.status, 409);

  const adjacent = await post("/blocks", { startMin: 600, endMin: 660, title: "紧接着" });
  assert.equal(adjacent.status, 201, "首尾相接不算重叠");
});

test("时间块：结束时间早于开始时间被拒绝", async () => {
  const res = await post("/blocks", { startMin: 700, endMin: 640, title: "倒着的块" });
  assert.equal(res.status, 400);
});

test("课表：同一天同一时段每周课冲突，单双周可以共存", async () => {
  const weekly = await post("/courses", {
    name: "每周课",
    weekday: 3,
    startMin: 480,
    endMin: 570,
    weekType: "all",
  });
  assert.equal(weekly.status, 201);

  const clash = await post("/courses", {
    name: "撞车课",
    weekday: 3,
    startMin: 500,
    endMin: 590,
    weekType: "all",
  });
  assert.equal(clash.status, 409);

  const odd = await post("/courses", {
    name: "单周课",
    weekday: 4,
    startMin: 480,
    endMin: 570,
    weekType: "odd",
  });
  assert.equal(odd.status, 201);

  const even = await post("/courses", {
    name: "双周课",
    weekday: 4,
    startMin: 480,
    endMin: 570,
    weekType: "even",
  });
  assert.equal(even.status, 201, "单周与双周同时间段应当允许");
});

test("课表：可以改单双周，改成与别的每周课冲突时返回 409", async () => {
  const a = (await (await post("/courses", {
    name: "可改的课",
    weekday: 5,
    startMin: 600,
    endMin: 690,
    weekType: "odd",
  })).json()) as { id: string };

  const weeklyAt = await post("/courses", {
    name: "占位课",
    weekday: 5,
    startMin: 620,
    endMin: 700,
    weekType: "all",
  });
  // 单周 vs 每周 会重叠 → 应当已经冲突
  assert.equal(weeklyAt.status, 409);

  const ok = await patch(`/courses/${a.id}`, { weekType: "even" });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { week_type: string }).week_type, "even");
});

test("领域与项目：建项目、挂任务、改状态、软删除", async () => {
  const areas = (await (await get("/areas")).json()) as { id: string; name: string }[];
  assert.ok(areas.length >= 6, "预置领域应当存在");
  const study = areas.find((a) => a.name === "学业事业");
  assert.ok(study);

  const created = await post("/projects", { name: "毕设", areaId: study.id });
  assert.equal(created.status, 201);
  const project = (await created.json()) as { id: string; name: string };

  const list = (await (await get("/projects")).json()) as { id: string; areaName: string }[];
  assert.ok(list.some((p) => p.id === project.id && p.areaName === "学业事业"));

  const task = (await (await post("/tasks", { title: "查文献", projectId: project.id })).json()) as {
    id: string;
    project_id: string;
  };
  assert.equal(task.project_id, project.id);

  const tasks = (await (await get(`/projects/${project.id}/tasks`)).json()) as { title: string }[];
  assert.ok(tasks.some((t) => t.title === "查文献"));

  const done = await patch(`/projects/${project.id}`, { status: "done" });
  assert.equal(done.status, 200);
  assert.equal(((await done.json()) as { status: string }).status, "done");

  await json("DELETE", `/projects/${project.id}`);
  const after = (await (await get("/projects?status=all")).json()) as { id: string }[];
  assert.equal(after.some((p) => p.id === project.id), false, "删除后不应再出现");
});

test("日复盘：写入后读得回来，三次写入互不覆盖", async () => {
  const date = "2026-11-03";
  await put(`/day-review/${date}`, { good: "写完了接口" });
  await put(`/day-review/${date}`, { bad: "拖到晚上" });
  const res = await put(`/day-review/${date}`, { next: "明天上午写" });
  assert.equal(res.status, 200);
  const row = (await res.json()) as { good: string; bad: string; next: string };
  assert.equal(row.good, "写完了接口");
  assert.equal(row.bad, "拖到晚上");
  assert.equal(row.next, "明天上午写");

  const readBack = (await (await get(`/day-review/${date}`)).json()) as { next: string };
  assert.equal(readBack.next, "明天上午写");
});

test("习惯：新增、打卡、网格里能看到，删除后归档", async () => {
  const created = await post("/habits", { name: "冥想" });
  assert.equal(created.status, 201);
  const habit = (await created.json()) as { id: string; name: string };

  const toggled = await post(`/habits/${habit.id}/toggle`, {});
  assert.equal(toggled.status, 200);
  assert.equal(((await toggled.json()) as { done: number }).done, 1);

  const grid = (await (await get("/habits/grid?days=14")).json()) as {
    days: number;
    byHabit: Record<string, string[]>;
  };
  assert.equal(grid.days, 14);
  assert.equal(grid.byHabit[habit.id]?.length, 1, "刚打的卡应出现在网格里");

  await json("DELETE", `/habits/${habit.id}`);
  const day = (await (await get("/day")).json()) as { habits: { id: string }[] };
  assert.equal(day.habits.some((h) => h.id === habit.id), false, "删掉的习惯不再出现在今日");
});

test("随手记：同一天反复保存只保留最后一条", async () => {
  const date = "2026-11-03";
  await put(`/journal/${date}`, { body: "第一版" });
  const res = await put(`/journal/${date}`, { body: "改过的版本" });
  assert.equal(res.status, 200);
  const row = (await res.json()) as { body: string };
  assert.equal(row.body, "改过的版本");
});
