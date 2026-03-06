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

  requestElevation: async (targetPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_REQUEST_ELEVATION, String(targetPath ?? "")),

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

  onScanQuickReady: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      if (isScanQuickReady(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.SCAN_QUICK_READY, listener);
    return () => {
      ipcRenderer.off(IPC_CHANNELS.SCAN_QUICK_READY, listener);
    };
  },

  onScanDiagnostics: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      if (isScanDiagnostics(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.SCAN_DIAGNOSTICS, listener);
    return () => {
      ipcRenderer.off(IPC_CHANNELS.SCAN_DIAGNOSTICS, listener);
    };
  },

  onScanCoverageUpdate: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      if (isScanCoverageUpdate(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.SCAN_COVERAGE_UPDATE, listener);
    return () => {
      ipcRenderer.off(IPC_CHANNELS.SCAN_COVERAGE_UPDATE, listener);
    };
  },

  onScanTerminal: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      if (isScanTerminalEvent(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.SCAN_TERMINAL, listener);
    return () => {
      ipcRenderer.off(IPC_CHANNELS.SCAN_TERMINAL, listener);
    };
  },

  onScanPerfSample: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      if (isScanPerfSample(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.SCAN_PERF_SAMPLE, listener);
    return () => {
      ipcRenderer.off(IPC_CHANNELS.SCAN_PERF_SAMPLE, listener);
    };
  },

  onScanElevationRequired: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      if (isScanElevationRequired(payload)) {
        callback(payload);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.SCAN_ELEVATION_REQUIRED, listener);
    return () => {
      ipcRenderer.off(IPC_CHANNELS.SCAN_ELEVATION_REQUIRED, listener);
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

  const performanceProfile =
    input.performanceProfile === "balanced" ||
    input.performanceProfile === "preview-first" ||
    input.performanceProfile === "accuracy-first"
      ? input.performanceProfile
      : undefined;
  const scanMode =
    input.scanMode === "portable" ||
    input.scanMode === "portable_plus_os_accel" ||
    input.scanMode === "native_rust"
      ? input.scanMode
      : undefined;
  const accuracyMode =
    input.accuracyMode === "preview" || input.accuracyMode === "full"
      ? input.accuracyMode
      : undefined;
  const deepPolicyPreset =
    input.deepPolicyPreset === "responsive" || input.deepPolicyPreset === "exact"
      ? input.deepPolicyPreset
      : undefined;
  const elevationPolicy =
    input.elevationPolicy === "auto" ||
    input.elevationPolicy === "manual" ||
    input.elevationPolicy === "none"
      ? input.elevationPolicy
      : undefined;
  const emitPolicy = coerceEmitPolicy(input.emitPolicy);
  const concurrencyPolicy = coerceConcurrencyPolicy(input.concurrencyPolicy);

  return {
    rootPath,
    optInProtected: Boolean(input.optInProtected),
    performanceProfile,
    scanMode,
    accuracyMode,
    deepPolicyPreset,
    elevationPolicy,
    emitPolicy,
    concurrencyPolicy,
    allowNodeFallback: Boolean(input.allowNodeFallback),
    quickBudgetMs:
      typeof input.quickBudgetMs === "number" &&
      Number.isInteger(input.quickBudgetMs) &&
      input.quickBudgetMs > 0 &&
      input.quickBudgetMs <= 30_000
        ? input.quickBudgetMs
        : undefined,
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
    typeof value.quickReady === "boolean" &&
    (value.confidence === "low" ||
      value.confidence === "medium" ||
      value.confidence === "high") &&
    typeof value.estimated === "boolean" &&
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
    (value.aggBatches === undefined ||
      (Array.isArray(value.aggBatches) && value.aggBatches.every(isAggBatch))) &&
    Array.isArray(value.patches) &&
    value.patches.every(isCompressedTreePatch)
  );
}

function isAggBatch(value) {
  if (!isObject(value)) {
    return false;
  }

  return (
    Array.isArray(value.items) &&
    value.items.every(isAggDelta) &&
    (value.emittedAt === undefined ||
      (typeof value.emittedAt === "number" &&
        Number.isInteger(value.emittedAt) &&
        value.emittedAt >= 0))
  );
}

function isScanQuickReady(value) {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.scanId === "string" &&
    typeof value.rootPath === "string" &&
    typeof value.quickReadyAt === "number" &&
    Number.isInteger(value.quickReadyAt) &&
    typeof value.elapsedMs === "number" &&
    Number.isInteger(value.elapsedMs) &&
    value.elapsedMs >= 0 &&
    (value.scanStage === undefined ||
      value.scanStage === "quick" ||
      value.scanStage === "deep") &&
    (value.confidence === "low" ||
      value.confidence === "medium" ||
      value.confidence === "high") &&
    typeof value.estimated === "boolean"
  );
}

function isScanDiagnostics(value) {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.scanId === "string" &&
    (value.phase === "walking" ||
      value.phase === "paused" ||
      value.phase === "aggregating" ||
      value.phase === "compressing" ||
      value.phase === "finalizing") &&
    (value.scanStage === undefined ||
      value.scanStage === "quick" ||
      value.scanStage === "deep") &&
    typeof value.elapsedMs === "number" &&
    Number.isInteger(value.elapsedMs) &&
    value.elapsedMs >= 0 &&
    typeof value.scannedCount === "number" &&
    Number.isInteger(value.scannedCount) &&
    value.scannedCount >= 0 &&
    typeof value.totalBytes === "number" &&
    Number.isFinite(value.totalBytes) &&
    value.totalBytes >= 0 &&
    typeof value.queueDepth === "number" &&
    Number.isInteger(value.queueDepth) &&
    value.queueDepth >= 0 &&
    typeof value.recoverableErrors === "number" &&
    Number.isInteger(value.recoverableErrors) &&
    value.recoverableErrors >= 0 &&
    typeof value.permissionErrors === "number" &&
    Number.isInteger(value.permissionErrors) &&
    value.permissionErrors >= 0 &&
    typeof value.ioErrors === "number" &&
    Number.isInteger(value.ioErrors) &&
    value.ioErrors >= 0 &&
    (value.filesPerSec === undefined ||
      (typeof value.filesPerSec === "number" &&
        Number.isFinite(value.filesPerSec) &&
        value.filesPerSec >= 0)) &&
    (value.stageElapsedMs === undefined ||
      (typeof value.stageElapsedMs === "number" &&
        Number.isInteger(value.stageElapsedMs) &&
        value.stageElapsedMs >= 0)) &&
    (value.ioWaitRatio === undefined ||
      (typeof value.ioWaitRatio === "number" &&
        Number.isFinite(value.ioWaitRatio) &&
        value.ioWaitRatio >= 0 &&
        value.ioWaitRatio <= 1)) &&
    (value.hotPath === undefined || typeof value.hotPath === "string") &&
    (value.coverage === undefined || isScanCoverage(value.coverage)) &&
    (value.softSkippedByPolicy === undefined ||
      (typeof value.softSkippedByPolicy === "number" &&
        Number.isInteger(value.softSkippedByPolicy) &&
        value.softSkippedByPolicy >= 0)) &&
    (value.deferredByBudget === undefined ||
      (typeof value.deferredByBudget === "number" &&
        Number.isInteger(value.deferredByBudget) &&
        value.deferredByBudget >= 0)) &&
    (value.inflightStats === undefined || isScanInflightStats(value.inflightStats)) &&
    (value.engine === undefined ||
      value.engine === "node" ||
      value.engine === "native") &&
    (value.fallbackReason === undefined ||
      typeof value.fallbackReason === "string") &&
    (value.cpuHint === undefined || typeof value.cpuHint === "string") &&
    (value.estimatedDirectories === undefined ||
      (typeof value.estimatedDirectories === "number" &&
        Number.isInteger(value.estimatedDirectories) &&
        value.estimatedDirectories >= 0))
  );
}

function isScanCoverage(value) {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.scanned === "number" &&
    Number.isInteger(value.scanned) &&
    value.scanned >= 0 &&
    typeof value.blockedByPolicy === "number" &&
    Number.isInteger(value.blockedByPolicy) &&
    value.blockedByPolicy >= 0 &&
    typeof value.blockedByPermission === "number" &&
    Number.isInteger(value.blockedByPermission) &&
    value.blockedByPermission >= 0 &&
    typeof value.elevationRequired === "boolean"
  );
}

function isScanCoverageUpdate(value) {
  return (
    isObject(value) &&
    typeof value.scanId === "string" &&
    isScanCoverage(value.coverage)
  );
}

function isScanTerminalEvent(value) {
  return (
    isObject(value) &&
    typeof value.scanId === "string" &&
    (value.status === "done" ||
      value.status === "canceled" ||
      value.status === "failed") &&
    typeof value.finishedAt === "number" &&
    Number.isInteger(value.finishedAt) &&
    value.finishedAt > 0
  );
}

function isScanPerfSample(value) {
  return (
    isObject(value) &&
    typeof value.scanId === "string" &&
    typeof value.filesPerSec === "number" &&
    Number.isFinite(value.filesPerSec) &&
    value.filesPerSec >= 0 &&
    typeof value.stageElapsedMs === "number" &&
    Number.isInteger(value.stageElapsedMs) &&
    value.stageElapsedMs >= 0 &&
    typeof value.ioWaitRatio === "number" &&
    Number.isFinite(value.ioWaitRatio) &&
    value.ioWaitRatio >= 0 &&
    value.ioWaitRatio <= 1 &&
    typeof value.queueDepth === "number" &&
    Number.isInteger(value.queueDepth) &&
    value.queueDepth >= 0 &&
    (value.hotPath === undefined || typeof value.hotPath === "string") &&
    (value.coverage === undefined || isScanCoverage(value.coverage)) &&
    (value.softSkippedByPolicy === undefined ||
      (typeof value.softSkippedByPolicy === "number" &&
        Number.isInteger(value.softSkippedByPolicy) &&
        value.softSkippedByPolicy >= 0)) &&
    (value.deferredByBudget === undefined ||
      (typeof value.deferredByBudget === "number" &&
        Number.isInteger(value.deferredByBudget) &&
        value.deferredByBudget >= 0)) &&
    (value.inflightStats === undefined || isScanInflightStats(value.inflightStats))
  );
}

function isScanInflightStats(value) {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.inFlight === "number" &&
    Number.isInteger(value.inFlight) &&
    value.inFlight >= 0 &&
    (value.queuedDirs === undefined ||
      (typeof value.queuedDirs === "number" &&
        Number.isInteger(value.queuedDirs) &&
        value.queuedDirs >= 0))
  );
}

function isScanElevationRequired(value) {
  return (
    isObject(value) &&
    typeof value.scanId === "string" &&
    typeof value.targetPath === "string" &&
    typeof value.reason === "string" &&
    (value.policy === "auto" || value.policy === "manual" || value.policy === "none")
  );
}

function coerceEmitPolicy(input) {
  if (!isObject(input)) {
    return undefined;
  }

  const aggBatchMaxItems =
    typeof input.aggBatchMaxItems === "number" &&
    Number.isInteger(input.aggBatchMaxItems) &&
    input.aggBatchMaxItems > 0 &&
    input.aggBatchMaxItems <= 20_000
      ? input.aggBatchMaxItems
      : undefined;
  const aggBatchMaxMs =
    typeof input.aggBatchMaxMs === "number" &&
    Number.isInteger(input.aggBatchMaxMs) &&
    input.aggBatchMaxMs > 0 &&
    input.aggBatchMaxMs <= 5_000
      ? input.aggBatchMaxMs
      : undefined;
  const progressIntervalMs =
    typeof input.progressIntervalMs === "number" &&
    Number.isInteger(input.progressIntervalMs) &&
    input.progressIntervalMs > 0 &&
    input.progressIntervalMs <= 5_000
      ? input.progressIntervalMs
      : undefined;

  if (
    aggBatchMaxItems === undefined &&
    aggBatchMaxMs === undefined &&
    progressIntervalMs === undefined
  ) {
    return undefined;
  }

  return {
    aggBatchMaxItems,
    aggBatchMaxMs,
    progressIntervalMs,
  };
}

function coerceConcurrencyPolicy(input) {
  if (!isObject(input)) {
    return undefined;
  }

  const min =
    typeof input.min === "number" &&
    Number.isInteger(input.min) &&
    input.min > 0 &&
    input.min <= 256
      ? input.min
      : undefined;
  const max =
    typeof input.max === "number" &&
    Number.isInteger(input.max) &&
    input.max > 0 &&
    input.max <= 256
      ? input.max
      : undefined;
  const adaptive =
    typeof input.adaptive === "boolean" ? input.adaptive : undefined;

  if (min === undefined && max === undefined && adaptive === undefined) {
    return undefined;
  }

  return {
    min,
    max,
    adaptive,
  };
}
