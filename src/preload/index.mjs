import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/constants/ipcChannels";

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

  onScanProgressBatch: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      if (isScanProgressBatch(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.SCAN_PROGRESS_BATCH, listener);
    return () => {
      ipcRenderer.off(IPC_CHANNELS.SCAN_PROGRESS_BATCH, listener);
    };
  },

  onScanError: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      if (isAppError(payload)) {
        callback(payload);
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
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      if (isWindowState(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE_CHANGED, listener);
    return () => {
      ipcRenderer.off(IPC_CHANNELS.WINDOW_STATE_CHANGED, listener);
    };
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

function coerceScanStartInput(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("scanStart input must be an object");
  }

  const rootPath = typeof input.rootPath === "string" ? input.rootPath.trim() : "";
  if (!rootPath) {
    throw new TypeError("scanStart.rootPath must be a non-empty string");
  }

  return {
    rootPath,
    optInProtected: Boolean(input.optInProtected),
  };
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function isAppError(value) {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.recoverable === "boolean"
  );
}

function isWindowState(value) {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.isFocused === "boolean" &&
    typeof value.isMaximized === "boolean" &&
    typeof value.isMinimized === "boolean" &&
    typeof value.isFullScreen === "boolean" &&
    typeof value.isVisible === "boolean"
  );
}

function isAggDelta(value) {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.nodePath === "string" &&
    typeof value.sizeDelta === "number" &&
    Number.isFinite(value.sizeDelta) &&
    typeof value.countDelta === "number" &&
    Number.isInteger(value.countDelta)
  );
}

function isCompressedTreePatch(value) {
  if (!isObject(value)) {
    return false;
  }

  return (
    Array.isArray(value.nodesAdded) &&
    Array.isArray(value.nodesUpdated) &&
    Array.isArray(value.nodesPruned) &&
    value.nodesAdded.every((item) => typeof item === "string") &&
    value.nodesUpdated.every((item) => typeof item === "string") &&
    value.nodesPruned.every((item) => typeof item === "string")
  );
}

function isScanProgress(value) {
  if (!isObject(value)) {
    return false;
  }

  const validPhase =
    value.phase === "walking" ||
    value.phase === "paused" ||
    value.phase === "aggregating" ||
    value.phase === "compressing" ||
    value.phase === "finalizing";
  const validStage =
    value.scanStage === undefined ||
    value.scanStage === "quick" ||
    value.scanStage === "deep";

  return (
    typeof value.scanId === "string" &&
    validPhase &&
    validStage &&
    typeof value.scannedCount === "number" &&
    Number.isInteger(value.scannedCount) &&
    value.scannedCount >= 0 &&
    typeof value.totalBytes === "number" &&
    Number.isFinite(value.totalBytes) &&
    value.totalBytes >= 0 &&
    (value.currentPath === undefined || typeof value.currentPath === "string")
  );
}

function isScanProgressBatch(value) {
  if (!isObject(value)) {
    return false;
  }

  return (
    isScanProgress(value.progress) &&
    Array.isArray(value.deltas) &&
    value.deltas.every(isAggDelta) &&
    Array.isArray(value.patches) &&
    value.patches.every(isCompressedTreePatch)
  );
}
