import type {
  AppError,
  ScanConfidence,
  ScanSkipSamples,
} from "../../../types/contracts";
import type {
  NativeStageHandlers,
} from "./nativeScanOrchestrator";
import type { NativeWarnMessage } from "../native/nativeRustScannerClient";
import type { ScanEventBus } from "./scanEventBus";
import type { ScanPolicyService } from "./scanPolicyService";
import type { ScanJob } from "./scanSessionTypes";

const MAX_SKIP_SAMPLE_PATHS = 25;

export interface CreateNativeStageHandlersInput {
  job: ScanJob;
  stageStartedAt: number;
  eventBus: Pick<
    ScanEventBus,
    | "emitCoverageUpdate"
    | "emitDiagnostics"
    | "emitPerfSample"
    | "emitProgressBatch"
    | "emitQuickReadyEvent"
  >;
  scanPolicyService: Pick<
    ScanPolicyService,
    | "emitElevationRequired"
    | "emitRecoverableError"
    | "recordEstimatedDirectory"
    | "recordFileObservation"
    | "syncExactTraversal"
  >;
  emitQuickReadyFromNative: (
    job: ScanJob,
    event: { elapsedMs: number; confidence: ScanConfidence; estimated: boolean },
    stageStartedAt: number,
  ) => void;
  markVisibleNonRemovableRoot: (job: ScanJob, targetPath: string) => void;
  toNativeScannerError: (scanId: string, message: NativeWarnMessage) => AppError;
}

export function createNativeStageHandlers(
  input: CreateNativeStageHandlersInput,
): NativeStageHandlers {
  const {
    job,
    stageStartedAt,
    eventBus,
    scanPolicyService,
    emitQuickReadyFromNative,
    markVisibleNonRemovableRoot,
    toNativeScannerError,
  } = input;
  let queueDepth = 0;

  return {
    onAgg: (message) => {
      job.currentPath = message.path;
      markVisibleNonRemovableRoot(job, message.path);
      if (message.countDelta > 0) {
        scanPolicyService.recordFileObservation(
          job,
          message.path,
          message.sizeDelta,
        );
      } else if (message.sizeDelta > 0) {
        scanPolicyService.recordEstimatedDirectory(
          job,
          message.path,
          message.sizeDelta,
        );
      }
      eventBus.emitProgressBatch(job, "walking", false);
    },
    onAggBatch: (message) => {
      let lastPath: string | null = null;
      for (const item of message.items) {
        lastPath = item.path;
        markVisibleNonRemovableRoot(job, item.path);
        if (item.countDelta > 0) {
          scanPolicyService.recordFileObservation(
            job,
            item.path,
            item.sizeDelta,
          );
          continue;
        }

        if (item.sizeDelta > 0) {
          scanPolicyService.recordEstimatedDirectory(
            job,
            item.path,
            item.sizeDelta,
          );
        }
      }
      if (lastPath) {
        job.currentPath = lastPath;
      }
      eventBus.emitProgressBatch(job, "walking", false);
    },
    onProgress: (message) => {
      job.scannedCount = Math.max(job.scannedCount, message.scannedCount);
      queueDepth = message.queuedDirs;
      if (message.currentPath) {
        scanPolicyService.syncExactTraversal(job, message.currentPath);
        job.currentPath = message.currentPath;
        markVisibleNonRemovableRoot(job, message.currentPath);
      }
      eventBus.emitProgressBatch(job, "walking", false);
      eventBus.emitDiagnostics(job, "walking", queueDepth, false);
    },
    onCoverage: (message) => {
      job.blockedByPolicyCount = Math.max(
        job.blockedByPolicyCount,
        message.blockedByPolicy,
      );
      job.blockedByPermissionCount = Math.max(
        job.blockedByPermissionCount,
        message.blockedByPermission,
      );
      job.skippedByScopeCount = Math.max(
        job.skippedByScopeCount,
        message.skippedByScope,
      );
      job.elevationRequired =
        job.elevationRequired || Boolean(message.elevationRequired);
      eventBus.emitCoverageUpdate(job, true);
    },
    onDiagnostics: (message) => {
      if (message.hotPath) {
        job.currentPath = message.hotPath;
      }
      if (typeof message.softSkippedByPolicy === "number") {
        job.softSkippedByPolicyCount = Math.max(
          job.softSkippedByPolicyCount,
          message.softSkippedByPolicy,
        );
      }
      if (typeof message.deferredByBudget === "number") {
        job.deferredByBudgetCount = Math.max(
          job.deferredByBudgetCount,
          message.deferredByBudget,
        );
      }
      if (typeof message.inflight === "number") {
        job.inflightCount = message.inflight;
      }
      job.skipSamples = mergeSkipSamples(job.skipSamples, {
        policy: message.policySkipSamples,
        permission: message.permissionSamples,
        scope: message.scopeSkipSamples,
        budgetDeferred: message.budgetDeferredSamples,
      });
      eventBus.emitPerfSample(job, {
        filesPerSec: message.filesPerSec,
        stageElapsedMs: message.stageElapsedMs,
        ioWaitRatio: message.ioWaitRatio,
        queueDepth: message.queueDepth,
        hotPath: message.hotPath,
        softSkippedByPolicy: message.softSkippedByPolicy,
        deferredByBudget: message.deferredByBudget,
        inflight: message.inflight,
      });
    },
    onElevationRequired: (message) => {
      job.elevationRequired = true;
      scanPolicyService.emitElevationRequired(job, message.targetPath, message.reason);
      eventBus.emitCoverageUpdate(job, true);
    },
    onHelperPlan: (message) => {
      job.helperPlan = message;
      eventBus.emitDiagnostics(job, "walking", queueDepth, true);
    },
    onQuickReady: (message) => {
      emitQuickReadyFromNative(job, message, stageStartedAt);
    },
    onWarn: (message) => {
      scanPolicyService.emitRecoverableError(
        job,
        toNativeScannerError(job.scanId, message),
      );
    },
    onDone: () => {
      eventBus.emitProgressBatch(job, "walking", true);
      eventBus.emitDiagnostics(job, "walking", queueDepth, true);
    },
  };
}

function mergeSkipSamples(
  current: ScanSkipSamples,
  next: ScanSkipSamples,
): ScanSkipSamples {
  return {
    policy: mergeSampleList(current.policy, next.policy),
    permission: mergeSampleList(current.permission, next.permission),
    scope: mergeSampleList(current.scope, next.scope),
    budgetDeferred: mergeSampleList(current.budgetDeferred, next.budgetDeferred),
  };
}

function mergeSampleList(
  current: string[] | undefined,
  next: string[] | undefined,
): string[] | undefined {
  const merged: string[] = [];
  for (const value of [...(current ?? []), ...(next ?? [])]) {
    if (!value || merged.includes(value)) {
      continue;
    }
    merged.push(value);
    if (merged.length >= MAX_SKIP_SAMPLE_PATHS) {
      break;
    }
  }
  return merged.length > 0 ? merged : undefined;
}
