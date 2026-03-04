import type {
  AppError,
  GetDefaultScanRootResult,
  GetSystemInfoResult,
  GetWindowStateResult,
  ScanProgressBatch,
  ScanCancelResult,
  ScanDiagnostics,
  ScanPauseResult,
  ScanQuickReady,
  ScanResumeResult,
  ScanStartRequest,
  ScanStartResult,
  WindowActionResult,
  WindowState,
} from "./contracts";

export interface ElectronAPI {
  getSystemInfo: () => Promise<GetSystemInfoResult>;
  getDefaultScanRoot: () => Promise<GetDefaultScanRootResult>;

  scanStart: (input: ScanStartRequest) => Promise<ScanStartResult>;
  scanPause: (scanId: string) => Promise<ScanPauseResult>;
  scanResume: (scanId: string) => Promise<ScanResumeResult>;
  scanCancel: (scanId: string) => Promise<ScanCancelResult>;
  onScanProgressBatch: (callback: (batch: ScanProgressBatch) => void) => () => void;
  onScanQuickReady: (callback: (event: ScanQuickReady) => void) => () => void;
  onScanDiagnostics: (callback: (diagnostics: ScanDiagnostics) => void) => () => void;
  onScanError: (callback: (error: AppError) => void) => () => void;

  getWindowState: () => Promise<GetWindowStateResult>;
  minimizeWindow: () => Promise<WindowActionResult>;
  toggleMaximizeWindow: () => Promise<WindowActionResult>;
  closeWindow: () => Promise<WindowActionResult>;
  onWindowStateChanged: (callback: (state: WindowState) => void) => () => void;
}
