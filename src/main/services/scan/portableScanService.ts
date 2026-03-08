import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppError, ScanTerminalStatus } from "../../../types/contracts";
import {
  createMacOSIncrementalWatcher,
  type IncrementalWatcherHandle,
} from "../accelerators/macosIncrementalWatcher";
import { buildMacOSQuickQueue } from "../accelerators/macosQuickScanner";
import { ScanEventBus } from "./scanEventBus";
import {
  enqueueUniquePath,
  normalizeIncrementalTarget,
  popPriorityDirectory,
} from "./scanQueueUtils";
import { resolveQuickPassConfig } from "./scanRuntimeOptions";
import { type QueueItem, type ScanJob } from "./scanSessionTypes";
import {
  estimateDirectorySizeFast,
  isHeavyTraversalDirectory,
  shouldEstimateDirectory,
  shouldSkipDeepPackageTraversal,
  shouldSkipHeavyTraversal,
} from "./scanTraversalPolicy";

const DEEP_PRIORITY_SAMPLE_SIZE = 64;
const DEEP_START_GRACE_MS = 500;
const ENTRY_YIELD_INTERVAL = 1024;
const INCREMENTAL_IDLE_GRACE_MS = 1000;
const HEAVY_BACKGROUND_ESTIMATE_TIMEOUT_MS = 4_000;
const HEAVY_FALLBACK_ESTIMATE_BYTES = 32 * 1024 * 1024;
const HEAVY_DIRECTORY_SCORE_PENALTY = 10_000_000_000_000;

interface PortableScanDependencies {
  classifyPathOrEmit: (job: ScanJob, targetPath: string) => boolean;
  createCanceledError: (scanId: string) => AppError;
  emitRecoverableError: (job: ScanJob, error: AppError) => void;
  eventBus: ScanEventBus;
  flushStatTasks: (job: ScanJob) => Promise<void>;
  hasPendingStatTasks: (job: ScanJob) => boolean;
  persistScanCache: (job: ScanJob) => void;
  recordEstimatedDirectory: (
    job: ScanJob,
    dirPath: string,
    estimatedSize: number,
  ) => void;
  recordFileObservation: (job: ScanJob, filePath: string, fileSize: number) => void;
  recordPolicySoftSkip: (
    job: ScanJob,
    input?: { deferredByBudget?: boolean },
  ) => void;
  recordScopeSkip: (job: ScanJob) => void;
  scheduleStatTask: (job: ScanJob, task: () => Promise<void>) => Promise<void>;
  syncExactTraversal: (job: ScanJob, targetPath: string) => void;
  toFilesystemError: (
    error: unknown,
    targetPath: string,
    defaultMessage: string,
  ) => AppError;
  waitForNextStatTask: (job: ScanJob) => Promise<void>;
  waitWhilePaused: (job: ScanJob) => Promise<void>;
}

export class PortableScanService {
  constructor(private readonly deps: PortableScanDependencies) {}

  async run(job: ScanJob): Promise<ScanTerminalStatus> {
    const quickConfig = resolveQuickPassConfig(job.rootPath, os.platform(), job.options);
    const quickQueue = await this.createInitialQuickQueue(job, quickConfig.depthLimit);
    const deepQueue: string[] = [];
    const deepQueued = new Set<string>();
    const quickProcessed = new Set<string>();
    const quickStartedAt = Date.now();

    const enqueueDeep = (dirPath: string): void => {
      enqueueUniquePath(deepQueue, deepQueued, dirPath);
    };

    job.scanStage = "quick";
    job.stageStartedAt = quickStartedAt;

    while (quickQueue.length > 0 && !job.cancelled) {
      await this.deps.waitWhilePaused(job);
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
      if (!this.deps.classifyPathOrEmit(job, current.dirPath)) {
        continue;
      }

      try {
        quickProcessed.add(current.dirPath);
        const result = await this.processDirectory(
          job,
          current,
          quickQueue,
          enqueueDeep,
          quickConfig.depthLimit,
          quickStartedAt + quickConfig.timeBudgetMs,
        );
        if (result.timedOut) {
          break;
        }
      } catch (error) {
        this.deps.emitRecoverableError(
          job,
          this.deps.toFilesystemError(error, current.dirPath, "Failed to process directory"),
        );
      }

      this.deps.eventBus.emitProgressBatch(job, "walking", false);
      this.deps.eventBus.emitDiagnostics(
        job,
        "walking",
        quickQueue.length + deepQueue.length,
        false,
      );
    }

    for (const queued of quickQueue) {
      enqueueDeep(queued.dirPath);
    }

    this.deps.eventBus.emitQuickReady(job, quickStartedAt);
    await sleep(DEEP_START_GRACE_MS);

    job.scanStage = "deep";
    job.stageStartedAt = Date.now();
    this.deps.eventBus.emitProgressBatch(job, "walking", true);
    this.deps.eventBus.emitDiagnostics(job, "walking", deepQueue.length, true);

    let lastIncrementalChangeAt = 0;
    const deepDeadlineAt =
      job.options.deepBudgetMs > 0 ? Date.now() + job.options.deepBudgetMs : null;
    let deepBudgetExceeded = false;
    const watcher: IncrementalWatcherHandle | null = createMacOSIncrementalWatcher(
      job.rootPath,
      job.options.scanMode,
      (change) => {
        const targetDir = normalizeIncrementalTarget(change.changedPath);
        if (!targetDir) {
          return;
        }
        enqueueDeep(targetDir);
        lastIncrementalChangeAt = change.at;
      },
    );

    while (!job.cancelled) {
      await this.deps.waitWhilePaused(job);
      if (job.cancelled) {
        break;
      }

      if (deepQueue.length === 0) {
        const incrementalActive =
          watcher !== null &&
          Date.now() - lastIncrementalChangeAt <= INCREMENTAL_IDLE_GRACE_MS;

        if (!this.deps.hasPendingStatTasks(job) && !incrementalActive) {
          break;
        }

        if (this.deps.hasPendingStatTasks(job)) {
          await this.deps.waitForNextStatTask(job);
          continue;
        }

        await sleep(60);
        continue;
      }

      const nextDir = popPriorityDirectory(
        deepQueue,
        DEEP_PRIORITY_SAMPLE_SIZE,
        (candidate) => this.scoreDeepCandidate(job, candidate),
      );
      if (!nextDir) {
        break;
      }

      deepQueued.delete(nextDir);

      if (quickProcessed.has(nextDir)) {
        continue;
      }

      job.currentPath = nextDir;
      if (!this.deps.classifyPathOrEmit(job, nextDir)) {
        continue;
      }

      try {
        const result = await this.processDirectory(
          job,
          { dirPath: nextDir, depth: 0 },
          null,
          enqueueDeep,
          0,
          deepDeadlineAt ?? undefined,
        );
        if (result.timedOut) {
          deepBudgetExceeded = true;
          break;
        }
      } catch (error) {
        this.deps.emitRecoverableError(
          job,
          this.deps.toFilesystemError(error, nextDir, "Failed to process directory"),
        );
      }

      this.deps.eventBus.emitProgressBatch(job, "walking", false);
      this.deps.eventBus.emitDiagnostics(job, "walking", deepQueue.length, false);
    }

    watcher?.close();

    if (!job.cancelled && !deepBudgetExceeded && !job.deepSkippedByPolicy) {
      job.estimatedResult = false;
    }

    await this.deps.flushStatTasks(job);

    if (job.cancelled) {
      this.deps.emitRecoverableError(job, this.deps.createCanceledError(job.scanId));
    }

    this.deps.eventBus.emitProgressBatch(job, "aggregating", true);
    this.deps.eventBus.emitDiagnostics(job, "aggregating", deepQueue.length, true);
    this.deps.eventBus.emitProgressBatch(job, "compressing", true);
    this.deps.eventBus.emitDiagnostics(job, "compressing", deepQueue.length, true);
    this.deps.eventBus.emitProgressBatch(job, "finalizing", true);
    this.deps.eventBus.emitDiagnostics(job, "finalizing", 0, true);
    this.deps.persistScanCache(job);

    job.completed = true;
    return job.cancelled ? "canceled" : "done";
  }

  private async createInitialQuickQueue(
    job: ScanJob,
    depthLimit: number,
  ): Promise<QueueItem[]> {
    if (depthLimit <= 0) {
      return [{ dirPath: job.rootPath, depth: 0 }];
    }

    const macQueue = await buildMacOSQuickQueue(job.rootPath, job.options.scanMode).catch(
      () => null,
    );
    if (!macQueue || macQueue.length === 0) {
      return [{ dirPath: job.rootPath, depth: 0 }];
    }

    return macQueue.map((dirPath) => ({ dirPath, depth: 0 }));
  }

  private async processDirectory(
    job: ScanJob,
    current: QueueItem,
    quickQueue: QueueItem[] | null,
    enqueueDeep: (dirPath: string) => void,
    quickDepthLimit: number,
    deadlineAtMs?: number,
  ): Promise<{ timedOut: boolean }> {
    this.deps.syncExactTraversal(job, current.dirPath);
    const dir = await fs.opendir(current.dirPath, { bufferSize: 256 });
    let entryCounter = 0;

    for await (const entry of dir) {
      if (deadlineAtMs !== undefined && Date.now() >= deadlineAtMs) {
        return { timedOut: true };
      }

      if (job.cancelled) {
        break;
      }

      await this.deps.waitWhilePaused(job);
      if (job.cancelled) {
        break;
      }

      const fullPath = path.join(current.dirPath, entry.name);
      job.currentPath = fullPath;
      job.scannedCount += 1;
      entryCounter += 1;
      if (entryCounter % ENTRY_YIELD_INTERVAL === 0) {
        await sleep(0);
        if (deadlineAtMs !== undefined && Date.now() >= deadlineAtMs) {
          return { timedOut: true };
        }
      }

      if (!this.deps.classifyPathOrEmit(job, fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        if (
          job.rootDeviceId !== null &&
          !(await this.isSameDeviceDirectory(job, fullPath, job.rootDeviceId))
        ) {
          this.deps.recordScopeSkip(job);
          continue;
        }

        job.aggregator.ensureDirectory(fullPath, current.dirPath);

        if (
          quickQueue === null &&
          shouldSkipDeepPackageTraversal({
            options: job.options,
            rootPath: job.rootPath,
            dirPath: fullPath,
            platform: os.platform(),
            skippedDirectories: job.skippedHeavyDirectories,
          })
        ) {
          this.scheduleDeepPackageDirectoryEstimate(job, fullPath);
          continue;
        }

        if (
          quickQueue !== null &&
          shouldSkipHeavyTraversal(
            job.options,
            fullPath,
            job.skippedHeavyDirectories,
          )
        ) {
          this.scheduleHeavyDirectoryEstimate(job, fullPath);
          continue;
        }

        if (
          quickQueue !== null &&
          shouldEstimateDirectory(job.options, fullPath, job.estimatedDirectories) &&
          !job.cancelled
        ) {
          const estimatedSize = await estimateDirectorySizeFast(
            fullPath,
            job.options.scanMode,
          );
          if (estimatedSize !== null && estimatedSize > 0) {
            this.deps.recordEstimatedDirectory(job, fullPath, estimatedSize);
            continue;
          }
        }

        enqueueDeep(fullPath);
        if (quickQueue && current.depth < quickDepthLimit) {
          quickQueue.push({ dirPath: fullPath, depth: current.depth + 1 });
        }
        continue;
      }

      if (entry.isSymbolicLink() || !entry.isFile()) {
        continue;
      }

      await this.deps.scheduleStatTask(job, async () => {
        if (job.cancelled) {
          return;
        }

        try {
          const stat = await fs.stat(fullPath);
          if (job.cancelled) {
            return;
          }

          this.deps.recordFileObservation(job, fullPath, stat.size);
        } catch (error) {
          this.deps.emitRecoverableError(
            job,
            this.deps.toFilesystemError(error, fullPath, "Failed to stat file"),
          );
        }

        this.deps.eventBus.emitProgressBatch(job, "walking", false);
      });
    }

    if (deadlineAtMs !== undefined && Date.now() >= deadlineAtMs) {
      return { timedOut: true };
    }

    return { timedOut: false };
  }

  private scheduleDeepPackageDirectoryEstimate(job: ScanJob, dirPath: string): void {
    if (job.skippedHeavyDirectories.has(dirPath)) {
      return;
    }

    job.skippedHeavyDirectories.add(dirPath);
    this.deps.recordPolicySoftSkip(job);
    job.deepSkippedByPolicy = true;
    job.estimatedResult = true;

    void this.deps.scheduleStatTask(job, async () => {
      if (job.cancelled) {
        return;
      }

      const estimatedSize =
        (await estimateDirectorySizeFast(
          dirPath,
          job.options.scanMode,
          HEAVY_BACKGROUND_ESTIMATE_TIMEOUT_MS,
        )) ?? HEAVY_FALLBACK_ESTIMATE_BYTES;

      this.deps.recordEstimatedDirectory(job, dirPath, estimatedSize);
      this.deps.eventBus.emitProgressBatch(job, "walking", false);
    });
  }

  private scheduleHeavyDirectoryEstimate(job: ScanJob, dirPath: string): void {
    if (job.skippedHeavyDirectories.has(dirPath)) {
      return;
    }

    job.skippedHeavyDirectories.add(dirPath);
    this.deps.recordPolicySoftSkip(job);

    void this.deps.scheduleStatTask(job, async () => {
      if (job.cancelled) {
        return;
      }

      const estimatedSize =
        (await estimateDirectorySizeFast(
          dirPath,
          job.options.scanMode,
          HEAVY_BACKGROUND_ESTIMATE_TIMEOUT_MS,
        )) ?? HEAVY_FALLBACK_ESTIMATE_BYTES;

      this.deps.recordEstimatedDirectory(job, dirPath, estimatedSize);
      this.deps.eventBus.emitProgressBatch(job, "walking", false);
    });
  }

  private scoreDeepCandidate(job: ScanJob, candidate: string): number {
    let score = job.aggregator.getDirectorySize(candidate);
    if (
      job.options.performanceProfile !== "accuracy-first" &&
      isHeavyTraversalDirectory(candidate)
    ) {
      score -= HEAVY_DIRECTORY_SCORE_PENALTY;
    }

    return score;
  }

  private async isSameDeviceDirectory(
    job: ScanJob,
    dirPath: string,
    rootDeviceId: number,
  ): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.dev === rootDeviceId;
    } catch (error) {
      this.deps.emitRecoverableError(
        job,
        this.deps.toFilesystemError(error, dirPath, "Failed to stat directory"),
      );
      return true;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
