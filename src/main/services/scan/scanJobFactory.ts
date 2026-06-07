import type { AggDelta, ScanStartRequest } from "../../../types/contracts";
import {
  createPathPolicyClassifier,
  type PathPolicyDecision,
} from "../../core/securityPolicy";
import { ScanAggregator } from "../scanAggregator";
import { resolveScanOptions } from "./scanRuntimeOptions";
import type { ScanJob } from "./scanSessionTypes";

export interface CreateScanJobInput {
  homeDirectory: string;
  input: ScanStartRequest;
  lastEmitAt: number;
  platform: NodeJS.Platform;
  rootDecision: PathPolicyDecision;
  rootDeviceId: number | null;
  scanId: string;
  startedAt: number;
  topLimitPerDirectory: number;
}

export function createScanJob(input: CreateScanJobInput): ScanJob {
  const options = resolveScanOptions(
    input.input,
    input.rootDecision.normalizedPath,
  );

  return {
    scanId: input.scanId,
    rootPath: input.rootDecision.normalizedPath,
    startedAt: input.startedAt,
    optInProtected: input.input.optInProtected,
    cancelled: false,
    paused: false,
    completed: false,
    scannedCount: 0,
    totalBytes: 0,
    currentPath: input.rootDecision.normalizedPath,
    lastEmitAt: input.lastEmitAt,
    pendingDeltaMap: new Map<string, AggDelta>(),
    pendingDeltaEventCount: 0,
    blockedByPolicyCount: 0,
    blockedByPermissionCount: 0,
    skippedByScopeCount: 0,
    elevationRequired: false,
    elevationAttempted: false,
    lastCoverageEmitAt: input.startedAt,
    stageStartedAt: input.startedAt,
    emittedErrorCount: 0,
    permissionErrorCount: 0,
    ioErrorCount: 0,
    quickReadyEmitted: false,
    estimatedResult: true,
    diagnosticsLastEmitAt: input.startedAt,
    estimatedDirectories: new Set<string>(),
    skippedHeavyDirectories: new Set<string>(),
    deepSkippedByPolicy: false,
    softSkippedByPolicyCount: 0,
    deferredByBudgetCount: 0,
    skipSamples: {},
    inflightCount: 0,
    rootDeviceId: input.rootDeviceId,
    deniedPermissionRoots:
      input.rootDecision.effectiveAccess?.deniedPermissionRoots ?? [],
    pendingPermissionRescanRoots: new Set<string>(),
    completedPermissionRescanRoots: [],
    nonRemovableRoots:
      input.rootDecision.effectiveAccess?.nonRemovableRoots ?? [],
    visibleNonRemovableRoots: new Set<string>(),
    options,
    engine: options.scanMode === "native_rust" ? "native" : "node",
    aggregator: new ScanAggregator(
      input.rootDecision.normalizedPath,
      input.topLimitPerDirectory,
      input.platform,
    ),
    pathClassifier: createPathPolicyClassifier(
      input.platform,
      input.homeDirectory,
      input.rootDecision.effectiveAccess,
    ),
    scanStage: "quick",
  };
}
