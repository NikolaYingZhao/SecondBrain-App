const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("secondBrain", {
  dashboard: () => ipcRenderer.invoke("knowledge:dashboard"),
  search: (query) => ipcRenderer.invoke("knowledge:search", query),
  page: (id) => ipcRenderer.invoke("knowledge:page", id),
  pages: (brain) => ipcRenderer.invoke("knowledge:pages", brain),
  issues: () => ipcRenderer.invoke("knowledge:issues"),
  rebuild: () => ipcRenderer.invoke("knowledge:rebuild"),
  vaultInfo: () => ipcRenderer.invoke("vault:info"),
  chooseVault: () => ipcRenderer.invoke("vault:choose"),
  autoDetectVault: () => ipcRenderer.invoke("vault:auto-detect"),
  revealVault: () => ipcRenderer.invoke("vault:reveal"),
  onUpdated: (callback) => {
    const listener = (_event, dashboard) => callback(dashboard);
    ipcRenderer.on("knowledge:updated", listener);
    return () => ipcRenderer.removeListener("knowledge:updated", listener);
  }
});
