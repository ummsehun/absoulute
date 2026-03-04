import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

export type NativeScanPhaseMode = "quick" | "deep";
export type NativeScanControl = "pause" | "resume" | "cancel";

export interface NativeScannerStartRequest {
  scanId: string;
  root: string;
  mode: NativeScanPhaseMode;
  platform: NodeJS.Platform;
  timeBudgetMs: number;
  maxDepth: number;
  sameDeviceOnly: boolean;
  concurrency: number;
  skipBasenames: string[];
  blockedPrefixes: string[];
}

export interface NativeAggMessage {
  type: "agg";
  path: string;
  sizeDelta: number;
  countDelta: number;
  estimated: boolean;
}

export interface NativeProgressMessage {
  type: "progress";
  scannedCount: number;
  queuedDirs: number;
  elapsedMs: number;
  currentPath?: string;
}

export interface NativeQuickReadyMessage {
  type: "quick_ready";
  elapsedMs: number;
  confidence: "low" | "medium" | "high";
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
  | NativeProgressMessage
  | NativeQuickReadyMessage
  | NativeWarnMessage
  | NativeDoneMessage;

export interface NativeScannerEventHandlers {
  onMessage: (message: NativeScannerMessage) => void;
}

export interface NativeScannerSession {
  readonly pid: number;
  readonly binaryPath: string;
  sendControl: (control: NativeScanControl) => void;
  waitForExit: () => Promise<void>;
  dispose: () => void;
}

export function resolveNativeScannerBinary(): string | null {
  const envPath = process.env.SCAN_NATIVE_BIN;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const binaryNames = getPlatformBinaryNames();
  const buildModes = ["release", "debug"] as const;
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

export function startNativeScannerSession(
  request: NativeScannerStartRequest,
  handlers: NativeScannerEventHandlers,
): NativeScannerSession {
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
    skipBasenames: request.skipBasenames,
    blockedPrefixes: request.blockedPrefixes,
  };
  writeJsonLine(startPayload);

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const stdoutLines = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  stdoutLines.on("line", (line) => {
    const parsed = parseNativeScannerLine(line);
    if (parsed) {
      handlers.onMessage(parsed);
    }
  });

  const waitForExit = new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      stdoutLines.close();
      reject(error);
    });
    child.once("close", (code, signal) => {
      stdoutLines.close();
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Native scanner exited with code ${String(code)} signal ${String(signal)} stderr: ${stderr.trim()}`,
        ),
      );
    });
  });

  return {
    pid: child.pid ?? -1,
    binaryPath,
    sendControl: (control) => {
      writeJsonLine({ type: control });
    },
    waitForExit: () => waitForExit,
    dispose: () => {
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
