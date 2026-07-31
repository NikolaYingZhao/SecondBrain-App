import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { KnowledgeService } from "./service.mjs";
import { findVaultPath } from "./vault-discovery.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const v2Root = path.resolve(currentDir, "..");
const publicRoot = path.join(v2Root, "public");
let mainWindow;
let settingsPath;
let service;
let vaultWatcher;
let refreshTimer;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

function initialVaultPath({ ignoreSaved = false } = {}) {
  return findVaultPath({
    saved: ignoreSaved ? null : readSettings().vaultPath,
    v2Root,
    documentsPath: app.getPath("documents"),
    executablePath: app.getPath("exe")
  });
}

function stopVaultWatcher() {
  clearTimeout(refreshTimer);
  refreshTimer = null;
  vaultWatcher?.close();
  vaultWatcher = null;
}

function startVaultWatcher() {
  stopVaultWatcher();
  if (!service.vaultPath) return;
  try {
    vaultWatcher = fs.watch(service.vaultPath, { recursive: true }, (_eventType, filename) => {
      if (filename && !/\.(md|json)$/i.test(filename)) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        try {
          const dashboard = service.rebuild();
          mainWindow?.webContents.send("knowledge:updated", dashboard);
        } catch (error) {
          console.error("Background refresh failed:", error);
        }
      }, 900);
    });
  } catch (error) {
    console.warn("Automatic refresh is unavailable:", error.message);
  }
}

function useVault(candidate) {
  const dashboard = service.setVault(candidate);
  writeSettings({ ...readSettings(), vaultPath: service.vaultPath });
  startVaultWatcher();
  return { ...service.info(), dashboard };
}

async function chooseVault() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择你的 SecondBrain 文件夹",
    defaultPath: service.vaultPath || app.getPath("documents"),
    properties: ["openDirectory"],
    buttonLabel: "连接此文件夹"
  });
  if (result.canceled) return { ...service.info(), canceled: true };

  try {
    return useVault(result.filePaths[0]);
  } catch {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "这里没有找到 SecondBrain",
      message: "请选择 SecondBrain 主文件夹，或其中存放知识内容的文件夹。",
      buttons: ["知道了"]
    });
    return service.info();
  }
}

function autoDetectVault() {
  const detected = initialVaultPath({ ignoreSaved: true });
  return detected ? useVault(detected) : service.info();
}

async function revealVault() {
  if (!service.vaultPath) return false;
  await shell.openPath(path.dirname(service.vaultPath));
  return true;
}

function registerIpc() {
  ipcMain.handle("knowledge:dashboard", () => service.dashboard());
  ipcMain.handle("knowledge:search", (_event, query) => service.search(query));
  ipcMain.handle("knowledge:page", (_event, id) => service.page(id));
  ipcMain.handle("knowledge:pages", (_event, brain) => service.pages(brain));
  ipcMain.handle("knowledge:issues", () => service.issues());
  ipcMain.handle("knowledge:rebuild", () => service.rebuild());
  ipcMain.handle("vault:info", () => service.info());
  ipcMain.handle("vault:choose", chooseVault);
  ipcMain.handle("vault:auto-detect", autoDetectVault);
  ipcMain.handle("vault:reveal", revealVault);
}

function createWindow() {
  const savedBounds = readSettings().windowBounds || {};
  mainWindow = new BrowserWindow({
    width: Math.max(980, Number(savedBounds.width) || 1440),
    height: Math.max(680, Number(savedBounds.height) || 920),
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: "#f4f5f2",
    title: "SecondBrain",
    icon: path.join(v2Root, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(currentDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(publicRoot, "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", () => {
    if (!mainWindow?.isDestroyed()) {
      writeSettings({ ...readSettings(), windowBounds: mainWindow.getBounds() });
    }
  });
  if (process.env.SECOND_BRAIN_SCREENSHOT) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        if (process.env.SECOND_BRAIN_SCREENSHOT_VIEW === "settings") {
          await mainWindow.webContents.executeJavaScript(`
            document.querySelector('#settings-dialog')?.classList.add('open');
          `);
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else if (process.env.SECOND_BRAIN_SCREENSHOT_VIEW === "reader") {
          await mainWindow.webContents.executeJavaScript(`
            document.querySelector('[data-view="library"]').click();
          `);
          await new Promise((resolve) => setTimeout(resolve, 500));
          await mainWindow.webContents.executeJavaScript(`
            document.querySelector('.brain-browser-item')?.click();
          `);
          await new Promise((resolve) => setTimeout(resolve, 700));
          await mainWindow.webContents.executeJavaScript(`
            document.querySelector('.browse-row')?.click();
          `);
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
        const image = await mainWindow.webContents.capturePage();
        fs.writeFileSync(process.env.SECOND_BRAIN_SCREENSHOT, image.toPNG());
        app.quit();
      }, 2500);
    });
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  app.setAppUserModelId("com.secondbrain.desktop");
  settingsPath = path.join(app.getPath("userData"), "settings.json");
  try {
    service = new KnowledgeService({ v2Root, vaultPath: initialVaultPath() });
  } catch (error) {
    console.error("Automatic library setup failed:", error);
    service = new KnowledgeService({ v2Root });
  }
  if (service.vaultPath) startVaultWatcher();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  stopVaultWatcher();
  if (process.platform !== "darwin") app.quit();
});
