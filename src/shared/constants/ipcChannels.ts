export const IPC_CHANNELS = {
  APP_GET_SYSTEM_INFO: "app:get-system-info",
  SCAN_START: "scan:start",
  SCAN_CANCEL: "scan:cancel",
  SCAN_PROGRESS_BATCH: "scan:progress-batch",
  SCAN_ERROR: "scan:error",
} as const;

export type IpcChannel =
  (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
