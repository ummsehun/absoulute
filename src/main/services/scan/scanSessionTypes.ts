import type { AggDelta, ScanEngine, ScanProgress } from "../../../types/contracts";
import type { PathPolicyClassifier } from "../../core/securityPolicy";
import type { ScanAggregator } from "../scanAggregator";
import type { ResolvedScanOptions } from "./scanRuntimeOptions";

export type ScanStage = Exclude<ScanProgress["scanStage"], undefined>;

export interface QueueItem {
  dirPath: string;
  depth: number;
}

export interface ScanJob {
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
  blockedByPolicyCount: number;
  blockedByPermissionCount: number;
  elevationRequired: boolean;
  elevationAttempted: boolean;
  lastCoverageEmitAt: number;
  stageStartedAt: number;
  emittedErrorCount: number;
  permissionErrorCount: number;
  ioErrorCount: number;
  quickReadyEmitted: boolean;
  estimatedResult: boolean;
  diagnosticsLastEmitAt: number;
  estimatedDirectories: Set<string>;
  skippedHeavyDirectories: Set<string>;
  deepSkippedByPolicy: boolean;
  softSkippedByPolicyCount: number;
  deferredByBudgetCount: number;
  inflightCount: number;
  options: ResolvedScanOptions;
  engine: ScanEngine;
  fallbackReason?: string;
  aggregator: ScanAggregator;
  pathClassifier: PathPolicyClassifier;
  scanStage: ScanStage;
}
