const { app, BrowserWindow, dialog, ipcMain, shell, nativeImage } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.LIFE_PORT || 7788);
const isDev = !app.isPackaged;

// userData 默认取 package.json 的 name（@life/desktop → AppData\Roaming\@life\desktop）。
// 显式设成显示名，目录稳定可读，以后改包名也不会丢数据。
app.setName("地球 Online");

let serverProc = null;let win = null;
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

  const dir = dataDir();

  serverProc = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      LIFE_DATA_DIR: dir,
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
      `退出码 ${code}\n数据目录：${dir}\n可以重启应用再试一次。`,
    );
  });
}

/* ---------------- 数据目录 ---------------- */

const DB_FILES = ["life.db", "life.db-wal", "life.db-shm"];

function dataDir() {
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function copyDb(fromDir, toDir) {
  for (const f of DB_FILES) {
    const src = path.join(fromDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(toDir, f));
  }
}

/**
 * 0.1.10 及更早的版本把 userData 落在 AppData\Roaming\@life\desktop，
 * 改名之后要把它搬过来，否则老用户升级后会看到空库。
 */
function migrateLegacyUserData() {
  const target = dataDir();
  if (fs.existsSync(path.join(target, "life.db"))) return;

  const legacy = path.join(app.getPath("appData"), "@life", "desktop");
  if (!fs.existsSync(path.join(legacy, "life.db"))) return;

  copyDb(legacy, target);
  console.log(`[earth-online] 已从旧目录迁移数据库：${legacy}`);
}

/** 找一找机器上可能已有的库（便携版/开发版常见位置） */
function findExistingDbs() {
  const roots = [
    process.env.LIFE_DATA_DIR,
    path.join(path.dirname(process.execPath), "data"),
    path.join(process.resourcesPath ?? "", "..", "data"),
    path.join(path.dirname(process.execPath), "..", "data"),
  ].filter(Boolean);

  const found = [];
  for (const dir of roots) {
    const file = path.join(dir, "life.db");
    if (fs.existsSync(file) && !found.includes(file)) found.push(file);
  }
  return found;
}

/**
 * 首次启动准备数据库：优先用已有的，找不到就问用户要。
 * 一旦放进 userData，之后所有版本升级都读同一个文件。
 */
async function ensureDatabase() {
  const dir = dataDir();
  if (fs.existsSync(path.join(dir, "life.db"))) return true;

  const candidates = findExistingDbs();
  if (candidates.length === 1) {
    copyDb(path.dirname(candidates[0]), dir);
    dialog.showMessageBox({
      type: "info",
      title: "已找到旧数据",
      message: "已自动导入已有的数据库",
      detail: `${candidates[0]}\n\n之后所有更新都会继续用这一份，不会丢。`,
    });
    return true;
  }

  const pick = await dialog.showMessageBox({
    type: "question",
    title: "第一次启动",
    message: "没有找到现有的数据库",
    detail:
      "如果你之前用过网页版/命令行版，可以选它的 life.db（通常在 05-开发\\data\\life.db）。\n" +
      "选「从空白开始」则会新建一个空库。",
    buttons: ["选择已有的 life.db", "从空白开始"],
    defaultId: 0,
    cancelId: 1,
  });

  if (pick.response === 0) {
    const chosen = await dialog.showOpenDialog({
      title: "选择 life.db",
      properties: ["openFile"],
      filters: [{ name: "SQLite 数据库", extensions: ["db"] }],
    });
    const file = chosen.filePaths[0];
    if (file) {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(file, path.join(dir, "life.db"));
      // 顺带把同目录的 wal/shm 也带上，避免丢掉最近的写入
      for (const f of ["life.db-wal", "life.db-shm"]) {
        const src = path.join(path.dirname(file), f);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f));
      }
      return true;
    }
  }

  return true; // 从空白开始：服务端会自动建表
}

/* ---------------- 窗口 ---------------- */

/** 窗口状态偏好：fullscreen / maximized（几百字节的小文件） */
function prefFile() {
  return path.join(dataDir(), "window-state.txt");
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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
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

/* ---------------- 更新状态（可见 + 落盘） ---------------- */

let autoUpdaterRef = null;

let updateState = {
  state: "idle", // idle | checking | available | downloading | downloaded | latest | error | unsupported
  version: null,
  percent: 0,
  detail: "",
  at: "",
};

function logUpdate(line) {
  try {
    const f = path.join(dataDir(), "update.log");
    fs.appendFileSync(f, `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    /* 日志写不了不影响功能 */
  }
}

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch, at: new Date().toISOString() };
  logUpdate(`${updateState.state} ${updateState.version ?? ""} ${updateState.detail}`);
  if (win && !win.isDestroyed()) {
    win.webContents.send("desk:update", updateState);
  }
}

/** 自动更新：启动后检查；状态随时可在设置页看到 */
function setupUpdater() {
  if (isDev) {
    setUpdateState({ state: "unsupported", detail: "开发模式不检查更新" });
    return;
  }

  // updater.cjs 是构建时打好的单文件（desktop 包没有 node_modules），
  // 直接 require("electron-updater") 会在安装后失败
  let autoUpdater;
  try {
    ({ autoUpdater } = require(path.join(resource("updater.cjs"))));
  } catch (err) {
    setUpdateState({ state: "error", detail: `加载更新模块失败：${err?.message ?? err}` });
    return;
  }

  autoUpdaterRef = autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m) => logUpdate(`info ${m}`),
    warn: (m) => logUpdate(`warn ${m}`),
    error: (m) => logUpdate(`error ${m}`),
    debug: () => {},
  };

  autoUpdater.on("checking-for-update", () => setUpdateState({ state: "checking", detail: "" }));
  autoUpdater.on("update-available", (info) =>
    setUpdateState({ state: "available", version: info?.version ?? null, percent: 0 }),
  );
  autoUpdater.on("update-not-available", () =>
    setUpdateState({ state: "latest", version: app.getVersion(), detail: "已是最新版本" }),
  );
  autoUpdater.on("download-progress", (p) =>
    setUpdateState({ state: "downloading", percent: Math.round(p?.percent ?? 0) }),
  );
  autoUpdater.on("update-downloaded", async (info) => {
    setUpdateState({ state: "downloaded", version: info?.version ?? null, percent: 100 });
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
  autoUpdater.on("error", (err) =>
    setUpdateState({ state: "error", detail: String(err?.message ?? err) }),
  );

  setTimeout(() => {
    void runUpdateCheck();
  }, 6000);
}

/** 统一入口：自动检查与手动检查都走这里 */
async function runUpdateCheck() {
  if (!autoUpdaterRef) {
    setUpdateState({ state: "unsupported", detail: "当前环境不支持自动更新" });
    return updateState;
  }
  try {
    setUpdateState({ state: "checking", detail: "" });
    await autoUpdaterRef.checkForUpdates();
  } catch (err) {
    setUpdateState({ state: "error", detail: String(err?.message ?? err) });
  }
  return updateState;
}

/* ---------------- 与页面通信 ---------------- */

function setupIpc() {
  ipcMain.handle("desk:info", () => ({
    version: app.getVersion(),
    dataDir: dataDir(),
    packaged: app.isPackaged,
  }));
  ipcMain.handle("desk:status", () => updateState);
  ipcMain.handle("desk:check", () => runUpdateCheck());
  ipcMain.handle("desk:open-data", async () => {
    await shell.openPath(dataDir());
    return true;
  });
}

async function boot() {
  setupIpc();
  migrateLegacyUserData();
  await ensureDatabase();

  // 如果 7788 已经有人在跑（命令行版本或另一个实例），直接用它，不再起第二个
  if (await healthOnce()) {
    createWindow();
    setupUpdater();
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
  setupUpdater();
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
