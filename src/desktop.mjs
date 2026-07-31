import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { KnowledgeService, validateVaultPath } from "./service.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const v2Root = path.resolve(currentDir, "..");
const publicRoot = path.join(v2Root, "public");
let mainWindow;
let settingsPath;
let service;

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

function initialVaultPath() {
  const saved = readSettings().vaultPath;
  const developmentDefault = path.resolve(v2Root, "..", "brains");
  return [
    process.env.SECOND_BRAIN_VAULT,
    process.env.SECONDBRAIN_VAULT,
    saved,
    developmentDefault
  ].find((candidate) => validateVaultPath(candidate).valid);
}

async function chooseVault() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择 SecondBrain 的 brains 文件夹",
    defaultPath: service.vaultPath || app.getPath("documents"),
    properties: ["openDirectory"],
    buttonLabel: "使用这个文件夹"
  });
  if (result.canceled) return service.info();

  const dashboard = service.setVault(result.filePaths[0]);
  writeSettings({ ...readSettings(), vaultPath: service.vaultPath });
  return { ...service.info(), dashboard };
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
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: "#f4f5f2",
    title: "SecondBrain",
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
  if (process.env.SECOND_BRAIN_SCREENSHOT) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        if (process.env.SECOND_BRAIN_SCREENSHOT_VIEW === "reader") {
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

app.whenReady().then(async () => {
  settingsPath = path.join(app.getPath("userData"), "settings.json");
  service = new KnowledgeService({ v2Root, vaultPath: initialVaultPath() });
  registerIpc();
  createWindow();

  if (!service.vaultPath) {
    mainWindow.once("ready-to-show", chooseVault);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
