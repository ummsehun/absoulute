import { appendNativeScannerLog } from "../diagnostics/nativeScannerLogger";
import type {
  NativeScanOrchestrator,
  NativeStageContext,
  NativeStageHandlers,
} from "./nativeScanOrchestrator";
import type { ScanEventBus } from "./scanEventBus";
import type { ScanJob } from "./scanSessionTypes";

export interface RunPermissionRescanStagesInput {
  createNativeStageHandlers: (
    job: ScanJob,
    stageStartedAt: number,
  ) => NativeStageHandlers;
  eventBus: Pick<ScanEventBus, "emitDiagnostics" | "emitProgressBatch">;
  job: ScanJob;
  maxDepth: number;
  nativeScanOrchestrator: Pick<NativeScanOrchestrator, "runStage">;
  toNativeStageContext: (job: ScanJob, rootPath?: string) => NativeStageContext;
}

export async function runPermissionRescanStages(
  input: RunPermissionRescanStagesInput,
): Promise<void> {
  const { job } = input;
  const roots = [...job.pendingPermissionRescanRoots];
  if (roots.length === 0) {
    return;
  }

  for (const rootPath of roots) {
    if (job.cancelled) {
      return;
    }

    job.pendingPermissionRescanRoots.delete(rootPath);
    job.activePermissionRescanRoot = rootPath;
    job.scanStage = "deep";
    const stageStartedAt = Date.now();
    job.stageStartedAt = stageStartedAt;
    appendNativeScannerLog({
      event: "native_permission_rescan_start",
      scanId: job.scanId,
      stage: "deep",
      details: {
        rootPath,
        pendingRoots: [...job.pendingPermissionRescanRoots],
        completedRoots: job.completedPermissionRescanRoots,
      },
    });
    input.eventBus.emitProgressBatch(job, "walking", true);
    input.eventBus.emitDiagnostics(job, "walking", 0, true);

    const result = await input.nativeScanOrchestrator.runStage(
      input.toNativeStageContext(job, rootPath),
      {
        mode: "deep",
        maxDepth: input.maxDepth,
        timeBudgetMs: job.options.deepBudgetMs,
      },
      input.createNativeStageHandlers(job, stageStartedAt),
    );

    job.estimatedResult = job.estimatedResult || result.estimated;
    job.completedPermissionRescanRoots.push(rootPath);
    appendNativeScannerLog({
      event: "native_permission_rescan_done",
      scanId: job.scanId,
      stage: "deep",
      details: {
        rootPath,
        estimated: result.estimated,
        completedRoots: job.completedPermissionRescanRoots,
      },
    });
    job.activePermissionRescanRoot = undefined;
    input.eventBus.emitDiagnostics(job, "walking", 0, true);
  }
}
