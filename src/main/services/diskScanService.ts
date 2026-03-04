import fs from "node:fs/promises";
import crypto from "node:crypto";
import type {
  AppError,
  ScanProgressBatch,
  ScanStartRequest,
  ScanStartResponse,
} from "../../types/contracts";
import { evaluateRootPath } from "../core/securityPolicy";
import { makeAppError } from "../utils/appError";

interface ScanJob {
  timer: NodeJS.Timeout;
  scannedCount: number;
  totalBytes: number;
  currentPath: string;
}

export class DiskScanService {
  private readonly jobs = new Map<string, ScanJob>();
  private readonly progressListeners = new Set<(batch: ScanProgressBatch) => void>();
  private readonly errorListeners = new Set<(error: AppError) => void>();

  onProgress(listener: (batch: ScanProgressBatch) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  onError(listener: (error: AppError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async startScan(input: ScanStartRequest): Promise<ScanStartResponse> {
    const decision = await evaluateRootPath(input.rootPath, input.optInProtected);
    if (!decision.allowed && decision.error) {
      throw decision.error;
    }

    await this.assertPathReadable(input.rootPath);

    const scanId = crypto.randomUUID();
    const startedAt = Date.now();

    const job: ScanJob = {
      timer: setInterval(() => {
        this.tick(scanId, decision.normalizedPath);
      }, 150),
      scannedCount: 0,
      totalBytes: 0,
      currentPath: decision.normalizedPath,
    };

    this.jobs.set(scanId, job);
    return { scanId, startedAt };
  }

  cancelScan(scanId: string): boolean {
    const job = this.jobs.get(scanId);
    if (!job) {
      return false;
    }

    clearInterval(job.timer);
    this.jobs.delete(scanId);
    return true;
  }

  private tick(scanId: string, rootPath: string): void {
    const job = this.jobs.get(scanId);
    if (!job) {
      return;
    }

    job.scannedCount += 128;
    job.totalBytes += 8 * 1024 * 1024;
    job.currentPath = rootPath;

    const batch: ScanProgressBatch = {
      progress: {
        scanId,
        phase: job.scannedCount >= 4096 ? "finalizing" : "walking",
        scannedCount: job.scannedCount,
        totalBytes: job.totalBytes,
        currentPath: job.currentPath,
      },
      deltas: [],
      patches: [],
    };

    for (const listener of this.progressListeners) {
      listener(batch);
    }

    if (job.scannedCount >= 4096) {
      this.cancelScan(scanId);
    }
  }

  private async assertPathReadable(rootPath: string): Promise<void> {
    try {
      await fs.access(rootPath);
    } catch {
      throw makeAppError("E_IO", "Root path is not readable", true, {
        rootPath,
      });
    }
  }

  emitError(error: AppError): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }
}
