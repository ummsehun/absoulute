import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/constants/ipcChannels";
import { AppErrorSchema } from "../shared/schemas/common";
import {
  ScanProgressBatchSchema,
  ScanStartRequestSchema,
} from "../shared/schemas/scan";
import { WindowStateSchema } from "../shared/schemas/window";

const electronAPI = {
  getSystemInfo: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_SYSTEM_INFO),

  getDefaultScanRoot: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_DEFAULT_SCAN_ROOT),

  scanStart: async (input) => {
    const parsed = ScanStartRequestSchema.parse(input);
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_START, parsed);
  },

  scanPause: async (scanId) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_PAUSE, scanId),

  scanResume: async (scanId) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_RESUME, scanId),

  scanCancel: async (scanId) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_CANCEL, scanId),

  onScanProgressBatch: (callback) => {
    const listener = (_event, payload) => {
      const parsed = ScanProgressBatchSchema.safeParse(payload);
      if (parsed.success) {
        callback(parsed.data);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.SCAN_PROGRESS_BATCH, listener);
    return () => {
      ipcRenderer.off(IPC_CHANNELS.SCAN_PROGRESS_BATCH, listener);
    };
  },

  onScanError: (callback) => {
    const listener = (_event, payload) => {
      const parsed = AppErrorSchema.safeParse(payload);
      if (parsed.success) {
        callback(parsed.data);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.SCAN_ERROR, listener);
    return () => {
      ipcRenderer.off(IPC_CHANNELS.SCAN_ERROR, listener);
    };
  },

  getWindowState: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_STATE),

  minimizeWindow: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),

  toggleMaximizeWindow: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),

  closeWindow: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),

  onWindowStateChanged: (callback) => {
    const listener = (_event, payload) => {
      const parsed = WindowStateSchema.safeParse(payload);
      if (parsed.success) {
        callback(parsed.data);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE_CHANGED, listener);
    return () => {
      ipcRenderer.off(IPC_CHANNELS.WINDOW_STATE_CHANGED, listener);
    };
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
