export const IPC_CHANNELS = {
  APP_GET_SYSTEM_INFO: "app:get-system-info",
  APP_GET_DEFAULT_SCAN_ROOT: "app:get-default-scan-root",

  SCAN_START: "scan:start",
  SCAN_PAUSE: "scan:pause",
  SCAN_RESUME: "scan:resume",
  SCAN_CANCEL: "scan:cancel",
  SCAN_REQUEST_ELEVATION: "scan:request-elevation",
  SCAN_PROGRESS_BATCH: "scan:progress-batch",
  SCAN_QUICK_READY: "scan:quick-ready",
  SCAN_DIAGNOSTICS: "scan:diagnostics",
  SCAN_COVERAGE_UPDATE: "scan:coverage-update",
  SCAN_PERF_SAMPLE: "scan:perf-sample",
  SCAN_ELEVATION_REQUIRED: "scan:elevation-required",
  SCAN_TERMINAL: "scan:terminal",
  SCAN_ERROR: "scan:error",

  WINDOW_GET_STATE: "window:get-state",
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_TOGGLE_MAXIMIZE: "window:toggle-maximize",
  WINDOW_CLOSE: "window:close",
  WINDOW_STATE_CHANGED: "window:state-changed",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
