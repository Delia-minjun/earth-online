// 把服务端打成单文件 server.mjs，并把前端产物复制到 dist/web
// 用法：node scripts/build.mjs
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // apps/desktop/scripts
const desktop = resolve(here, "..");
const dev = resolve(desktop, "../.."); // 05-开发
const serverEntry = join(dev, "apps", "server", "src", "index.ts");
const webDist = join(dev, "apps", "web", "dist");
const outDir = join(desktop, "dist");

console.log(`[desktop] cwd        ${process.cwd()}`);
console.log(`[desktop] 服务端入口 ${serverEntry}`);
console.log(`[desktop] 前端产物   ${webDist}`);

/**
 * 自己实现目录复制：cpSync 在 Windows runner 上出过 127 且没有堆栈，
 * 这里逐文件复制并打印，出错时能直接看到是哪个路径挂了。
 */
function copyDir(from, to, label) {
  let files = 0;
  const walk = (src, dst) => {
    if (!existsSync(src)) throw new Error(`${label}：源目录不存在 ${src}`);
    if (!statSync(src).isDirectory()) {
      copyFileSync(src, dst);
      files += 1;
      return;
    }
    mkdirSync(dst, { recursive: true });
    for (const name of readdirSync(src)) {
      walk(join(src, name), join(dst, name));
    }
  };
  try {
    walk(from, to);
  } catch (err) {
    console.error(`[desktop] ✗ ${label} 失败：${relative(dev, from)} → ${relative(desktop, to)}`);
    console.error(`[desktop]   ${err?.code ?? ""} ${err?.message ?? err}`);
    if (err?.path) console.error(`[desktop]   path: ${err.path}`);
    process.exit(1);
  }
  console.log(`[desktop] ✓ ${label}：${files} 个文件`);
}

let esbuild;
try {
  esbuild = await import("esbuild");
} catch (err) {
  console.error("[desktop] 找不到 esbuild。它应该在 05-开发/node_modules 里（根 devDependencies）。");
  console.error("[desktop] 报错：", err?.message ?? err);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log("[desktop] 打包服务端 → dist/server.mjs");
await esbuild.build({
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
  console.error("[desktop] 前端还没构建，先跑 pnpm --filter @life/web build");
  process.exit(1);
}
console.log("[desktop] 复制前端 → dist/web");
copyDir(webDist, join(outDir, "web"), "复制前端");

// 迁移脚本是运行时读的 .sql，得原样带进安装包
console.log("[desktop] 复制迁移 → dist/migrations");
copyDir(join(dev, "apps", "server", "migrations"), join(outDir, "migrations"), "复制迁移");

const icon = join(desktop, "build", "icon.ico");
if (!existsSync(icon)) {
  const src = join(dev, "earth-online.ico");
  if (existsSync(src)) {
    mkdirSync(dirname(icon), { recursive: true });
    copyFileSync(src, icon);
    console.log("[desktop] 已从 05-开发/earth-online.ico 复制图标");
  }
}

console.log("[desktop] 完成");
