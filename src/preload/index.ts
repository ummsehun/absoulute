import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/constants/ipcChannels";
import {
  ScanProgressBatchSchema,
  ScanStartRequestSchema,
} from "../shared/schemas/scan";
import { AppErrorSchema } from "../shared/schemas/common";
import type { ElectronAPI } from "../types/electron-api";

const electronAPI: ElectronAPI = {
  getSystemInfo: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_SYSTEM_INFO),

  scanStart: async (input) => {
    const parsed = ScanStartRequestSchema.parse(input);
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_START, parsed);
  },

  scanCancel: async (scanId) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_CANCEL, scanId),

  onScanProgressBatch: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
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
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
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
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
