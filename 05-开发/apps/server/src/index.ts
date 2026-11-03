import { serve } from "@hono/node-server";
import { join } from "node:path";
import { PROJECT_ROOT, dbFile } from "./db.ts";
import { migrate } from "./migrate.ts";
import { createApp } from "./app.ts";

migrate();

const WEB_DIST = process.env.LIFE_WEB_DIST ?? join(PROJECT_ROOT, "apps", "web", "dist");
const PORT = Number(process.env.PORT ?? 7788);

const app = createApp(WEB_DIST);

serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, (info) => {
  console.log(`[earth-online] listening on http://127.0.0.1:${info.port}`);
  console.log(`[earth-online] db:     ${dbFile()}`);
  console.log(`[earth-online] web:    ${WEB_DIST}`);
});
