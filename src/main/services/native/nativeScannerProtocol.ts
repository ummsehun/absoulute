import type {
  NativeScannerMessage,
  NativeScannerStartRequest,
} from "./nativeRustScannerClient";

export function buildNativeScannerStartPayload(
  request: NativeScannerStartRequest,
): Record<string, unknown> {
  return {
    type: "start",
    scanId: request.scanId,
    root: request.root,
    mode: request.mode,
    platform: request.platform,
    timeBudgetMs: request.timeBudgetMs,
    maxDepth: request.maxDepth,
    sameDeviceOnly: request.sameDeviceOnly,
    concurrency: request.concurrency,
    accuracyMode: request.accuracyMode,
    deepPolicyPreset: request.deepPolicyPreset,
    elevationPolicy: request.elevationPolicy,
    emitPolicy: request.emitPolicy,
    concurrencyPolicy: request.concurrencyPolicy,
    skipBasenames: request.skipBasenames,
    softSkipPathRules: request.softSkipPathRules,
    softSkipPrefixes: request.softSkipPrefixes,
    skipDirSuffixes: request.skipDirSuffixes,
    blockedPrefixes: request.blockedPrefixes,
    permissionPrefixes: request.permissionPrefixes,
  };
}

export function summarizeNativeMessage(
  message: NativeScannerMessage,
): Record<string, unknown> {
  if (message.type === "agg_batch") {
    return {
      type: message.type,
      items: message.items.length,
    };
  }

  return { ...message };
}

export function parseNativeScannerLine(line: string): NativeScannerMessage | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  return parseSupportedNativeMessage(raw as Record<string, unknown>);
}

function parseSupportedNativeMessage(
  message: Record<string, unknown>,
): NativeScannerMessage | null {
  switch (message.type) {
    case "agg":
      if (
        typeof message.path === "string"
        && typeof message.sizeDelta === "number"
        && Number.isFinite(message.sizeDelta)
        && typeof message.countDelta === "number"
        && Number.isFinite(message.countDelta)
      ) {
        return {
          type: "agg",
          path: message.path,
          sizeDelta: Math.max(0, Math.floor(message.sizeDelta)),
          countDelta: Math.max(0, Math.floor(message.countDelta)),
          estimated: Boolean(message.estimated),
        };
      }
      return null;
    case "agg_batch": {
      if (!Array.isArray(message.items)) {
        return null;
      }
      const items = message.items
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null,
        )
        .map((item) => {
          const pathValue = typeof item.path === "string" ? item.path : "";
          const sizeDelta = toSafeNonNegative(item.sizeDelta);
          const countDelta = toSafeNonNegative(item.countDelta);
          const estimated = Boolean(item.estimated);
          return { path: pathValue, sizeDelta, countDelta, estimated };
        })
        .filter((item) => item.path.length > 0);

      if (items.length === 0) {
        return null;
      }

      return {
        type: "agg_batch",
        items,
      };
    }
    case "progress":
      if (
        typeof message.scannedCount === "number"
        && Number.isFinite(message.scannedCount)
        && typeof message.queuedDirs === "number"
        && Number.isFinite(message.queuedDirs)
        && typeof message.elapsedMs === "number"
        && Number.isFinite(message.elapsedMs)
      ) {
        return {
          type: "progress",
          scannedCount: Math.max(0, Math.floor(message.scannedCount)),
          queuedDirs: Math.max(0, Math.floor(message.queuedDirs)),
          elapsedMs: Math.max(0, Math.floor(message.elapsedMs)),
          currentPath:
            typeof message.currentPath === "string" ? message.currentPath : undefined,
        };
      }
      return null;
    case "coverage":
      return {
        type: "coverage",
        scanned: toSafeNonNegative(message.scanned),
        blockedByPolicy: toSafeNonNegative(message.blockedByPolicy),
        blockedByPermission: toSafeNonNegative(message.blockedByPermission),
        skippedByScope: toSafeNonNegative(message.skippedByScope),
        elevationRequired: Boolean(message.elevationRequired),
      };
    case "diagnostics":
      return {
        type: "diagnostics",
        filesPerSec: toSafeNonNegativeFloat(message.filesPerSec),
        stageElapsedMs: toSafeNonNegative(message.stageElapsedMs),
        ioWaitRatio: toSafeBoundedRatio(message.ioWaitRatio),
        queueDepth: toSafeNonNegative(message.queueDepth),
        hotPath: typeof message.hotPath === "string" ? message.hotPath : undefined,
        softSkippedByPolicy: toSafeOptionalNonNegative(message.softSkippedByPolicy),
        deferredByBudget: toSafeOptionalNonNegative(message.deferredByBudget),
        policySkipSamples: toSafeStringArray(message.policySkipSamples),
        permissionSamples: toSafeStringArray(message.permissionSamples),
        scopeSkipSamples: toSafeStringArray(message.scopeSkipSamples),
        budgetDeferredSamples: toSafeStringArray(message.budgetDeferredSamples),
        inflight: toSafeOptionalNonNegative(message.inflight),
      };
    case "elevation_required":
      if (typeof message.targetPath !== "string" || typeof message.reason !== "string") {
        return null;
      }
      return {
        type: "elevation_required",
        targetPath: message.targetPath,
        reason: message.reason,
        policy:
          message.policy === "auto"
          || message.policy === "manual"
          || message.policy === "none"
            ? message.policy
            : "manual",
      };
    case "quick_ready":
      return {
        type: "quick_ready",
        elapsedMs:
          typeof message.elapsedMs === "number" && Number.isFinite(message.elapsedMs)
            ? Math.max(0, Math.floor(message.elapsedMs))
            : 0,
        confidence:
          message.confidence === "low"
          || message.confidence === "medium"
          || message.confidence === "high"
            ? message.confidence
            : "medium",
        estimated: Boolean(message.estimated),
      };
    case "warn":
      return {
        type: "warn",
        code: typeof message.code === "string" ? message.code : "E_IO",
        message:
          typeof message.message === "string"
            ? message.message
            : "Native scanner warning",
        path: typeof message.path === "string" ? message.path : undefined,
        recoverable:
          typeof message.recoverable === "boolean" ? message.recoverable : true,
      };
    case "done":
      return {
        type: "done",
        elapsedMs:
          typeof message.elapsedMs === "number" && Number.isFinite(message.elapsedMs)
            ? Math.max(0, Math.floor(message.elapsedMs))
            : 0,
        estimated: Boolean(message.estimated),
      };
    default:
      return null;
  }
}

function toSafeNonNegative(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function toSafeOptionalNonNegative(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

function toSafeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const samples = value.filter((item): item is string => typeof item === "string");
  return samples.length > 0 ? samples.slice(0, 50) : undefined;
}

function toSafeNonNegativeFloat(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

function toSafeBoundedRatio(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}
