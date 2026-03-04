import type {
  AppError,
  GetSystemInfoResult,
  ScanProgressBatch,
  ScanCancelResult,
  ScanStartRequest,
  ScanStartResult,
} from "./contracts";

export interface ElectronAPI {
  getSystemInfo: () => Promise<GetSystemInfoResult>;
  scanStart: (input: ScanStartRequest) => Promise<ScanStartResult>;
  scanCancel: (scanId: string) => Promise<ScanCancelResult>;
  onScanProgressBatch: (callback: (batch: ScanProgressBatch) => void) => () => void;
  onScanError: (callback: (error: AppError) => void) => () => void;
}
