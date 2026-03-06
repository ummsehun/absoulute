import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import type {
  ScanAccuracyMode,
  ScanConcurrencyPolicy,
  ScanConfidence,
  ScanDeepPolicyPreset,
  ScanElevationPolicy,
  ScanEmitPolicy,
} from "../../../types/contracts";

export type NativeScanPhaseMode = "quick" | "deep";
export type NativeScanControl = "pause" | "resume" | "cancel";
export type NativeAccuracyMode = ScanAccuracyMode;
export type NativeDeepPolicyPreset = ScanDeepPolicyPreset;
export type NativeElevationPolicy = ScanElevationPolicy;
export type NativeEmitPolicy = ScanEmitPolicy;
export type NativeConcurrencyPolicy = ScanConcurrencyPolicy;

export interface NativeScannerStartRequest {
  scanId: string;
  root: string;
  mode: NativeScanPhaseMode;
  platform: NodeJS.Platform;
  timeBudgetMs: number;
  maxDepth: number;
  sameDeviceOnly: boolean;
  concurrency: number;
  accuracyMode: NativeAccuracyMode;
  deepPolicyPreset: NativeDeepPolicyPreset;
  elevationPolicy: NativeElevationPolicy;
  emitPolicy: NativeEmitPolicy;
  concurrencyPolicy: NativeConcurrencyPolicy;
  skipBasenames: string[];
  softSkipPrefixes: string[];
  skipDirSuffixes: string[];
  blockedPrefixes: string[];
}

export interface NativeAggMessage {
  type: "agg";
  path: string;
  sizeDelta: number;
  countDelta: number;
  estimated: boolean;
}

export interface NativeAggBatchMessage {
  type: "agg_batch";
  items: Array<{
    path: string;
    sizeDelta: number;
    countDelta: number;
    estimated: boolean;
  }>;
}

export interface NativeProgressMessage {
  type: "progress";
  scannedCount: number;
  queuedDirs: number;
  elapsedMs: number;
  currentPath?: string;
}

export interface NativeCoverageMessage {
  type: "coverage";
  scanned: number;
  blockedByPolicy: number;
  blockedByPermission: number;
  elevationRequired: boolean;
}

export interface NativeDiagnosticsMessage {
  type: "diagnostics";
  filesPerSec: number;
  stageElapsedMs: number;
  ioWaitRatio: number;
  queueDepth: number;
  hotPath?: string;
  softSkippedByPolicy?: number;
  deferredByBudget?: number;
  inflight?: number;
}

export interface NativeElevationRequiredMessage {
  type: "elevation_required";
  targetPath: string;
  reason: string;
  policy: NativeElevationPolicy;
}

export interface NativeQuickReadyMessage {
  type: "quick_ready";
  elapsedMs: number;
  confidence: ScanConfidence;
  estimated: boolean;
}

export interface NativeWarnMessage {
  type: "warn";
  code: string;
  message: string;
  path?: string;
  recoverable?: boolean;
}

export interface NativeDoneMessage {
  type: "done";
  elapsedMs: number;
  estimated: boolean;
}

export type NativeScannerMessage =
  | NativeAggMessage
  | NativeAggBatchMessage
  | NativeProgressMessage
  | NativeCoverageMessage
  | NativeDiagnosticsMessage
  | NativeElevationRequiredMessage
  | NativeQuickReadyMessage
  | NativeWarnMessage
  | NativeDoneMessage;

export interface NativeScannerEventHandlers {
  onMessage: (message: NativeScannerMessage) => void;
}

export interface NativeScannerSession {
  readonly pid: number;
  readonly binaryPath: string;
  runStage: (
    request: NativeScannerStartRequest,
    handlers: NativeScannerEventHandlers,
  ) => Promise<void>;
  sendControl: (control: NativeScanControl) => void;
  waitForExit: () => Promise<void>;
  dispose: () => void;
}

interface ActiveStage {
  handlers: NativeScannerEventHandlers;
  resolve: () => void;
  reject: (error: Error) => void;
}

export function resolveNativeScannerBinary(): string | null {
  const envPath = process.env.SCAN_NATIVE_BIN;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const binaryNames = getPlatformBinaryNames();
  const preferReleaseFirst = process.env.NODE_ENV === "production";
  const buildModes = preferReleaseFirst
    ? (["release", "debug"] as const)
    : (["debug", "release"] as const);
  for (const mode of buildModes) {
    for (const binaryName of binaryNames) {
      const devCandidate = path.resolve(
        process.cwd(),
        "native",
        "scanner",
        "target",
        mode,
        binaryName,
      );
      if (fs.existsSync(devCandidate)) {
        return devCandidate;
      }
    }
  }

  const resourcesPath =
    typeof process.resourcesPath === "string" ? process.resourcesPath : null;
  if (resourcesPath) {
    for (const binaryName of binaryNames) {
      const bundledCandidate = path.resolve(resourcesPath, "bin", binaryName);
      if (fs.existsSync(bundledCandidate)) {
        return bundledCandidate;
      }
    }
  }

  return null;
}

export function createNativeScannerSession(): NativeScannerSession {
  const binaryPath = resolveNativeScannerBinary();
  if (!binaryPath) {
    throw new Error("Native scanner binary not found");
  }

  const child = spawn(binaryPath, [], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const writeJsonLine = (payload: unknown): void => {
    if (!child.stdin.writable) {
      return;
    }
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  };

  let stderr = "";
  let disposed = false;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  let activeStage: ActiveStage | null = null;
  const stdoutLines = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  const resolveStage = (): void => {
    if (!activeStage) {
      return;
    }
    activeStage.resolve();
    activeStage = null;
  };

  const rejectStage = (error: Error): void => {
    if (!activeStage) {
      return;
    }
    activeStage.reject(error);
    activeStage = null;
  };

  stdoutLines.on("line", (line) => {
    const parsed = parseNativeScannerLine(line);
    if (!parsed || !activeStage) {
      return;
    }

    activeStage.handlers.onMessage(parsed);
    if (parsed.type === "done") {
      resolveStage();
    }
  });

  const waitForExit = new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      stdoutLines.close();
      rejectStage(
        new Error(`Native scanner child process error: ${String(error.message)}`),
      );
      reject(error);
    });

    child.once("close", (code, signal) => {
      stdoutLines.close();
      const terminatedByDispose =
        disposed && (signal === "SIGTERM" || signal === "SIGKILL" || code === 0);
      if (code === 0 || terminatedByDispose) {
        resolve();
        return;
      }

      rejectStage(
        new Error(
          `Native scanner closed before stage completed: code=${String(code)} signal=${String(signal)}`,
        ),
      );
      reject(
        new Error(
          `Native scanner exited with code ${String(code)} signal ${String(signal)} stderr: ${stderr.trim()}`,
        ),
      );
    });
  });
  void waitForExit.catch(() => undefined);

  return {
    pid: child.pid ?? -1,
    binaryPath,
    runStage: (request, handlers) => {
      if (activeStage) {
        return Promise.reject(new Error("Native scanner stage already running"));
      }

      const stagePromise = new Promise<void>((resolve, reject) => {
        activeStage = {
          handlers,
          resolve,
          reject,
        };
      });

      const startPayload = {
        type: "start" as const,
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
        softSkipPrefixes: request.softSkipPrefixes,
        skipDirSuffixes: request.skipDirSuffixes,
        blockedPrefixes: request.blockedPrefixes,
      };

      writeJsonLine(startPayload);
      return stagePromise;
    },
    sendControl: (control) => {
      writeJsonLine({ type: control });
    },
    waitForExit: () => waitForExit,
    dispose: () => {
      disposed = true;
      stdoutLines.close();
      terminateChild(child);
    },
  };
}

function parseNativeScannerLine(line: string): NativeScannerMessage | null {
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

  const message = raw as Record<string, unknown>;
  switch (message.type) {
    case "agg":
      if (
        typeof message.path === "string" &&
        typeof message.sizeDelta === "number" &&
        Number.isFinite(message.sizeDelta) &&
        typeof message.countDelta === "number" &&
        Number.isFinite(message.countDelta)
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
        typeof message.scannedCount === "number" &&
        Number.isFinite(message.scannedCount) &&
        typeof message.queuedDirs === "number" &&
        Number.isFinite(message.queuedDirs) &&
        typeof message.elapsedMs === "number" &&
        Number.isFinite(message.elapsedMs)
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
          message.policy === "auto" ||
          message.policy === "manual" ||
          message.policy === "none"
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
          message.confidence === "low" ||
          message.confidence === "medium" ||
          message.confidence === "high"
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

function getPlatformBinaryNames(): string[] {
  if (process.platform === "darwin") {
    return ["scanner-macos", "diskviz-scanner"];
  }

  if (process.platform === "win32") {
    return ["scanner-win.exe", "diskviz-scanner.exe"];
  }

  return ["scanner-linux", "diskviz-scanner"];
}

function terminateChild(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    child.kill();
    return;
  }

  child.kill("SIGTERM");
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }, 500);
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

export function detectCpuHintFromPlatform(): string {
  const cpus = os.cpus()?.length ?? 0;
  if (cpus <= 0) {
    return "unknown";
  }
  if (cpus >= 8) {
    return "parallel-high";
  }
  if (cpus >= 4) {
    return "parallel-medium";
  }
  return "parallel-low";
}
