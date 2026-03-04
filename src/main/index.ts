import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IPC_CHANNELS } from "../shared/constants/ipcChannels";
import { registerSecurityGuards, registerCspPolicy } from "./core/securityGuards";
import { registerIpcHandlers } from "./handler/registerIpcHandlers";
import { registerAppLifecycle } from "./lifecycle/appLifecycle";
import { ScanManager } from "./manager/scanManager";
import { DiskScanService } from "./services/diskScanService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  registerSecurityGuards(window);

  const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererDevUrl) {
    void window.loadURL(rendererDevUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  window.on("closed", () => {
    if (mainWindow?.id === window.id) {
      mainWindow = null;
    }
  });

  return window;
}

app.whenReady().then(() => {
  registerCspPolicy();

  const diskScanService = new DiskScanService();
  const scanManager = new ScanManager(diskScanService);

  registerIpcHandlers(scanManager);

  mainWindow = createMainWindow();

  scanManager.onProgress((batch) => {
    mainWindow?.webContents.send(IPC_CHANNELS.SCAN_PROGRESS_BATCH, batch);
  });

  scanManager.onError((error) => {
    mainWindow?.webContents.send(IPC_CHANNELS.SCAN_ERROR, error);
  });

  registerAppLifecycle(() => {
    mainWindow = createMainWindow();
    return mainWindow;
  });
});
