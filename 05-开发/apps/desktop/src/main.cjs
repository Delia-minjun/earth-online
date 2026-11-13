const { app, BrowserWindow, dialog, shell, nativeImage } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.LIFE_PORT || 7788);
const isDev = !app.isPackaged;

let serverProc = null;
let win = null;
let quitting = false;

/** 打包后资源在 resources/ 下；开发时在 apps/desktop/dist 下 */
function resource(...parts) {
  return isDev
    ? path.join(__dirname, "..", "dist", ...parts)
    : path.join(process.resourcesPath, ...parts);
}

function healthOnce() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: PORT, path: "/api/health", timeout: 800 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await healthOnce()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function startServer() {
  const entry = resource("server.mjs");
  const webDist = resource("web");
  if (!fs.existsSync(entry)) {
    throw new Error(`找不到服务文件：${entry}\n先运行 pnpm --filter @life/desktop prepare-bundle`);
  }

  const dataDir = app.getPath("userData");
  fs.mkdirSync(dataDir, { recursive: true });

  serverProc = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      LIFE_DATA_DIR: dataDir,
      LIFE_WEB_DIST: webDist,
      LIFE_MIGRATIONS_DIR: resource("migrations"),
      PORT: String(PORT),
    },
    stdio: "ignore",
    windowsHide: true,
  });

  serverProc.on("exit", (code) => {
    if (quitting) return;
    dialog.showErrorBox(
      "本地服务已退出",
      `退出码 ${code}\n数据目录：${dataDir}\n可以重启应用再试一次。`,
    );
  });
}

/** 窗口状态偏好：fullscreen / maximized（存在 userData 下，一个几百字节的小文件） */
function prefFile() {
  return path.join(app.getPath("userData"), "window-state.txt");
}

function readWindowPref() {
  try {
    return fs.readFileSync(prefFile(), "utf8").trim();
  } catch {
    return "";
  }
}

function writeWindowPref(value) {
  try {
    fs.mkdirSync(path.dirname(prefFile()), { recursive: true });
    fs.writeFileSync(prefFile(), value, "utf8");
  } catch {
    /* 写不了就算了，不影响使用 */
  }
}

function createWindow() {
  const iconPath = isDev
    ? path.join(__dirname, "..", "build", "icon.ico")
    : path.join(process.resourcesPath, "icon.ico");

  // 记一下上次退出时是不是全屏；默认按最大化启动（等于"打开就是满屏"）
  const preferFullscreen = readWindowPref() === "fullscreen";

  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#f4f2ee",
    title: "地球 Online",
    autoHideMenuBar: true,
    fullscreen: preferFullscreen,
    icon: fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  // 启动即最大化（铺满屏幕但保留标题栏，能拖能缩）
  win.maximize();

  // 用户按 F11 切全屏 / 双击标题栏时记住，下次照旧
  win.on("enter-full-screen", () => writeWindowPref("fullscreen"));
  win.on("leave-full-screen", () => writeWindowPref("maximized"));

  win.loadURL(`http://127.0.0.1:${PORT}`);

  // 外链一律用系统浏览器打开，别在应用里跳走
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => {
    win = null;
  });
}

/** 自动更新：打包后每次启动静默检查，下载完提示重启 */
function setupUpdater() {
  if (isDev) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", async (info) => {
    const res = await dialog.showMessageBox({
      type: "info",
      buttons: ["立即重启", "下次再说"],
      defaultId: 0,
      cancelId: 1,
      title: "有新版本",
      message: `新版本 ${info.version} 已下载完成`,
      detail: "重启后生效。数据不受影响。",
    });
    if (res.response === 0) {
      quitting = true;
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on("error", () => {
    /* 没网或没有发布源时静默失败，不打扰使用 */
  });

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 6000);
}

async function boot() {
  // 如果 7788 已经有人在跑（命令行版本或另一个实例），直接用它，不再起第二个
  if (await healthOnce()) {
    createWindow();
    return;
  }

  startServer();
  const ok = await waitForServer();
  if (!ok) {
    dialog.showErrorBox(
      "启动失败",
      `本地服务没有在 ${PORT} 端口就绪。\n可能是端口被占用，或服务启动出错。\n\n可以先在命令行运行 start.cmd 看看报错。`,
    );
    app.quit();
    return;
  }
  createWindow();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(boot);
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  if (serverProc && !serverProc.killed) {
    try {
      serverProc.kill();
    } catch {
      /* 忽略 */
    }
  }
});
