const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("secondBrain", {
  dashboard: () => ipcRenderer.invoke("knowledge:dashboard"),
  search: (query) => ipcRenderer.invoke("knowledge:search", query),
  page: (id) => ipcRenderer.invoke("knowledge:page", id),
  pages: (brain) => ipcRenderer.invoke("knowledge:pages", brain),
  issues: () => ipcRenderer.invoke("knowledge:issues"),
  rebuild: () => ipcRenderer.invoke("knowledge:rebuild"),
  vaultInfo: () => ipcRenderer.invoke("vault:info"),
  chooseVault: () => ipcRenderer.invoke("vault:choose")
});
