import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { UpdateManager } from "../src/updater.mjs";

function mockUpdater() {
  const updater = new EventEmitter();
  updater.autoDownload = false;
  updater.checks = 0;
  updater.checkForUpdates = async () => { updater.checks += 1; return { updateInfo: null }; };
  updater.quitAndInstall = () => {};
  return updater;
}

function collect(manager) {
  const events = [];
  const off = manager.onStatus((status) => events.push(status));
  return { events, off };
}

test("dev mode: init does not enable and check reports dev-only error", async () => {
  const updater = mockUpdater();
  const manager = new UpdateManager({ isPackaged: false, updater });
  await manager.init();
  assert.equal(updater.listenerCount("update-available"), 0);
  await manager.check();
  assert.equal(updater.checks, 0);
  assert.equal(manager.snapshot().status, "error");
  assert.match(manager.snapshot().info.message, /开发版本/);
});

test("packaged: init binds events and check delegates to autoUpdater", async () => {
  const updater = mockUpdater();
  const manager = new UpdateManager({ isPackaged: true, updater });
  await manager.init();
  assert.equal(updater.autoDownload, true);
  await manager.check();
  assert.equal(updater.checks, 1);
  assert.equal(manager.snapshot().status, "checking");
});

test("forwards available and downloading events to listeners", async () => {
  const updater = mockUpdater();
  const manager = new UpdateManager({ isPackaged: true, updater });
  await manager.init();
  const { events } = collect(manager);
  updater.emit("update-available", { version: "2.0.0" });
  updater.emit("download-progress", { percent: 42.6 });
  assert.deepEqual(events, [
    { status: "available", info: { version: "2.0.0" } },
    { status: "downloading", info: { percent: 43 } }
  ]);
});

test("forwards downloaded and error events", async () => {
  const updater = mockUpdater();
  const manager = new UpdateManager({ isPackaged: true, updater });
  await manager.init();
  const { events } = collect(manager);
  updater.emit("update-downloaded", { version: "2.0.0" });
  updater.emit("error", new Error("network down"));
  assert.deepEqual(events, [
    { status: "downloaded", info: { version: "2.0.0" } },
    { status: "error", info: { message: "network down" } }
  ]);
});

test("not-available is forwarded and snapshot reflects it", async () => {
  const updater = mockUpdater();
  const manager = new UpdateManager({ isPackaged: true, updater });
  await manager.init();
  updater.emit("update-not-available", { version: "1.1.0" });
  assert.equal(manager.snapshot().status, "not-available");
  assert.equal(manager.snapshot().info.version, "1.1.0");
});

test("quitAndInstall only works when enabled", async () => {
  const updater = mockUpdater();
  const dev = new UpdateManager({ isPackaged: false, updater });
  assert.equal(await dev.quitAndInstall(), false);
  const manager = new UpdateManager({ isPackaged: true, updater });
  await manager.init();
  assert.equal(await manager.quitAndInstall(), true);
});

test("listeners can be removed", async () => {
  const updater = mockUpdater();
  const manager = new UpdateManager({ isPackaged: true, updater });
  await manager.init();
  const { events, off } = collect(manager);
  off();
  updater.emit("update-available", { version: "2.0.0" });
  assert.equal(events.length, 0);
});

test("error event keeps message even without error instance details", async () => {
  const updater = mockUpdater();
  const manager = new UpdateManager({ isPackaged: true, updater });
  await manager.init();
  updater.emit("error", {});
  assert.equal(manager.snapshot().status, "error");
  assert.equal(manager.snapshot().info.message, "未知错误");
});
