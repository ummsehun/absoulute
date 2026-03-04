import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type {
  AggDelta,
  AppError,
  ScanProgress,
  ScanProgressBatch,
  ScanStartRequest,
  ScanStartResponse,
} from "../../types/contracts";
import { classifyPathByPolicy, evaluateRootPath } from "../core/securityPolicy";
import { makeAppError } from "../utils/appError";
import { ScanAggregator } from "./scanAggregator";

const EMIT_INTERVAL_MS = 120;
const DELTA_BATCH_LIMIT = 256;
const TOP_LIMIT_PER_DIRECTORY = 200;
const MAX_RECOVERABLE_ERRORS = 100;

interface QueueItem {
  dirPath: string;
  depth: number;
}

interface ScanJob {
  scanId: string;
  rootPath: string;
  startedAt: number;
  optInProtected: boolean;
  cancelled: boolean;
  completed: boolean;
  scannedCount: number;
  totalBytes: number;
  currentPath: string;
  lastEmitAt: number;
  pendingDeltas: AggDelta[];
  emittedErrorCount: number;
  aggregator: ScanAggregator;
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
    const rootDecision = await evaluateRootPath(input.rootPath, input.optInProtected);
    if (!rootDecision.allowed && rootDecision.error) {
      throw rootDecision.error;
    }

    await this.assertPathReadable(rootDecision.normalizedPath);

    const scanId = crypto.randomUUID();
    const startedAt = Date.now();

    const job: ScanJob = {
      scanId,
      rootPath: rootDecision.normalizedPath,
      startedAt,
      optInProtected: input.optInProtected,
      cancelled: false,
      completed: false,
      scannedCount: 0,
      totalBytes: 0,
      currentPath: rootDecision.normalizedPath,
      lastEmitAt: Date.now(),
      pendingDeltas: [],
      emittedErrorCount: 0,
      aggregator: new ScanAggregator(
        rootDecision.normalizedPath,
        TOP_LIMIT_PER_DIRECTORY,
        os.platform(),
      ),
    };

    this.jobs.set(scanId, job);

    void this.runScan(job).finally(() => {
      this.jobs.delete(scanId);
    });

    return { scanId, startedAt };
  }

  cancelScan(scanId: string): boolean {
    const job = this.jobs.get(scanId);
    if (!job || job.completed) {
      return false;
    }

    job.cancelled = true;
    return true;
  }

  emitError(error: AppError): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  private async runScan(job: ScanJob): Promise<void> {
    const queue: QueueItem[] = [{ dirPath: job.rootPath, depth: 0 }];

    while (queue.length > 0 && !job.cancelled) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      job.currentPath = current.dirPath;

      const dirDecision = classifyPathByPolicy(current.dirPath, job.optInProtected);
      if (!dirDecision.allowed) {
        if (dirDecision.error) {
          this.emitRecoverableError(job, dirDecision.error);
        }
        continue;
      }

      try {
        await this.processDirectory(job, current, queue);
      } catch (error) {
        this.emitRecoverableError(
          job,
          toFilesystemError(error, current.dirPath, "Failed to process directory"),
        );
      }

      this.emitProgressBatch(job, "walking", false);
    }

    if (job.cancelled) {
      this.emitRecoverableError(
        job,
        makeAppError("E_CANCELLED", "Scan was cancelled by user", true, {
          scanId: job.scanId,
        }),
      );
    }

    this.emitProgressBatch(job, "aggregating", true);
    this.emitProgressBatch(job, "compressing", true);
    this.emitProgressBatch(job, "finalizing", true);

    job.completed = true;
  }

  private async processDirectory(
    job: ScanJob,
    current: QueueItem,
    queue: QueueItem[],
  ): Promise<void> {
    const dir = await fs.opendir(current.dirPath);

    for await (const entry of dir) {
      if (job.cancelled) {
        break;
      }

      const fullPath = path.join(current.dirPath, entry.name);
      job.currentPath = fullPath;
      job.scannedCount += 1;

      const entryDecision = classifyPathByPolicy(fullPath, job.optInProtected);
      if (!entryDecision.allowed) {
        if (entryDecision.error) {
          this.emitRecoverableError(job, entryDecision.error);
        }
        continue;
      }

      if (entry.isDirectory()) {
        this.ensureDirectoryInAggregation(job, fullPath, current.dirPath);
        queue.push({ dirPath: fullPath, depth: current.depth + 1 });
        continue;
      }

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const stat = await fs.stat(fullPath);
        job.totalBytes += stat.size;

        const deltas = job.aggregator.addFile(fullPath, stat.size);
        job.pendingDeltas.push(...deltas);
      } catch (error) {
        this.emitRecoverableError(
          job,
          toFilesystemError(error, fullPath, "Failed to stat file"),
        );
      }

      this.emitProgressBatch(job, "walking", false);
    }
  }

  private ensureDirectoryInAggregation(
    job: ScanJob,
    dirPath: string,
    parentPath: string,
  ): void {
    job.aggregator.ensureDirectory(dirPath, parentPath);
  }

  private emitRecoverableError(job: ScanJob, error: AppError): void {
    if (job.emittedErrorCount >= MAX_RECOVERABLE_ERRORS) {
      return;
    }

    job.emittedErrorCount += 1;
    this.emitError(error);
  }

  private emitProgressBatch(
    job: ScanJob,
    phase: ScanProgress["phase"],
    force: boolean,
  ): void {
    const now = Date.now();
    const hasEnoughDeltas = job.pendingDeltas.length >= DELTA_BATCH_LIMIT;
    const hasPatch = job.aggregator.hasPendingPatch();
    const timeElapsed = now - job.lastEmitAt >= EMIT_INTERVAL_MS;

    if (!force && !hasEnoughDeltas && !timeElapsed && !hasPatch) {
      return;
    }

    const patch = job.aggregator.consumePatch();

    if (!force && job.pendingDeltas.length === 0 && !patch) {
      return;
    }

    const batch: ScanProgressBatch = {
      progress: {
        scanId: job.scanId,
        phase,
        scannedCount: job.scannedCount,
        totalBytes: job.totalBytes,
        currentPath: job.currentPath,
      },
      deltas: [...job.pendingDeltas],
      patches: patch ? [patch] : [],
    };

    job.pendingDeltas.length = 0;
    job.lastEmitAt = now;

    for (const listener of this.progressListeners) {
      listener(batch);
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
}

function toFilesystemError(
  error: unknown,
  targetPath: string,
  defaultMessage: string,
): AppError {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as NodeJS.ErrnoException).code)
      : "UNKNOWN";

  if (code === "EACCES" || code === "EPERM") {
    return makeAppError("E_PERMISSION", defaultMessage, true, {
      targetPath,
      code,
    });
  }

  if (code === "ENOENT" || code === "ENOTDIR") {
    return makeAppError("E_IO", "Path disappeared during scan", true, {
      targetPath,
      code,
    });
  }

  return makeAppError("E_IO", defaultMessage, true, {
    targetPath,
    code,
    raw: String(error),
  });
}
