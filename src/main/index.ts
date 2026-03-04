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
import { requestElevation } from "./services/security/macosPrivilegeHelper";

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
    void promptLibraryPermissionOnStartup(windowManager);

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

    scanManager.onCoverage((coverage) => {
      windowManager
        .getMainWindow()
        ?.webContents.send(IPC_CHANNELS.SCAN_COVERAGE_UPDATE, coverage);
    });

    scanManager.onPerfSample((sample) => {
      windowManager
        .getMainWindow()
        ?.webContents.send(IPC_CHANNELS.SCAN_PERF_SAMPLE, sample);
    });

    scanManager.onElevationRequired((event) => {
      windowManager
        .getMainWindow()
        ?.webContents.send(IPC_CHANNELS.SCAN_ELEVATION_REQUIRED, event);
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

async function promptLibraryPermissionOnStartup(windowManager: WindowManager): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }
  if (process.env.SCAN_PROMPT_LIBRARY_PERMISSION_ON_STARTUP === "0") {
    return;
  }

  const targetPath = path.join(app.getPath("home"), "Library");
  const runPrompt = async (): Promise<void> => {
    const result = await requestElevation(targetPath).catch(() => ({ granted: false }));
    if (result.granted) {
      return;
    }

    windowManager.getMainWindow()?.webContents.send(IPC_CHANNELS.SCAN_ELEVATION_REQUIRED, {
      scanId: "startup-permission-check",
      targetPath,
      reason: "macOS Full Disk Access 권한이 필요합니다. 설정에서 이 앱을 허용해 주세요.",
      policy: "manual" as const,
    });
  };

  const window = windowManager.getMainWindow();
  if (!window) {
    return;
  }

  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", () => {
      void runPrompt();
    });
    return;
  }

  await runPrompt();
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
