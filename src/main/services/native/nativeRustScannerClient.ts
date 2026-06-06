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
import {
  appendNativeScannerLog,
  getNativeScannerLogPath,
} from "../diagnostics/nativeScannerLogger";

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
  softSkipPathRules: NativeSoftSkipPathRule[];
  softSkipPrefixes: string[];
  skipDirSuffixes: string[];
  blockedPrefixes: string[];
  permissionPrefixes: string[];
}

export interface NativeSoftSkipPathRule {
  all: readonly string[];
  any?: readonly string[];
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
  skippedByScope: number;
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
  policySkipSamples?: string[];
  permissionSamples?: string[];
  scopeSkipSamples?: string[];
  budgetDeferredSamples?: string[];
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
  scanId: string;
  stage: NativeScanPhaseMode;
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
    appendNativeScannerLog({
      event: "native_binary_missing",
      level: "error",
      details: {
        cwd: process.cwd(),
        scanNativeBin: process.env.SCAN_NATIVE_BIN,
      },
    });
    throw new Error("Native scanner binary not found");
  }

  const child = spawn(binaryPath, [], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  appendNativeScannerLog({
    event: "native_process_spawned",
    details: {
      binaryPath,
      childPid: child.pid ?? -1,
      logPath: getNativeScannerLogPath(),
    },
  });

  const writeJsonLine = (payload: unknown): void => {
    if (!child.stdin.writable) {
      appendNativeScannerLog({
        event: "native_stdin_not_writable",
        level: "warn",
        details: {
          childPid: child.pid ?? -1,
          payloadType: getPayloadType(payload),
        },
      });
      return;
    }
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  };

  let stderr = "";
  let disposed = false;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    appendNativeScannerLog({
      event: "native_stderr",
      level: "warn",
      details: {
        childPid: child.pid ?? -1,
        chunk,
      },
    });
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
    if (!parsed) {
      appendNativeScannerLog({
        event: "native_stdout_unparsed",
        level: "warn",
        details: {
          childPid: child.pid ?? -1,
          line,
        },
      });
      return;
    }

    if (!activeStage) {
      appendNativeScannerLog({
        event: "native_stdout_without_active_stage",
        level: "warn",
        details: {
          childPid: child.pid ?? -1,
          message: summarizeNativeMessage(parsed),
        },
      });
      return;
    }

    logNativeMessage(parsed, child.pid ?? -1, activeStage.scanId, activeStage.stage);
    activeStage.handlers.onMessage(parsed);
    if (parsed.type === "done") {
      resolveStage();
    }
  });

  const waitForExit = new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      stdoutLines.close();
      appendNativeScannerLog({
        event: "native_process_error",
        level: "error",
        details: {
          childPid: child.pid ?? -1,
          message: error.message,
          stack: error.stack,
        },
      });
      rejectStage(
        new Error(`Native scanner child process error: ${String(error.message)}`),
      );
      reject(error);
    });

    child.once("close", (code, signal) => {
      stdoutLines.close();
      appendNativeScannerLog({
        event: "native_process_closed",
        level: code === 0 || disposed ? "info" : "error",
        details: {
          childPid: child.pid ?? -1,
          code,
          signal,
          disposed,
          stderrTail: stderr.slice(-MAX_STDERR_TAIL),
        },
      });
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
        appendNativeScannerLog({
          event: "native_stage_rejected_already_running",
          level: "error",
          scanId: request.scanId,
          stage: request.mode,
          details: {
            childPid: child.pid ?? -1,
          },
        });
        return Promise.reject(new Error("Native scanner stage already running"));
      }

      const stagePromise = new Promise<void>((resolve, reject) => {
        activeStage = {
          handlers,
          resolve,
          reject,
          scanId: request.scanId,
          stage: request.mode,
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
        softSkipPathRules: request.softSkipPathRules,
        softSkipPrefixes: request.softSkipPrefixes,
        skipDirSuffixes: request.skipDirSuffixes,
        blockedPrefixes: request.blockedPrefixes,
        permissionPrefixes: request.permissionPrefixes,
      };

      appendNativeScannerLog({
        event: "native_stage_start",
        scanId: request.scanId,
        stage: request.mode,
        details: {
          childPid: child.pid ?? -1,
          request: summarizeStartRequest(request),
        },
      });
      writeJsonLine(startPayload);
      return stagePromise;
    },
    sendControl: (control) => {
      appendNativeScannerLog({
        event: "native_control_sent",
        details: {
          childPid: child.pid ?? -1,
          control,
        },
      });
      writeJsonLine({ type: control });
    },
    waitForExit: () => waitForExit,
    dispose: () => {
      disposed = true;
      stdoutLines.close();
      appendNativeScannerLog({
        event: "native_process_dispose",
        details: {
          childPid: child.pid ?? -1,
        },
      });
      terminateChild(child);
    },
  };
}

const MAX_STDERR_TAIL = 24_000;

function summarizeStartRequest(
  request: NativeScannerStartRequest,
): Record<string, unknown> {
  return {
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
    skipBasenamesCount: request.skipBasenames.length,
    skipBasenamesSample: request.skipBasenames.slice(0, 20),
    softSkipPathRulesCount: request.softSkipPathRules.length,
    softSkipPathRulesSample: request.softSkipPathRules.slice(0, 10),
    softSkipPrefixesCount: request.softSkipPrefixes.length,
    softSkipPrefixesSample: request.softSkipPrefixes.slice(0, 20),
    skipDirSuffixesCount: request.skipDirSuffixes.length,
    skipDirSuffixesSample: request.skipDirSuffixes.slice(0, 20),
    blockedPrefixesCount: request.blockedPrefixes.length,
    blockedPrefixesSample: request.blockedPrefixes.slice(0, 20),
    permissionPrefixesCount: request.permissionPrefixes.length,
    permissionPrefixesSample: request.permissionPrefixes.slice(0, 20),
  };
}

function logNativeMessage(
  message: NativeScannerMessage,
  childPid: number,
  scanId: string,
  stage: NativeScanPhaseMode,
): void {
  if (message.type === "agg" || message.type === "agg_batch" || message.type === "progress") {
    return;
  }

  appendNativeScannerLog({
    event: `native_message_${message.type}`,
    level: message.type === "warn" ? "warn" : "debug",
    scanId,
    stage,
    details: {
      childPid,
      message: summarizeNativeMessage(message),
    },
  });
}

function summarizeNativeMessage(message: NativeScannerMessage): Record<string, unknown> {
  if (message.type === "agg_batch") {
    return {
      type: message.type,
      items: message.items.length,
    };
  }

  return { ...message };
}

function getPayloadType(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const type = (payload as { type?: unknown }).type;
    return typeof type === "string" ? type : "object";
  }

  return typeof payload;
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
