import type { HelperEvent } from "../../../shared/schemas/helperProtocol";
import type {
  NativeAggBatchMessage,
  NativeCoverageMessage,
  NativeDoneMessage,
  NativeProgressMessage,
  NativeScannerMessage,
  NativeWarnMessage,
} from "../native/nativeRustScannerClient";

export function mapHelperEventToNativeMessages(
  event: HelperEvent,
): NativeScannerMessage[] {
  switch (event.type) {
    case "ready":
      return [];
    case "entry_batch":
      return mapEntryBatch(event);
    case "progress":
      return [mapProgress(event)];
    case "coverage":
      return [mapCoverage(event)];
    case "warn":
      return [mapWarn(event)];
    case "done":
      return [mapDone(event)];
    case "error":
      return [mapError(event)];
  }
}

function mapEntryBatch(
  event: Extract<HelperEvent, { type: "entry_batch" }>,
): NativeAggBatchMessage[] {
  const items = event.items
    .filter((item) => item.kind === "file" || item.kind === "dir")
    .map((item) => ({
      path: item.path,
      sizeDelta: item.kind === "file" ? item.size : 0,
      countDelta: item.kind === "file" ? 1 : 0,
      estimated: false,
    }));

  return items.length > 0 ? [{
    type: "agg_batch",
    items,
  }] : [];
}

function mapProgress(
  event: Extract<HelperEvent, { type: "progress" }>,
): NativeProgressMessage {
  return {
    type: "progress",
    scannedCount: event.scannedCount,
    queuedDirs: 0,
    elapsedMs: 0,
    currentPath: event.currentPath,
  };
}

function mapCoverage(
  event: Extract<HelperEvent, { type: "coverage" }>,
): NativeCoverageMessage {
  return {
    type: "coverage",
    scanned: event.scannedCount ?? 0,
    blockedByPolicy: 0,
    blockedByPermission: event.permissionFailures,
    skippedByScope: event.scopeFailures ?? 0,
    elevationRequired: event.permissionFailures > 0,
  };
}

function mapWarn(event: Extract<HelperEvent, { type: "warn" }>): NativeWarnMessage {
  return {
    type: "warn",
    code: mapHelperWarnCode(event.code),
    message: event.message,
    path: event.path,
    recoverable: event.code !== "E_CANCELLED",
  };
}

function mapDone(event: Extract<HelperEvent, { type: "done" }>): NativeDoneMessage {
  return {
    type: "done",
    elapsedMs: event.elapsedMs,
    estimated: false,
  };
}

function mapError(event: Extract<HelperEvent, { type: "error" }>): NativeWarnMessage {
  return {
    type: "warn",
    code: event.code,
    message: event.message,
    recoverable: false,
  };
}

function mapHelperWarnCode(code: Extract<HelperEvent, { type: "warn" }>["code"]): string {
  switch (code) {
    case "E_HELPER_PERMISSION":
    case "E_TCC_PERMISSION":
      return "E_PERMISSION";
    case "E_IO":
    case "E_SCOPE":
    case "E_CANCELLED":
      return code;
  }
}
