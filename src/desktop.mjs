import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { KnowledgeService } from "./service.mjs";
import { findVaultPath } from "./vault-discovery.mjs";
import { UpdateManager } from "./updater.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const v2Root = path.resolve(currentDir, "..");
const publicRoot = path.join(v2Root, "public");
let mainWindow;
let settingsPath;
let service;
let vaultWatcher;
let refreshTimer;
const updater = new UpdateManager({ isPackaged: app.isPackaged });

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
  ipcMain.handle("knowledge:add-note", (_event, payload) => service.addReadingNote(payload || {}));
  ipcMain.handle("knowledge:pages", (_event, brain) => service.pages(brain));
  ipcMain.handle("knowledge:issues", () => service.issues());
  ipcMain.handle("knowledge:rebuild", () => service.rebuild());
  ipcMain.handle("vault:info", () => service.info());
  ipcMain.handle("vault:choose", chooseVault);
  ipcMain.handle("vault:auto-detect", autoDetectVault);
  ipcMain.handle("vault:reveal", revealVault);
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:update-status", () => updater.snapshot());
  ipcMain.handle("app:check-update", () => updater.check());
  ipcMain.handle("app:quit-install", () => updater.quitAndInstall());
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
        if (process.env.SECOND_BRAIN_SCREENSHOT_TWO_SHOTS) {
          const first = service.index?.summary.generatedAt || "no-index";
          fs.writeFileSync(`${process.env.SECOND_BRAIN_SCREENSHOT}.first.txt`, first, "utf8");
          const touch = process.env.SECOND_BRAIN_SCREENSHOT_TOUCH;
          if (touch && fs.existsSync(touch)) {
            const stamp = new Date();
            fs.utimesSync(touch, stamp, stamp);
          }
          await new Promise((resolve) => setTimeout(resolve, 2600));
          const second = service.index?.summary.generatedAt || "no-index";
          fs.writeFileSync(`${process.env.SECOND_BRAIN_SCREENSHOT}.second.txt`, second, "utf8");
          const image = await mainWindow.webContents.capturePage();
          fs.writeFileSync(process.env.SECOND_BRAIN_SCREENSHOT, image.toPNG());
          app.quit();
          return;
        }
        if (process.env.SECOND_BRAIN_SCREENSHOT_VIEW === "settings") {
          await mainWindow.webContents.executeJavaScript(`
            document.querySelector('#settings-dialog')?.classList.add('open');
          `);
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else if (process.env.SECOND_BRAIN_SCREENSHOT_VIEW === "library") {
          await mainWindow.webContents.executeJavaScript(`
            document.querySelector('[data-view="library"]').click();
          `);
          await new Promise((resolve) => setTimeout(resolve, 700));
          if (process.env.SECOND_BRAIN_SCREENSHOT_BRAIN) {
            await mainWindow.webContents.executeJavaScript(`
              const select = document.querySelector('#brain-filter');
              select.value = ${JSON.stringify(process.env.SECOND_BRAIN_SCREENSHOT_BRAIN)};
              select.dispatchEvent(new Event('change'));
            `);
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
          if (process.env.SECOND_BRAIN_SCREENSHOT_DEBUG) {
            const widths = await mainWindow.webContents.executeJavaScript(`
              (() => {
                const width = (el) => { const r = el?.getBoundingClientRect(); return r ? Math.round(r.width) : 'missing'; };
                const view = document.querySelector('.view.active');
                return {
                  view: width(view),
                  layout: width(document.querySelector('.library-layout')),
                  content: width(document.querySelector('.library-content')),
                  results: width(document.querySelector('.library-results')),
                  grid: width(document.querySelector('.brain-browser-grid')),
                  item: width(document.querySelector('.brain-browser-item')),
                  gridCols: getComputedStyle(document.querySelector('.brain-browser-grid')).gridTemplateColumns,
                  layoutCols: getComputedStyle(document.querySelector('.library-layout')).gridTemplateColumns,
                  layoutDisplay: getComputedStyle(document.querySelector('.library-layout')).display,
                  viewDisplay: getComputedStyle(document.querySelector('.view.active')).display,
                  categoryNav: width(document.querySelector('.category-nav')),
                  categoryDisplay: getComputedStyle(document.querySelector('.category-nav')).display,
                  contentGridColumn: getComputedStyle(document.querySelector('.library-content')).gridColumn,
                  resultsDisplay: getComputedStyle(document.querySelector('.library-results')).display,
                  layoutChildren: [...document.querySelector('.library-layout').children].map((el) => ({ tag: el.tagName, cls: el.className, w: Math.round(el.getBoundingClientRect().width) })),
                  bodyWidth: document.body.clientWidth,
                  mainWidth: width(document.querySelector('.main'))
                };
              })()
            `);
            fs.writeFileSync(process.env.SECOND_BRAIN_SCREENSHOT_DEBUG, JSON.stringify(widths, null, 2), "utf8");
          }
        } else if (["reader", "reader-annotation"].includes(process.env.SECOND_BRAIN_SCREENSHOT_VIEW)) {
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
          if (process.env.SECOND_BRAIN_SCREENSHOT_SCROLL === "reader-bottom") {
            await mainWindow.webContents.executeJavaScript(`
              const scroll = document.querySelector('.reader-scroll');
              scroll?.scrollTo({ top: scroll.scrollHeight, behavior: 'instant' });
            `);
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
          if (process.env.SECOND_BRAIN_SCREENSHOT_VIEW === "reader-annotation") {
            await mainWindow.webContents.executeJavaScript(`
              const paragraph = document.querySelector('.reader-content p');
              if (paragraph) {
                const range = document.createRange();
                range.selectNodeContents(paragraph);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                document.querySelector('.reader-content').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              }
            `);
            await new Promise((resolve) => setTimeout(resolve, 300));
            await mainWindow.webContents.executeJavaScript(`
              document.querySelector('#selection-bubble')?.click();
            `);
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
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

  updater.onStatus((status) => {
    mainWindow?.webContents.send("app:update-status", status);
  });
  await updater.init();
  setTimeout(() => {
    updater.check().catch((error) => console.error("Update check failed:", error));
  }, 8000);

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
