import os from "node:os";
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
  resolveNativeSkipBasenames,
  resolveNativeSkipDirSuffixes,
  resolveNativeSoftSkipPrefixes,
} from "./scanTraversalPolicy";

export interface NativeStageContext {
  cancelled: boolean;
  optInProtected: boolean;
  options: ResolvedScanOptions;
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

export class NativeScanOrchestrator {
  private readonly sessions = new Map<string, NativeScannerSession>();

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

    await session.runStage(
      {
        scanId: context.scanId,
        root: context.rootPath,
        mode: input.mode,
        platform: os.platform(),
        timeBudgetMs: input.timeBudgetMs,
        maxDepth: input.maxDepth,
        sameDeviceOnly: true,
        concurrency: context.options.statConcurrency,
        accuracyMode: context.options.accuracyMode,
        deepPolicyPreset: context.options.deepPolicyPreset,
        elevationPolicy: context.options.elevationPolicy,
        emitPolicy: context.options.emitPolicy,
        concurrencyPolicy: context.options.concurrencyPolicy,
        skipBasenames: resolveNativeSkipBasenames(context.options, input.mode),
        softSkipPrefixes: resolveNativeSoftSkipPrefixes(
          context.options,
          input.mode,
          os.platform(),
        ),
        skipDirSuffixes: resolveNativeSkipDirSuffixes(context.options, input.mode),
        blockedPrefixes: buildNativeBlockedPrefixes(
          os.platform(),
          os.homedir(),
          context.optInProtected,
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
}
