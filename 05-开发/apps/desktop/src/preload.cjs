// 预加载脚本：只暴露"检查更新/版本信息/打开数据目录"这几个无害能力
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  info: () => ipcRenderer.invoke("desk:info"),
  status: () => ipcRenderer.invoke("desk:status"),
  check: () => ipcRenderer.invoke("desk:check"),
  promptUpdate: () => ipcRenderer.invoke("desk:prompt-update"),
  openDataDir: () => ipcRenderer.invoke("desk:open-data"),
  onUpdate: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on("desk:update", handler);
    return () => ipcRenderer.removeListener("desk:update", handler);
  },
});
