// 把服务端打成单文件 server.mjs，并把前端产物复制到 dist/web
// 用法：node scripts/build.mjs
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // apps/desktop/scripts
const desktop = resolve(here, "..");
const dev = resolve(desktop, "../.."); // 05-开发
const serverEntry = join(dev, "apps", "server", "src", "index.ts");
const webDist = join(dev, "apps", "web", "dist");
const outDir = join(desktop, "dist");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log("[desktop] 打包服务端 → dist/server.mjs");
await build({
  entryPoints: [serverEntry],
  outfile: join(outDir, "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // node:sqlite 等内置模块不打包；npm 依赖全部打进去，安装包就不需要 node_modules
  external: ["node:*"],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});

if (!existsSync(join(webDist, "index.html"))) {
  console.warn("[desktop] 前端还没构建，先跑 pnpm --filter @life/web build");
} else {
  console.log("[desktop] 复制前端 → dist/web");
  cpSync(webDist, join(outDir, "web"), { recursive: true });
}

// 迁移脚本是运行时读的 .sql，得原样带进安装包
console.log("[desktop] 复制迁移 → dist/migrations");
cpSync(join(dev, "apps", "server", "migrations"), join(outDir, "migrations"), {
  recursive: true,
});

const icon = join(dev, "apps", "desktop", "build", "icon.ico");
if (!existsSync(icon)) {
  const src = join(dev, "earth-online.ico");
  if (existsSync(src)) {
    mkdirSync(dirname(icon), { recursive: true });
    copyFileSync(src, icon);
    console.log("[desktop] 已从 05-开发/earth-online.ico 复制图标");
  }
}

console.log("[desktop] 完成");
