import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { join } from "node:path";
import type { HealthInfo } from "@life/shared";
import { PROJECT_ROOT, dbFile } from "./db.ts";
import { api } from "./routes/p1.ts";
import { p2 } from "./routes/p2.ts";
import { p3 } from "./routes/p3.ts";
import { p4 } from "./routes/p4.ts";

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
      // 桌面版会把 app.getVersion() 通过 LIFE_VERSION 传进来；命令行版显示 dev
      version: process.env.LIFE_VERSION ?? "dev",
      now: new Date().toISOString(),
      db: dbFile(),
    };
    return c.json(body);
  });

  app.route("/api", api);
  app.route("/api", p2);
  app.route("/api", p3);
  app.route("/api", p4);

  // 生产模式托管前端构建产物；开发模式由 Vite 单独跑并代理 /api
  app.use("/*", serveStatic({ root: webDist }));
  app.get("*", serveStatic({ root: webDist, rewriteRequestPath: () => "/index.html" }));

  return app;
}
