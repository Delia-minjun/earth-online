import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { join } from "node:path";
import type { HealthInfo } from "@life/shared";
import { PROJECT_ROOT, dbFile } from "./db.ts";
import { api } from "./routes/p1.ts";

/**
 * 组装 Hono 应用但不监听端口——测试可以直接 app.request() 打进来。
 */
export function createApp(
  webDist: string = process.env.LIFE_WEB_DIST ?? join(PROJECT_ROOT, "apps", "web", "dist"),
): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => {
    const body: HealthInfo = {
      ok: true,
      version: "0.1.0",
      now: new Date().toISOString(),
      db: dbFile(),
    };
    return c.json(body);
  });

  app.route("/api", api);

  // 生产模式托管前端构建产物；开发模式由 Vite 单独跑并代理 /api
  app.use("/*", serveStatic({ root: webDist }));
  app.get("*", serveStatic({ root: webDist, rewriteRequestPath: () => "/index.html" }));

  return app;
}
