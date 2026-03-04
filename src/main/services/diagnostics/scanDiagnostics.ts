import type {
  ScanConfidence,
  ScanDiagnostics,
  ScanProgress,
  ScanQuickReady,
} from "../../../types/contracts";

export interface DiagnosticCounters {
  recoverableErrors: number;
  permissionErrors: number;
  ioErrors: number;
  estimatedDirectories?: number;
  engine?: "node" | "native";
  fallbackReason?: string;
  cpuHint?: string;
}

export function buildScanDiagnostics(
  progress: ScanProgress,
  elapsedMs: number,
  queueDepth: number,
  counters: DiagnosticCounters,
): ScanDiagnostics {
  return {
    scanId: progress.scanId,
    phase: progress.phase,
    scanStage: progress.scanStage,
    elapsedMs,
    scannedCount: progress.scannedCount,
    totalBytes: progress.totalBytes,
    queueDepth,
    recoverableErrors: counters.recoverableErrors,
    permissionErrors: counters.permissionErrors,
    ioErrors: counters.ioErrors,
    estimatedDirectories: counters.estimatedDirectories,
    engine: counters.engine,
    fallbackReason: counters.fallbackReason,
    cpuHint: counters.cpuHint,
  };
}

export function buildQuickReadyPayload(input: {
  scanId: string;
  rootPath: string;
  quickReadyAt: number;
  elapsedMs: number;
  confidence: ScanConfidence;
  estimated: boolean;
}): ScanQuickReady {
  return {
    scanId: input.scanId,
    rootPath: input.rootPath,
    quickReadyAt: input.quickReadyAt,
    elapsedMs: input.elapsedMs,
    scanStage: "quick",
    confidence: input.confidence,
    estimated: input.estimated,
  };
}

export function inferQuickConfidence(input: {
  rootPath: string;
  scannedCount: number;
  permissionErrors: number;
  ioErrors: number;
}): ScanConfidence {
  const totalIssues = input.permissionErrors + input.ioErrors;
  if (input.scannedCount <= 0) {
    return "low";
  }

  const ratio = totalIssues / input.scannedCount;
  if (input.rootPath === "/" && ratio > 0.2) {
    return "low";
  }

  if (ratio > 0.08) {
    return "medium";
  }

  return "high";
}
