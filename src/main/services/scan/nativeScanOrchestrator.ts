import os from "node:os";
import { appendNativeScannerLog } from "../diagnostics/nativeScannerLogger";
import {
  createDefaultHelperClient,
  type HelperClient,
  type HelperClientStatus,
} from "../helper/helperClient";
import {
  resolveHelperScanPlan,
  type HelperScanPlan,
} from "../helper/helperScanPlanner";
import {
  createNativeScannerSession,
  type NativeAggBatchMessage,
  type NativeAggMessage,
  type NativeCoverageMessage,
  type NativeDiagnosticsMessage,
  type NativeDoneMessage,
  type NativeElevationRequiredMessage,
  type NativeProgressMessage,
  type NativeQuickReadyMessage,
  type NativeScanControl,
  type NativeScanPhaseMode,
  type NativeScannerSession,
  type NativeWarnMessage,
} from "../native/nativeRustScannerClient";
import type { ResolvedScanOptions } from "./scanRuntimeOptions";
import {
  buildNativeBlockedPrefixes,
  buildNativePermissionDeniedPrefixes,
  resolveNativeSkipBasenames,
  resolveNativeSkipDirSuffixes,
  resolveNativeSoftSkipPathRules,
  resolveNativeSoftSkipPrefixes,
} from "./scanTraversalPolicy";
import { isFilesystemRoot } from "./scanRuntimeOptions";

export interface NativeStageContext {
  cancelled: boolean;
  options: ResolvedScanOptions;
  permissionDeniedRoots: string[];
  paused: boolean;
  rootPath: string;
  scanId: string;
}

export interface NativeStageInput {
  maxDepth: number;
  mode: NativeScanPhaseMode;
  timeBudgetMs: number;
}

export interface NativeStageHandlers {
  onAgg: (message: NativeAggMessage) => void;
  onAggBatch: (message: NativeAggBatchMessage) => void;
  onCoverage: (message: NativeCoverageMessage) => void;
  onDiagnostics: (message: NativeDiagnosticsMessage) => void;
  onDone: (message: NativeDoneMessage) => void;
  onElevationRequired: (message: NativeElevationRequiredMessage) => void;
  onProgress: (message: NativeProgressMessage) => void;
  onQuickReady: (message: NativeQuickReadyMessage) => void;
  onWarn: (message: NativeWarnMessage) => void;
}

export type NativeVolumeRootKind =
  | "filesystem-root"
  | "data-volume"
  | "external-volume"
  | "directory";
export type NativeVolumePolicy = "same-device" | "root-cross-device" | "explicit-volumes";

export interface NativeVolumePlan {
  rootPath: string;
  rootKind: NativeVolumeRootKind;
  volumePolicy: NativeVolumePolicy;
  sameDeviceOnly: boolean;
  plannedRoots: string[];
}

export class NativeScanOrchestrator {
  private readonly sessions = new Map<string, NativeScannerSession>();

  constructor(
    private readonly helperClient: Pick<HelperClient, "getStatus"> =
      createDefaultHelperClient(),
  ) {}

  sendControl(scanId: string, control: NativeScanControl): void {
    this.sessions.get(scanId)?.sendControl(control);
  }

  dispose(scanId: string): void {
    const session = this.sessions.get(scanId);
    if (!session) {
      return;
    }

    session.dispose();
    this.sessions.delete(scanId);
  }

  async runStage(
    context: NativeStageContext,
    input: NativeStageInput,
    handlers: NativeStageHandlers,
  ): Promise<{ estimated: boolean }> {
    let doneEstimated = input.mode === "quick";
    let doneReceived = false;

    const session = this.getOrCreateSession(context.scanId);
    if (context.paused) {
      session.sendControl("pause");
    }
    if (context.cancelled) {
      session.sendControl("cancel");
    }
    const volumePlan = resolveNativeVolumePlan(context);
    appendNativeScannerLog({
      event: "native_volume_plan",
      scanId: context.scanId,
      stage: input.mode,
      details: {
        rootPath: context.rootPath,
        rootKind: volumePlan.rootKind,
        volumePolicy: volumePlan.volumePolicy,
        sameDeviceOnly: volumePlan.sameDeviceOnly,
        plannedRoots: volumePlan.plannedRoots,
      },
    });
    const helperStatus = await this.resolveHelperStatus();
    const helperPlan = resolveNativeHelperScanPlan({
      platform: os.platform(),
      stage: input.mode,
      options: context.options,
      helperStatus,
    });
    appendNativeScannerLog({
      event: "native_helper_scan_plan",
      scanId: context.scanId,
      stage: input.mode,
      details: {
        engine: helperPlan.engine,
        fallbackReason: helperPlan.reason,
        helperAvailable: helperStatus.available,
        helperUnavailableReason: helperStatus.reason,
        helperTransport: helperStatus.transport,
        accuracyMode: context.options.accuracyMode,
        deepPolicyPreset: context.options.deepPolicyPreset,
      },
    });

    await session.runStage(
      {
        scanId: context.scanId,
        root: context.rootPath,
        mode: input.mode,
        platform: os.platform(),
        timeBudgetMs: input.timeBudgetMs,
        maxDepth: input.maxDepth,
        sameDeviceOnly: volumePlan.sameDeviceOnly,
        concurrency: context.options.statConcurrency,
        accuracyMode: context.options.accuracyMode,
        deepPolicyPreset: context.options.deepPolicyPreset,
        elevationPolicy: context.options.elevationPolicy,
        emitPolicy: context.options.emitPolicy,
        concurrencyPolicy: context.options.concurrencyPolicy,
        skipBasenames: resolveNativeSkipBasenames(context.options, input.mode),
        softSkipPathRules: resolveNativeSoftSkipPathRules(context.options, input.mode),
        softSkipPrefixes: resolveNativeSoftSkipPrefixes(
          context.options,
          input.mode,
          os.platform(),
        ),
        skipDirSuffixes: resolveNativeSkipDirSuffixes(context.options, input.mode),
        blockedPrefixes: buildNativeBlockedPrefixes(
          os.platform(),
          os.homedir(),
        ),
        permissionPrefixes: buildNativePermissionDeniedPrefixes(
          os.platform(),
          context.permissionDeniedRoots,
        ),
      },
      {
        onMessage: (message) => {
          switch (message.type) {
            case "agg":
              handlers.onAgg(message);
              return;
            case "agg_batch":
              handlers.onAggBatch(message);
              return;
            case "progress":
              handlers.onProgress(message);
              return;
            case "coverage":
              handlers.onCoverage(message);
              return;
            case "diagnostics":
              handlers.onDiagnostics(message);
              return;
            case "elevation_required":
              handlers.onElevationRequired(message);
              return;
            case "quick_ready":
              handlers.onQuickReady(message);
              return;
            case "warn":
              handlers.onWarn(message);
              return;
            case "done":
              doneReceived = true;
              doneEstimated = message.estimated;
              handlers.onDone(message);
              return;
            default:
              return;
          }
        },
      },
    );

    if (!doneReceived && !context.cancelled) {
      throw new Error(`Native stage ${input.mode} finished without done event`);
    }

    return { estimated: doneEstimated };
  }

  private getOrCreateSession(scanId: string): NativeScannerSession {
    const existing = this.sessions.get(scanId);
    if (existing) {
      return existing;
    }

    const created = createNativeScannerSession();
    this.sessions.set(scanId, created);
    return created;
  }

  private async resolveHelperStatus(): Promise<HelperClientStatus> {
    try {
      return await this.helperClient.getStatus();
    } catch (error) {
      return {
        available: false,
        reason: `helper-status-failed:${String(error)}`,
        transport: "disabled",
      };
    }
  }
}

export function resolveNativeHelperScanPlan(input: {
  platform: NodeJS.Platform;
  stage: NativeScanPhaseMode;
  options: Pick<ResolvedScanOptions, "accuracyMode" | "deepPolicyPreset">;
  helperStatus: HelperClientStatus;
}): HelperScanPlan {
  return resolveHelperScanPlan(input);
}

export function resolveNativeSameDeviceOnly(context: Pick<NativeStageContext, "rootPath">): boolean {
  return resolveNativeVolumePlan(context).sameDeviceOnly;
}

export function resolveNativeVolumePlan(
  context: Pick<NativeStageContext, "rootPath">,
  platform = os.platform(),
): NativeVolumePlan {
  const rootPath = normalizePlanRoot(context.rootPath);

  if (isFilesystemRoot(rootPath, platform)) {
    return {
      rootPath,
      rootKind: "filesystem-root",
      volumePolicy: "root-cross-device",
      sameDeviceOnly: false,
      plannedRoots: [rootPath],
    };
  }

  if (platform === "darwin" && rootPath === "/System/Volumes/Data") {
    return {
      rootPath,
      rootKind: "data-volume",
      volumePolicy: "explicit-volumes",
      sameDeviceOnly: true,
      plannedRoots: [rootPath],
    };
  }

  if (platform === "darwin" && rootPath.startsWith("/Volumes/")) {
    return {
      rootPath,
      rootKind: "external-volume",
      volumePolicy: "explicit-volumes",
      sameDeviceOnly: true,
      plannedRoots: [rootPath],
    };
  }

  return {
    rootPath,
    rootKind: "directory",
    volumePolicy: "same-device",
    sameDeviceOnly: true,
    plannedRoots: [rootPath],
  };
}

function normalizePlanRoot(rootPath: string): string {
  const normalized = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.length > 0 ? normalized : "/";
}
