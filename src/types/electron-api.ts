import type {
  AppError,
  GetDefaultScanRootResult,
  GetScanPrivilegeHelperStatusResult,
  GetSystemInfoResult,
  GetWindowStateResult,
  ScanProgressBatch,
  ScanCancelResult,
  ScanCoverageUpdate,
  ScanDiagnostics,
  ScanElevationRequired,
  ScanPauseResult,
  ScanElevationResult,
  ScanPerfSample,
  ScanPrivilegeHelperInstallResult,
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
  getPrivilegeHelperStatus: () => Promise<GetScanPrivilegeHelperStatusResult>;
  installPrivilegeHelper: () => Promise<ScanPrivilegeHelperInstallResult>;
  requestElevation: (targetPath: string) => Promise<ScanElevationResult>;
  onScanProgressBatch: (callback: (batch: ScanProgressBatch) => void) => () => void;
  onScanQuickReady: (callback: (event: ScanQuickReady) => void) => () => void;
  onScanDiagnostics: (callback: (diagnostics: ScanDiagnostics) => void) => () => void;
  onScanCoverageUpdate: (callback: (event: ScanCoverageUpdate) => void) => () => void;
  onScanPerfSample: (callback: (event: ScanPerfSample) => void) => () => void;
  onScanElevationRequired: (callback: (event: ScanElevationRequired) => void) => () => void;
  onScanError: (callback: (error: AppError) => void) => () => void;

  getWindowState: () => Promise<GetWindowStateResult>;
  minimizeWindow: () => Promise<WindowActionResult>;
  toggleMaximizeWindow: () => Promise<WindowActionResult>;
  closeWindow: () => Promise<WindowActionResult>;
  onWindowStateChanged: (callback: (state: WindowState) => void) => () => void;
}
