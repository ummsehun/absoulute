import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type {
  AggDelta,
  AppError,
  ScanPauseResponse,
  ScanProgress,
  ScanProgressBatch,
  ScanResumeResponse,
  ScanStartRequest,
  ScanStartResponse,
} from "../../types/contracts";
import {
  createPathPolicyClassifier,
  evaluateRootPath,
  type PathPolicyClassifier,
} from "../core/securityPolicy";
import { makeAppError } from "../utils/appError";
import { ScanAggregator } from "./scanAggregator";

const EMIT_INTERVAL_MS = 250;
const DELTA_BATCH_LIMIT = 1024;
const STAT_CONCURRENCY = 64;
const TOP_LIMIT_PER_DIRECTORY = 200;
const MAX_RECOVERABLE_ERRORS = 100;
const ENTRY_YIELD_INTERVAL = 1024;
const DEEP_PRIORITY_SAMPLE_SIZE = 64;
const QUICK_PASS_DEPTH = 2;
const QUICK_PASS_TIME_BUDGET_MS = 5000;
const ROOT_QUICK_PASS_DEPTH = 1;
const ROOT_QUICK_PASS_TIME_BUDGET_MS = 3000;

type ScanStage = Exclude<ScanProgress["scanStage"], undefined>;

interface QuickPassConfig {
  depthLimit: number;
  timeBudgetMs: number;
}

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
  paused: boolean;
  completed: boolean;
  scannedCount: number;
  totalBytes: number;
  currentPath: string;
  lastEmitAt: number;
  pendingDeltaMap: Map<string, AggDelta>;
  pendingDeltaEventCount: number;
  emittedErrorCount: number;
  aggregator: ScanAggregator;
  pathClassifier: PathPolicyClassifier;
  scanStage: ScanStage;
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
      paused: false,
      completed: false,
      scannedCount: 0,
      totalBytes: 0,
      currentPath: rootDecision.normalizedPath,
      lastEmitAt: Date.now(),
      pendingDeltaMap: new Map<string, AggDelta>(),
      pendingDeltaEventCount: 0,
      emittedErrorCount: 0,
      aggregator: new ScanAggregator(
        rootDecision.normalizedPath,
        TOP_LIMIT_PER_DIRECTORY,
        os.platform(),
      ),
      pathClassifier: createPathPolicyClassifier(),
      scanStage: "quick",
    };

    this.jobs.set(scanId, job);

    void this.runScan(job).finally(() => {
      this.jobs.delete(scanId);
    });

    return { scanId, startedAt };
  }

  pauseScan(scanId: string): ScanPauseResponse {
    const job = this.jobs.get(scanId);
    if (!job || job.completed || job.cancelled) {
      return { ok: false };
    }

    job.paused = true;
    this.emitProgressBatch(job, "paused", true);
    return { ok: true };
  }

  resumeScan(scanId: string): ScanResumeResponse {
    const job = this.jobs.get(scanId);
    if (!job || job.completed || job.cancelled) {
      return { ok: false };
    }

    job.paused = false;
    this.emitProgressBatch(job, "walking", true);
    return { ok: true };
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
    const quickConfig = resolveQuickPassConfig(job.rootPath, os.platform());
    const quickQueue: QueueItem[] = [{ dirPath: job.rootPath, depth: 0 }];
    const deepQueue: string[] = [];
    const deepQueued = new Set<string>();
    const quickProcessed = new Set<string>();
    const quickStartedAt = Date.now();

    const enqueueDeep = (dirPath: string): void => {
      enqueueUniquePath(deepQueue, deepQueued, dirPath);
    };

    job.scanStage = "quick";

    while (quickQueue.length > 0 && !job.cancelled) {
      await this.waitWhilePaused(job);
      if (job.cancelled) {
        break;
      }

      const budgetElapsed = Date.now() - quickStartedAt >= quickConfig.timeBudgetMs;
      if (budgetElapsed && quickProcessed.size > 0) {
        break;
      }

      const current = quickQueue.shift();
      if (!current) {
        break;
      }

      job.currentPath = current.dirPath;
      if (!this.classifyPathOrEmit(job, current.dirPath)) {
        continue;
      }

      try {
        quickProcessed.add(current.dirPath);
        await this.processDirectory(
          job,
          current,
          quickQueue,
          enqueueDeep,
          quickConfig.depthLimit,
        );
      } catch (error) {
        this.emitRecoverableError(
          job,
          toFilesystemError(error, current.dirPath, "Failed to process directory"),
        );
      }

      this.emitProgressBatch(job, "walking", false);
    }

    for (const queued of quickQueue) {
      enqueueDeep(queued.dirPath);
    }

    job.scanStage = "deep";
    this.emitProgressBatch(job, "walking", true);

    while (deepQueue.length > 0 && !job.cancelled) {
      await this.waitWhilePaused(job);
      if (job.cancelled) {
        break;
      }

      const nextDir = popPriorityDirectory(
        deepQueue,
        DEEP_PRIORITY_SAMPLE_SIZE,
        (candidate) => job.aggregator.getDirectorySize(candidate),
      );
      if (!nextDir) {
        break;
      }

      deepQueued.delete(nextDir);

      if (quickProcessed.has(nextDir)) {
        continue;
      }

      job.currentPath = nextDir;
      if (!this.classifyPathOrEmit(job, nextDir)) {
        continue;
      }

      try {
        await this.processDirectory(job, { dirPath: nextDir, depth: 0 }, null, enqueueDeep, 0);
      } catch (error) {
        this.emitRecoverableError(
          job,
          toFilesystemError(error, nextDir, "Failed to process directory"),
        );
      }

      this.emitProgressBatch(job, "walking", false);
    }

    await this.flushStatTasks(job);

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
    quickQueue: QueueItem[] | null,
    enqueueDeep: (dirPath: string) => void,
    quickDepthLimit: number,
  ): Promise<void> {
    const dir = await fs.opendir(current.dirPath, { bufferSize: 256 });
    let entryCounter = 0;

    for await (const entry of dir) {
      if (job.cancelled) {
        break;
      }

      await this.waitWhilePaused(job);
      if (job.cancelled) {
        break;
      }

      const fullPath = path.join(current.dirPath, entry.name);
      job.currentPath = fullPath;
      job.scannedCount += 1;
      entryCounter += 1;
      if (entryCounter % ENTRY_YIELD_INTERVAL === 0) {
        await sleep(0);
      }

      if (!this.classifyPathOrEmit(job, fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        this.ensureDirectoryInAggregation(job, fullPath, current.dirPath);
        enqueueDeep(fullPath);
        if (quickQueue && current.depth < quickDepthLimit) {
          quickQueue.push({ dirPath: fullPath, depth: current.depth + 1 });
        }
        continue;
      }

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      await this.scheduleStatTask(job, async () => {
        if (job.cancelled) {
          return;
        }

        try {
          const stat = await fs.stat(fullPath);
          if (job.cancelled) {
            return;
          }

          job.totalBytes += stat.size;

          const deltas = job.aggregator.addFile(fullPath, stat.size);
          this.appendDeltas(job, deltas);
        } catch (error) {
          this.emitRecoverableError(
            job,
            toFilesystemError(error, fullPath, "Failed to stat file"),
          );
        }

        this.emitProgressBatch(job, "walking", false);
      });
    }
  }

  private ensureDirectoryInAggregation(
    job: ScanJob,
    dirPath: string,
    parentPath: string,
  ): void {
    job.aggregator.ensureDirectory(dirPath, parentPath);
  }

  private classifyPathOrEmit(job: ScanJob, targetPath: string): boolean {
    const decision = job.pathClassifier(targetPath, job.optInProtected, {
      isResolved: true,
    });

    if (decision.allowed) {
      return true;
    }

    if (decision.error) {
      this.emitRecoverableError(job, decision.error);
    }

    return false;
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
    const hasEnoughDeltas = job.pendingDeltaEventCount >= DELTA_BATCH_LIMIT;
    const timeElapsed = now - job.lastEmitAt >= EMIT_INTERVAL_MS;

    if (!force && !hasEnoughDeltas && !timeElapsed) {
      return;
    }

    const patch = job.aggregator.consumePatch();

    if (!force && job.pendingDeltaMap.size === 0 && !patch) {
      return;
    }

    const deltas = [...job.pendingDeltaMap.values()];

    const batch: ScanProgressBatch = {
      progress: {
        scanId: job.scanId,
        phase,
        scanStage:
          phase === "walking" || phase === "paused" ? job.scanStage : undefined,
        scannedCount: job.scannedCount,
        totalBytes: job.totalBytes,
        currentPath: job.currentPath,
      },
      deltas,
      patches: patch ? [patch] : [],
    };

    job.pendingDeltaMap.clear();
    job.pendingDeltaEventCount = 0;
    job.lastEmitAt = now;

    for (const listener of this.progressListeners) {
      listener(batch);
    }
  }

  private appendDeltas(job: ScanJob, deltas: AggDelta[]): void {
    for (const delta of deltas) {
      job.pendingDeltaEventCount += 1;
      const previous = job.pendingDeltaMap.get(delta.nodePath);
      if (previous) {
        previous.sizeDelta += delta.sizeDelta;
        previous.countDelta += delta.countDelta;
        continue;
      }

      job.pendingDeltaMap.set(delta.nodePath, {
        nodePath: delta.nodePath,
        sizeDelta: delta.sizeDelta,
        countDelta: delta.countDelta,
      });
    }
  }

  private readonly activeStatTasks = new WeakMap<ScanJob, Set<Promise<void>>>();

  private async scheduleStatTask(
    job: ScanJob,
    task: () => Promise<void>,
  ): Promise<void> {
    const tasks = this.activeStatTasks.get(job) ?? new Set<Promise<void>>();
    this.activeStatTasks.set(job, tasks);

    while (tasks.size >= STAT_CONCURRENCY && !job.cancelled) {
      await Promise.race(tasks);
      await this.waitWhilePaused(job);
    }

    const running = task()
      .catch(() => undefined)
      .finally(() => {
        tasks.delete(running);
      });

    tasks.add(running);
  }

  private async flushStatTasks(job: ScanJob): Promise<void> {
    const tasks = this.activeStatTasks.get(job);
    if (!tasks || tasks.size === 0) {
      return;
    }

    await Promise.allSettled(tasks);
    tasks.clear();
  }

  private async waitWhilePaused(job: ScanJob): Promise<void> {
    while (job.paused && !job.cancelled) {
      this.emitProgressBatch(job, "paused", false);
      await sleep(80);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveQuickPassConfig(
  rootPath: string,
  platform: NodeJS.Platform,
): QuickPassConfig {
  if (isFilesystemRoot(rootPath, platform)) {
    return {
      depthLimit: ROOT_QUICK_PASS_DEPTH,
      timeBudgetMs: ROOT_QUICK_PASS_TIME_BUDGET_MS,
    };
  }

  return {
    depthLimit: QUICK_PASS_DEPTH,
    timeBudgetMs: QUICK_PASS_TIME_BUDGET_MS,
  };
}

function isFilesystemRoot(inputPath: string, platform: NodeJS.Platform): boolean {
  const resolved = path.resolve(inputPath);
  const normalized = normalizeForCompare(resolved, platform);
  const root = normalizeForCompare(path.parse(resolved).root, platform);
  return normalized === root;
}

function normalizeForCompare(rawPath: string, platform: NodeJS.Platform): string {
  const normalized = rawPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const rootSafe = normalized === "" ? "/" : normalized;
  if (platform === "win32") {
    return rootSafe.toLowerCase();
  }

  return rootSafe;
}

function enqueueUniquePath(queue: string[], queued: Set<string>, target: string): void {
  if (queued.has(target)) {
    return;
  }

  queued.add(target);
  queue.push(target);
}

function popPriorityDirectory(
  queue: string[],
  sampleSize: number,
  score: (candidate: string) => number,
): string | undefined {
  if (queue.length === 0) {
    return undefined;
  }

  const maxInspect = Math.min(sampleSize, queue.length);
  let bestIndex = 0;
  let bestScore = score(queue[0]);

  for (let index = 1; index < maxInspect; index += 1) {
    const currentScore = score(queue[index]);
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestIndex = index;
    }
  }

  const [selected] = queue.splice(bestIndex, 1);
  return selected;
}
