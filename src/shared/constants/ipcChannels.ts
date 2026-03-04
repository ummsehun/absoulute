export const IPC_CHANNELS = {
  APP_GET_SYSTEM_INFO: "app:get-system-info",

  SCAN_START: "scan:start",
  SCAN_CANCEL: "scan:cancel",
  SCAN_PROGRESS_BATCH: "scan:progress-batch",
  SCAN_ERROR: "scan:error",

  WINDOW_GET_STATE: "window:get-state",
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_TOGGLE_MAXIMIZE: "window:toggle-maximize",
  WINDOW_CLOSE: "window:close",
  WINDOW_STATE_CHANGED: "window:state-changed",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
