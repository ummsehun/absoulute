import type { NativeHelperPlanMessage } from "../scan/nativeScanOrchestrator";
import type {
  NativeAggBatchMessage,
  NativeCoverageMessage,
  NativeDoneMessage,
  NativeProgressMessage,
  NativeWarnMessage,
} from "../native/nativeRustScannerClient";

export interface HelperPrototypeAuditLogEvent {
  event: string;
  details?: Record<string, unknown>;
}

export interface HelperPrototypeAuditInput {
  root: string;
  maxDepth: number;
  result: {
    estimated: boolean;
  };
  helperPlans: NativeHelperPlanMessage[];
  aggBatches: NativeAggBatchMessage[];
  coverage: NativeCoverageMessage[];
  done: NativeDoneMessage[];
  progress: NativeProgressMessage[];
  warnings: NativeWarnMessage[];
  logEvents: HelperPrototypeAuditLogEvent[];
}

export interface HelperPrototypeAuditSummary {
  root: string;
  maxDepth: number;
  engine: NativeHelperPlanMessage["engine"] | "unknown";
  transport: NativeHelperPlanMessage["transport"] | "unknown";
  prototypeEnumerate: boolean;
  resultEstimated: boolean;
  aggBatchCount: number;
  aggItemCount: number;
  scanned: number;
  blockedByPermission: number;
  skippedByScope: number;
  warningCount: number;
  permissionWarningCount: number;
  warningSamples: string[];
  permissionWarningSamples: string[];
  doneElapsedMs: number | null;
  fallbackUsed: boolean;
  helperAvailable: boolean | null;
  helperPrototypeLogged: boolean;
}

export function summarizeHelperPrototypeAudit(
  input: HelperPrototypeAuditInput,
): HelperPrototypeAuditSummary {
  const latestPlan = input.helperPlans.at(-1);
  const latestCoverage = input.coverage.at(-1);
  const latestDone = input.done.at(-1);
  const helperPlanLog = input.logEvents.find(
    (entry) => entry.event === "native_helper_scan_plan",
  );

  return {
    root: input.root,
    maxDepth: input.maxDepth,
    engine: latestPlan?.engine ?? "unknown",
    transport: latestPlan?.transport ?? "unknown",
    prototypeEnumerate: latestPlan?.prototypeEnumerate === true,
    resultEstimated: input.result.estimated,
    aggBatchCount: input.aggBatches.length,
    aggItemCount: input.aggBatches.reduce(
      (total, batch) => total + batch.items.length,
      0,
    ),
    scanned: latestCoverage?.scanned ?? input.progress.at(-1)?.scannedCount ?? 0,
    blockedByPermission: latestCoverage?.blockedByPermission ?? 0,
    skippedByScope: latestCoverage?.skippedByScope ?? 0,
    warningCount: input.warnings.length,
    permissionWarningCount: input.warnings.filter(isPermissionWarning).length,
    warningSamples: collectWarningSamples(input.warnings),
    permissionWarningSamples: collectWarningSamples(
      input.warnings.filter(isPermissionWarning),
    ),
    doneElapsedMs: latestDone?.elapsedMs ?? null,
    fallbackUsed: input.logEvents.some(
      (entry) => entry.event === "native_helper_scan_fallback",
    ),
    helperAvailable: readBooleanDetail(helperPlanLog, "helperAvailable"),
    helperPrototypeLogged:
      readBooleanDetail(helperPlanLog, "helperPrototypeEnumerate") === true,
  };
}

function isPermissionWarning(message: NativeWarnMessage): boolean {
  return message.code === "E_PERMISSION" || message.code === "E_TCC_PERMISSION";
}

function collectWarningSamples(
  warnings: NativeWarnMessage[],
  limit = 5,
): string[] {
  const samples = new Set<string>();
  for (const warning of warnings) {
    const sample = warning.path ?? warning.message;
    if (!sample) {
      continue;
    }
    samples.add(sample);
    if (samples.size >= limit) {
      break;
    }
  }
  return [...samples];
}

function readBooleanDetail(
  event: HelperPrototypeAuditLogEvent | undefined,
  key: string,
): boolean | null {
  const value = event?.details?.[key];
  return typeof value === "boolean" ? value : null;
}
