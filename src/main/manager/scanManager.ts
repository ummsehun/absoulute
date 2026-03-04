import type {
  AppError,
  ScanCancelResult,
  ScanStartRequest,
  ScanStartResult,
} from "../../types/contracts";
import { DiskScanService } from "../services/diskScanService";
import { unknownToAppError } from "../utils/appError";

export class ScanManager {
  constructor(private readonly diskScanService: DiskScanService) {}

  async start(input: ScanStartRequest): Promise<ScanStartResult> {
    try {
      const data = await this.diskScanService.startScan(input);
      return { ok: true, data };
    } catch (error) {
      const appError = unknownToAppError(error);
      this.diskScanService.emitError(appError);
      return { ok: false, error: appError };
    }
  }

  async cancel(scanId: string): Promise<ScanCancelResult> {
    try {
      const cancelled = this.diskScanService.cancelScan(scanId);
      return {
        ok: true,
        data: {
          ok: cancelled,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: unknownToAppError(error),
      };
    }
  }

  onProgress(listener: Parameters<DiskScanService["onProgress"]>[0]): () => void {
    return this.diskScanService.onProgress(listener);
  }

  onError(listener: (error: AppError) => void): () => void {
    return this.diskScanService.onError(listener);
  }
}
