import type {
  AppError,
  GetSystemInfoResult,
  GetWindowStateResult,
  ScanProgressBatch,
  ScanCancelResult,
  ScanStartRequest,
  ScanStartResult,
  WindowActionResult,
  WindowState,
} from "./contracts";

export interface ElectronAPI {
  getSystemInfo: () => Promise<GetSystemInfoResult>;

  scanStart: (input: ScanStartRequest) => Promise<ScanStartResult>;
  scanCancel: (scanId: string) => Promise<ScanCancelResult>;
  onScanProgressBatch: (callback: (batch: ScanProgressBatch) => void) => () => void;
  onScanError: (callback: (error: AppError) => void) => () => void;

  getWindowState: () => Promise<GetWindowStateResult>;
  minimizeWindow: () => Promise<WindowActionResult>;
  toggleMaximizeWindow: () => Promise<WindowActionResult>;
  closeWindow: () => Promise<WindowActionResult>;
  onWindowStateChanged: (callback: (state: WindowState) => void) => () => void;
}
