import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IPC_CHANNELS } from "../shared/constants/ipcChannels";
import { registerCspPolicy, registerSecurityGuards } from "./core/securityGuards";
import { WindowManager } from "./core/windowManager";
import { registerIpcHandlers } from "./handler/registerIpcHandlers";
import { registerAppLifecycle } from "./lifecycle/appLifecycle";
import { ScanManager } from "./manager/scanManager";
import { DiskScanService } from "./services/diskScanService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const preloadPath = resolvePreloadPath(__dirname);
const rendererHtmlPath = path.join(__dirname, "../renderer/index.html");

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    registerCspPolicy();

    const windowManager = new WindowManager({
      preloadPath,
      rendererHtmlPath,
      rendererDevUrl: process.env.ELECTRON_RENDERER_URL,
    });

    const diskScanService = new DiskScanService();
    const scanManager = new ScanManager(diskScanService);

    registerIpcHandlers(scanManager, windowManager);

    const mainWindow = windowManager.createMainWindow();
    registerSecurityGuards(mainWindow);

    windowManager.onStateChanged((state) => {
      windowManager
        .getMainWindow()
        ?.webContents.send(IPC_CHANNELS.WINDOW_STATE_CHANGED, state);
    });

    scanManager.onProgress((batch) => {
      windowManager
        .getMainWindow()
        ?.webContents.send(IPC_CHANNELS.SCAN_PROGRESS_BATCH, batch);
    });

    scanManager.onQuickReady((event) => {
      windowManager
        .getMainWindow()
        ?.webContents.send(IPC_CHANNELS.SCAN_QUICK_READY, event);
    });

    scanManager.onDiagnostics((diagnostics) => {
      windowManager
        .getMainWindow()
        ?.webContents.send(IPC_CHANNELS.SCAN_DIAGNOSTICS, diagnostics);
    });

    scanManager.onError((error) => {
      windowManager
        .getMainWindow()
        ?.webContents.send(IPC_CHANNELS.SCAN_ERROR, error);
    });

    app.on("second-instance", () => {
      windowManager.focusOrRestore();
    });

    registerAppLifecycle(() => {
      const nextWindow = windowManager.createMainWindow();
      registerSecurityGuards(nextWindow);
      return nextWindow;
    });
  });
}

function resolvePreloadPath(currentDir: string): string {
  const candidates = [
    path.join(currentDir, "../preload/index.js"),
    path.join(currentDir, "../preload/index.mjs"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}
