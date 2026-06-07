import crypto from "node:crypto";
import os from "node:os";
import { appendNativeScannerLog } from "../diagnostics/nativeScannerLogger";
import {
  createDefaultHelperClient,
  type HelperClient,
  type HelperClientStatus,
} from "../helper/helperClient";
import type { HelperLifecycleStatus } from "../helper/helperLifecycle";
import type { HelperEvent } from "../../../shared/schemas/helperProtocol";
import {
  resolveHelperScanPlan,
  type HelperScanPlan,
} from "../helper/helperScanPlanner";
import { mapHelperEventToNativeMessages } from "./helperEventAdapter";
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
  type NativeScannerMessage,
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

export const SCAN_HELPER_PROTOTYPE_ENUMERATE_ENV =
  "SCAN_HELPER_PROTOTYPE_ENUMERATE";

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
  onHelperPlan?: (message: NativeHelperPlanMessage) => void;
  onProgress: (message: NativeProgressMessage) => void;
  onQuickReady: (message: NativeQuickReadyMessage) => void;
  onWarn: (message: NativeWarnMessage) => void;
}

export interface NativeHelperPlanMessage {
  engine: HelperScanPlan["engine"];
  fallbackReason?: HelperScanPlan["reason"];
  lifecycle?: HelperLifecycleStatus;
  productionReadiness:
    | "ready"
    | "prototype-only"
    | "blocked"
    | "unavailable";
  prototypeEnumerate?: boolean;
  registrationBlockers?: NonNullable<
    HelperClientStatus["registrationPreflight"]
  >["blockers"];
  transport: HelperClientStatus["transport"];
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

export interface NativeScanOrchestratorOptions {
  createNativeSession?: () => NativeScannerSession;
  helperPrototypeEnumerate?: boolean;
}

export class NativeScanOrchestrator {
  private readonly sessions = new Map<string, NativeScannerSession>();
  private readonly createNativeSession: () => NativeScannerSession;
  private readonly helperPrototypeEnumerate: boolean;

  constructor(
    private readonly helperClient: HelperClient = createDefaultHelperClient(),
    options: NativeScanOrchestratorOptions = {},
  ) {
    this.createNativeSession = options.createNativeSession
      ?? createNativeScannerSession;
    this.helperPrototypeEnumerate = options.helperPrototypeEnumerate
      ?? resolveHelperPrototypeEnumerateFromEnv(process.env);
  }

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
    const platform = os.platform();
    const helperStatus = await this.resolveHelperStatus({
      options: context.options,
      platform,
      stage: input.mode,
    });
    const helperPlan = resolveNativeHelperScanPlan({
      platform,
      stage: input.mode,
      options: context.options,
      helperStatus,
      helperPrototypeEnumerate: this.helperPrototypeEnumerate,
    });
    appendNativeScannerLog({
      event: "native_helper_scan_plan",
      scanId: context.scanId,
      stage: input.mode,
      details: {
        engine: helperPlan.engine,
        fallbackReason: helperPlan.reason,
        helperAvailable: helperStatus.available,
        helperLifecycle: helperStatus.lifecycle
          ? {
              state: helperStatus.lifecycle.state,
              reason: helperStatus.lifecycle.reason,
              checks: helperStatus.lifecycle.checks,
            }
          : undefined,
        helperRegistrationPreflight: helperStatus.registrationPreflight
          ? {
              status: helperStatus.registrationPreflight.status,
              blockers: helperStatus.registrationPreflight.blockers,
              contract: helperStatus.registrationPreflight.contract,
            }
          : undefined,
        helperUnavailableReason: helperStatus.reason,
        helperPrototypeEnumerate: this.helperPrototypeEnumerate,
        helperProductionReadiness: resolveHelperProductionReadiness({
          helperPlan,
          helperStatus,
          helperPrototypeEnumerate: this.helperPrototypeEnumerate,
        }),
        helperTransport: helperStatus.transport,
        accuracyMode: context.options.accuracyMode,
        deepPolicyPreset: context.options.deepPolicyPreset,
      },
    });
    const helperPlanMessage: NativeHelperPlanMessage = {
      engine: helperPlan.engine,
      productionReadiness: resolveHelperProductionReadiness({
        helperPlan,
        helperStatus,
        helperPrototypeEnumerate: this.helperPrototypeEnumerate,
      }),
      transport: helperStatus.transport,
    };
    if (helperPlan.reason) {
      helperPlanMessage.fallbackReason = helperPlan.reason;
    }
    if (helperStatus.lifecycle) {
      helperPlanMessage.lifecycle = helperStatus.lifecycle;
    }
    if (helperStatus.registrationPreflight?.blockers.length) {
      helperPlanMessage.registrationBlockers = [
        ...helperStatus.registrationPreflight.blockers,
      ];
    }
    if (this.helperPrototypeEnumerate) {
      helperPlanMessage.prototypeEnumerate = true;
    }
    handlers.onHelperPlan?.(helperPlanMessage);

    if (helperPlan.engine === "helper") {
      try {
        return await this.runHelperStage(context, input, volumePlan, handlers);
      } catch (error) {
        appendNativeScannerLog({
          event: "native_helper_scan_fallback",
          scanId: context.scanId,
          stage: input.mode,
          details: {
            reason: error instanceof Error ? error.message : String(error),
            fallbackEngine: "native",
          },
        });
      }
    }

    return await this.runNativeStage(context, input, volumePlan, handlers);
  }

  private async runHelperStage(
    context: NativeStageContext,
    input: NativeStageInput,
    volumePlan: NativeVolumePlan,
    handlers: NativeStageHandlers,
  ): Promise<{ estimated: boolean }> {
    let doneEstimated = false;
    let doneReceived = false;
    let terminalHelperErrorReason: string | null = null;
    const helperRequestId = crypto.randomUUID();
    const traversalPolicyPlanId = buildHelperTraversalPolicyPlanId(
      context.scanId,
      input.mode,
      context.options.deepPolicyPreset,
    );
    const auditCounts: HelperStageAuditCounts = {
      cancellationCount: 0,
      entryCount: 0,
      ioFailureCount: 0,
      permissionFailureCount: 0,
      scopeRejectionCount: 0,
      tccFailureCount: 0,
    };

    appendNativeScannerLog({
      event: "native_helper_scan_start",
      scanId: context.scanId,
      stage: input.mode,
      details: {
        operation: "scan.enumerate",
        requestId: helperRequestId,
        rootPath: context.rootPath,
        traversalPolicyPlanId,
        volumePolicy: volumePlan.volumePolicy,
        plannedRoots: volumePlan.plannedRoots,
      },
    });

    try {
      await this.helperClient.enumerate(
        {
          rootPath: context.rootPath,
          scanId: context.scanId,
          stageId: input.mode,
          scanMode: input.mode,
          options: context.options,
          volumePlan,
          maxDepth: input.maxDepth,
          requestId: helperRequestId,
          traversalPolicyPlanId,
        },
        {
          onEvent: (event) => {
            updateHelperStageAuditCounts(auditCounts, event);
            if (event.type === "ready") {
              appendNativeScannerLog({
                event: "native_helper_scan_ready",
                scanId: context.scanId,
                stage: input.mode,
                details: {
                  helperVersion: event.helperVersion,
                  operation: "scan.enumerate",
                  plannedRoots: volumePlan.plannedRoots,
                  requestId: event.requestId,
                  rootPath: context.rootPath,
                  traversalPolicyPlanId,
                  volumePolicy: volumePlan.volumePolicy,
                },
              });
            }
            if (event.type === "error") {
              terminalHelperErrorReason =
                `helper-error:${event.code}:${event.message}`;
              appendNativeScannerLog({
                event: "native_helper_scan_terminal",
                level: "error",
                scanId: context.scanId,
                stage: input.mode,
                details: {
                  code: event.code,
                  message: event.message,
                  ...auditCounts,
                  operation: "scan.enumerate",
                  plannedRoots: volumePlan.plannedRoots,
                  requestId: event.requestId,
                  rootPath: context.rootPath,
                  terminalStatus: "error",
                  traversalPolicyPlanId,
                  volumePolicy: volumePlan.volumePolicy,
                },
              });
            }
            if (event.type === "done") {
              appendNativeScannerLog({
                event: "native_helper_scan_terminal",
                scanId: context.scanId,
                stage: input.mode,
                details: {
                  elapsedMs: event.elapsedMs,
                  estimated: event.estimated,
                  ...auditCounts,
                  operation: "scan.enumerate",
                  plannedRoots: volumePlan.plannedRoots,
                  requestId: event.requestId,
                  rootPath: context.rootPath,
                  terminalStatus: "done",
                  traversalPolicyPlanId,
                  volumePolicy: volumePlan.volumePolicy,
                },
              });
            }
            for (const message of mapHelperEventToNativeMessages(event)) {
              if (message.type === "done") {
                doneReceived = true;
                doneEstimated = message.estimated;
              }
              dispatchNativeStageMessage(message, handlers);
            }
          },
        },
      );
    } catch (error) {
      if (terminalHelperErrorReason) {
        throw new Error(terminalHelperErrorReason, { cause: error });
      }
      throw error;
    }

    if (!doneReceived && !context.cancelled) {
      if (terminalHelperErrorReason) {
        throw new Error(terminalHelperErrorReason);
      }
      throw new Error(`Helper stage ${input.mode} finished without done event`);
    }

    return { estimated: doneEstimated };
  }

  private async runNativeStage(
    context: NativeStageContext,
    input: NativeStageInput,
    volumePlan: NativeVolumePlan,
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
          if (message.type === "done") {
            doneReceived = true;
            doneEstimated = message.estimated;
          }
          dispatchNativeStageMessage(message, handlers);
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

    const created = this.createNativeSession();
    this.sessions.set(scanId, created);
    return created;
  }

  private async resolveHelperStatus(input: {
    options: Pick<ResolvedScanOptions, "accuracyMode" | "deepPolicyPreset">;
    platform: NodeJS.Platform;
    stage: NativeScanPhaseMode;
  }): Promise<HelperClientStatus> {
    try {
      return shouldProbeHelperHealthForStage(input)
        ? await this.helperClient.healthCheck()
        : await this.helperClient.getStatus();
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
  helperPrototypeEnumerate?: boolean;
}): HelperScanPlan {
  return resolveHelperScanPlan(input);
}

export function resolveHelperPrototypeEnumerateFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env[SCAN_HELPER_PROTOTYPE_ENUMERATE_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function resolveHelperProductionReadiness(input: {
  helperPlan: HelperScanPlan;
  helperStatus: HelperClientStatus;
  helperPrototypeEnumerate: boolean;
}): NativeHelperPlanMessage["productionReadiness"] {
  if (input.helperPlan.engine === "helper") {
    return input.helperStatus.available ? "ready" : "prototype-only";
  }
  if (input.helperStatus.registrationPreflight?.status === "blocked") {
    return "blocked";
  }
  if (input.helperPrototypeEnumerate) {
    return "prototype-only";
  }
  return "unavailable";
}

function dispatchNativeStageMessage(
  message: NativeScannerMessage,
  handlers: NativeStageHandlers,
): void {
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
      handlers.onDone(message);
      return;
  }
}

interface HelperStageAuditCounts {
  cancellationCount: number;
  entryCount: number;
  ioFailureCount: number;
  permissionFailureCount: number;
  scopeRejectionCount: number;
  tccFailureCount: number;
}

function updateHelperStageAuditCounts(
  counts: HelperStageAuditCounts,
  event: HelperEvent,
): void {
  switch (event.type) {
    case "entry_batch":
      counts.entryCount += event.items.length;
      return;
    case "coverage":
      counts.ioFailureCount = Math.max(counts.ioFailureCount, event.ioFailures);
      counts.permissionFailureCount = Math.max(
        counts.permissionFailureCount,
        event.permissionFailures,
      );
      counts.scopeRejectionCount = Math.max(
        counts.scopeRejectionCount,
        event.scopeFailures ?? 0,
      );
      return;
    case "warn":
      if (event.code === "E_HELPER_PERMISSION") {
        counts.permissionFailureCount += 1;
      }
      if (event.code === "E_TCC_PERMISSION") {
        counts.tccFailureCount += 1;
      }
      if (event.code === "E_IO") {
        counts.ioFailureCount += 1;
      }
      if (event.code === "E_SCOPE") {
        counts.scopeRejectionCount += 1;
      }
      if (event.code === "E_CANCELLED") {
        counts.cancellationCount += 1;
      }
      return;
    case "done":
    case "error":
    case "progress":
    case "ready":
      return;
  }
}

function buildHelperTraversalPolicyPlanId(
  scanId: string,
  stageId: NativeScanPhaseMode,
  deepPolicyPreset: ResolvedScanOptions["deepPolicyPreset"],
): string {
  return `${scanId}:${stageId}:${deepPolicyPreset}`;
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

function shouldProbeHelperHealthForStage(input: {
  options: Pick<ResolvedScanOptions, "accuracyMode" | "deepPolicyPreset">;
  platform: NodeJS.Platform;
  stage: NativeScanPhaseMode;
}): boolean {
  return input.platform === "darwin"
    && input.stage === "deep"
    && input.options.accuracyMode === "full"
    && input.options.deepPolicyPreset === "exact";
}

function normalizePlanRoot(rootPath: string): string {
  const normalized = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.length > 0 ? normalized : "/";
}
