import fs from "node:fs/promises";
import type { AppError } from "../../../types/contracts";
import { makeAppError } from "../../utils/appError";
import { ScanHistoryStore } from "../cache/scanHistoryStore";
import { requestElevation as requestElevationByHelper } from "../security/macosPrivilegeHelper";
import type { ScanEventBus } from "./scanEventBus";
import type { ScanJob } from "./scanSessionTypes";

interface ScanPolicyServiceDependencies {
  eventBus: ScanEventBus;
  maxRecoverableErrors: number;
  emitError: (error: AppError) => void;
  scanHistoryStore: ScanHistoryStore;
}

export class ScanPolicyService {
  constructor(private readonly deps: ScanPolicyServiceDependencies) {}

  async assertPathReadable(rootPath: string): Promise<void> {
    try {
      await fs.access(rootPath);
    } catch {
      throw makeAppError("E_IO", "Root path is not readable", true, {
        rootPath,
      });
    }
  }

  classifyPathOrEmit(job: ScanJob, targetPath: string): boolean {
    const decision = job.pathClassifier(targetPath, job.optInProtected, {
      isResolved: true,
    });

    if (decision.allowed) {
      return true;
    }

    if (decision.error) {
      job.blockedByPolicyCount += 1;
      if (decision.requiresOptIn) {
        job.elevationRequired = true;
        this.emitElevationRequired(
          job,
          decision.normalizedPath,
          "Protected path requires explicit elevation/opt-in",
        );
      }
      this.deps.eventBus.emitCoverageUpdate(job, false);
      this.emitRecoverableError(job, decision.error);
    }

    return false;
  }

  emitRecoverableError(job: ScanJob, error: AppError): void {
    if (job.emittedErrorCount >= this.deps.maxRecoverableErrors) {
      return;
    }

    job.emittedErrorCount += 1;
    if (error.code === "E_PERMISSION") {
      job.permissionErrorCount += 1;
      job.blockedByPermissionCount += 1;
      this.deps.eventBus.emitCoverageUpdate(job, false);
    } else if (error.code === "E_IO") {
      job.ioErrorCount += 1;
    }
    this.deps.emitError(error);
  }

  emitElevationRequired(job: ScanJob, targetPath: string, reason: string): void {
    this.deps.eventBus.emitElevationRequired(job, targetPath, reason);

    if (
      process.platform === "darwin" &&
      job.options.elevationPolicy === "auto" &&
      !job.elevationAttempted
    ) {
      job.elevationAttempted = true;
      void requestElevationByHelper(targetPath)
        .then((result) => {
          if (!result.granted || job.cancelled) {
            return;
          }

          job.optInProtected = true;
          job.elevationRequired = false;
          this.deps.eventBus.emitCoverageUpdate(job, true);
        })
        .catch(() => undefined);
    }
  }

  applyCachedPreview(job: ScanJob): void {
    if (job.options.accuracyMode !== "preview") {
      return;
    }

    const cacheEntry = this.deps.scanHistoryStore.get(job.rootPath);
    if (!cacheEntry || cacheEntry.nodes.length === 0) {
      return;
    }

    for (const node of cacheEntry.nodes) {
      if (!this.classifyPathOrEmit(job, node.path)) {
        continue;
      }
      this.recordEstimatedDirectory(job, node.path, node.size);
    }

    this.deps.eventBus.emitProgressBatch(job, "walking", true);
    this.deps.eventBus.emitDiagnostics(job, "walking", 0, true);
  }

  persistScanCache(job: ScanJob): void {
    const nodes = job.aggregator.getLargestDirectories(300).map((item) => ({
      path: item.path,
      size: item.size,
    }));
    if (nodes.length === 0) {
      return;
    }

    this.deps.scanHistoryStore.set(job.rootPath, nodes);
  }

  recordPolicySoftSkip(
    job: ScanJob,
    input?: { deferredByBudget?: boolean },
  ): void {
    job.blockedByPolicyCount += 1;
    job.softSkippedByPolicyCount += 1;
    if (input?.deferredByBudget) {
      job.deferredByBudgetCount += 1;
    }
    this.deps.eventBus.emitCoverageUpdate(job, false);
  }

  recordFileObservation(job: ScanJob, filePath: string, fileSize: number): void {
    this.syncExactTraversal(job, filePath);
    job.totalBytes += fileSize;
    const deltas = job.aggregator.addFile(filePath, fileSize);
    this.deps.eventBus.appendDeltas(job, deltas);
  }

  recordEstimatedDirectory(job: ScanJob, dirPath: string, estimatedSize: number): void {
    if (estimatedSize <= 0) {
      return;
    }

    const deltas = job.aggregator.addDirectoryEstimate(dirPath, estimatedSize);
    if (deltas.length === 0) {
      return;
    }

    this.deps.eventBus.appendDeltas(job, deltas);
    job.estimatedDirectories.add(dirPath);
  }

  syncExactTraversal(job: ScanJob, targetPath: string): void {
    const { deltas, cleared } = job.aggregator.clearEstimatedAncestors(targetPath);
    if (deltas.length > 0) {
      this.deps.eventBus.appendDeltas(job, deltas);
    }
    for (const dirPath of cleared) {
      job.estimatedDirectories.delete(dirPath);
    }
  }
}
