import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { join } from "node:path";
import type { HealthInfo, WeekInfo } from "@life/shared";
import { PROJECT_ROOT, dbFile, getDb } from "./db.ts";
import { migrate } from "./migrate.ts";
import { buildWeek, isoWeekOf } from "./week.ts";

migrate();

const WEB_DIST = process.env.LIFE_WEB_DIST ?? join(PROJECT_ROOT, "apps", "web", "dist");
const PORT = Number(process.env.PORT ?? 7788);

const app = new Hono();

function ensureWeek(isoYear: number, isoWeek: number): WeekInfo {
  const info = buildWeek(isoYear, isoWeek);
  getDb()
    .prepare(
      `INSERT INTO week (id, iso_year, iso_week, start_date)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(info.id, isoYear, isoWeek, info.startDate);
  return info;
}

app.get("/api/health", (c) => {
  const body: HealthInfo = {
    ok: true,
    version: "0.0.1",
    now: new Date().toISOString(),
    db: dbFile(),
  };
  return c.json(body);
});

app.get("/api/week/current", (c) => {
  const { isoYear, isoWeek } = isoWeekOf(new Date());
  return c.json(ensureWeek(isoYear, isoWeek));
});

// 生产模式：托管前端构建产物；开发模式由 Vite 单独跑并代理 /api
app.use("/*", serveStatic({ root: WEB_DIST }));
app.get("*", serveStatic({ root: WEB_DIST, rewriteRequestPath: () => "/index.html" }));

serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, (info) => {
  console.log(`[life-os] listening on http://127.0.0.1:${info.port}`);
  console.log(`[life-os] db:     ${dbFile()}`);
  console.log(`[life-os] web:    ${WEB_DIST}`);
});
