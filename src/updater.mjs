let autoUpdaterPromise;

function getAutoUpdater() {
  autoUpdaterPromise ??= import("electron-updater").then((module) => module.autoUpdater);
  return autoUpdaterPromise;
}

export class UpdateManager {
  constructor({ isPackaged = false, updater = null } = {}) {
    this.isPackaged = isPackaged;
    this.injectedUpdater = updater;
    this.status = "idle";
    this.info = null;
    this.listeners = new Set();
    this.enabled = false;
  }

  async init() {
    if (!this.isPackaged) return;
    const updater = await this._updater();
    this.enabled = true;
    updater.autoDownload = true;
    updater.on("checking-for-update", () => this._set("checking"));
    updater.on("update-available", (info) => this._set("available", info));
    updater.on("update-not-available", (info) => this._set("not-available", info));
    updater.on("download-progress", (progress) => this._set("downloading", { percent: Math.round(progress.percent || 0) }));
    updater.on("update-downloaded", (info) => this._set("downloaded", info));
    updater.on("error", (error) => this._set("error", { message: error?.message || "未知错误" }));
  }

  async check() {
    if (!this.enabled) {
      this._set("error", { message: "当前开发版本不支持检查更新" });
      return null;
    }
    this._set("checking");
    return (await this._updater()).checkForUpdates();
  }

  async quitAndInstall() {
    if (!this.enabled) return false;
    (await this._updater()).quitAndInstall();
    return true;
  }

  snapshot() {
    return { status: this.status, info: this.info };
  }

  onStatus(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _set(status, info = null) {
    this.status = status;
    this.info = info;
    for (const listener of this.listeners) listener({ status, info });
  }

  async _updater() {
    if (this.injectedUpdater) return this.injectedUpdater;
    return getAutoUpdater();
  }
}
