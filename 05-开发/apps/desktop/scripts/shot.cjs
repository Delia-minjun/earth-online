// 截图验证脚本：把页面在 Electron 里渲染一次并保存 PNG
// 用法：electron scripts/shot.cjs（环境变量 SHOT_URL / SHOT_OUT / SHOT_W / SHOT_H）
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");

const URL = process.env.SHOT_URL || "http://127.0.0.1:7788";
const OUT = process.env.SHOT_OUT || "shot.png";
const W = Number(process.env.SHOT_W || 1400);
const H = Number(process.env.SHOT_H || 900);
const WAIT = Number(process.env.SHOT_WAIT || 3500);

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    webPreferences: { offscreen: true, contextIsolation: true },
  });
  await win.loadURL(URL);
  await new Promise((r) => setTimeout(r, WAIT));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log(`saved ${OUT} (${img.getSize().width}x${img.getSize().height})`);
  app.quit();
});
