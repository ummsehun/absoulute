import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/constants/ipcChannels";
import { AppErrorSchema } from "../shared/schemas/common";
import {
  ScanCoverageUpdateSchema,
  ScanDiagnosticsSchema,
  ScanElevationRequiredSchema,
  ScanPerfSampleSchema,
  ScanProgressBatchSchema,
  ScanQuickReadySchema,
  ScanStartRequestSchema,
  ScanTerminalEventSchema,
} from "../shared/schemas/scan";
import { WindowStateSchema } from "../shared/schemas/window";

const electronAPI = {
  getSystemInfo: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_SYSTEM_INFO),

  getDefaultScanRoot: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_DEFAULT_SCAN_ROOT),

  scanStart: async (input) => {
    const parsed = coerceScanStartInput(input);
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_START, parsed);
  },

  scanPause: async (scanId) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_PAUSE, scanId),

  scanResume: async (scanId) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_RESUME, scanId),

  scanCancel: async (scanId) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_CANCEL, scanId),

  requestElevation: async (targetPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_REQUEST_ELEVATION, String(targetPath ?? "")),

  onScanProgressBatch: (callback) => {
    return subscribeToSchemaEvent(
      IPC_CHANNELS.SCAN_PROGRESS_BATCH,
      ScanProgressBatchSchema,
      callback,
    );
  },

  onScanError: (callback) => {
    return subscribeToSchemaEvent(IPC_CHANNELS.SCAN_ERROR, AppErrorSchema, callback);
  },

  onScanQuickReady: (callback) => {
    return subscribeToSchemaEvent(
      IPC_CHANNELS.SCAN_QUICK_READY,
      ScanQuickReadySchema,
      callback,
    );
  },

  onScanDiagnostics: (callback) => {
    return subscribeToSchemaEvent(
      IPC_CHANNELS.SCAN_DIAGNOSTICS,
      ScanDiagnosticsSchema,
      callback,
    );
  },

  onScanCoverageUpdate: (callback) => {
    return subscribeToSchemaEvent(
      IPC_CHANNELS.SCAN_COVERAGE_UPDATE,
      ScanCoverageUpdateSchema,
      callback,
    );
  },

  onScanTerminal: (callback) => {
    return subscribeToSchemaEvent(
      IPC_CHANNELS.SCAN_TERMINAL,
      ScanTerminalEventSchema,
      callback,
    );
  },

  onScanPerfSample: (callback) => {
    return subscribeToSchemaEvent(
      IPC_CHANNELS.SCAN_PERF_SAMPLE,
      ScanPerfSampleSchema,
      callback,
    );
  },

  onScanElevationRequired: (callback) => {
    return subscribeToSchemaEvent(
      IPC_CHANNELS.SCAN_ELEVATION_REQUIRED,
      ScanElevationRequiredSchema,
      callback,
    );
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
    return subscribeToSchemaEvent(
      IPC_CHANNELS.WINDOW_STATE_CHANGED,
      WindowStateSchema,
      callback,
    );
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

function coerceScanStartInput(input) {
  return parseWithSchema(
    ScanStartRequestSchema,
    input,
    "scanStart input is invalid",
  );
}

function parseWithSchema(schema, value, message) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new TypeError(message);
  }

  return parsed.data;
}

function subscribeToSchemaEvent(channel, schema, callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  const listener = (_event, payload) => {
    const parsed = schema.safeParse(payload);
    if (parsed.success) {
      callback(parsed.data);
    }
  };

  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}
