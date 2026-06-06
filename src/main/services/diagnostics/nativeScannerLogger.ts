import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type NativeScannerLogLevel = "debug" | "info" | "warn" | "error";

export interface NativeScannerLogEntry {
  event: string;
  level?: NativeScannerLogLevel;
  scanId?: string;
  stage?: string;
  details?: Record<string, unknown>;
}

const LOG_FILE_NAME = "native-scanner.jsonl";
const MAX_DETAIL_LENGTH = 16_384;

export function getNativeScannerLogPath(): string {
  return path.join(resolveNativeScannerLogDir(), LOG_FILE_NAME);
}

export function appendNativeScannerLog(entry: NativeScannerLogEntry): void {
  const logPath = getNativeScannerLogPath();
  const payload = {
    ts: new Date().toISOString(),
    pid: process.pid,
    level: entry.level ?? "info",
    event: entry.event,
    scanId: entry.scanId,
    stage: entry.stage,
    details: truncateDetails(entry.details ?? {}),
  };

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // Logging must never break scanning.
  }
}

function resolveNativeScannerLogDir(): string {
  const envDir = process.env.SCAN_LOG_DIR;
  if (envDir && envDir.trim().length > 0) {
    return path.resolve(envDir);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Logs", "Disk Visualizer");
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData && localAppData.trim().length > 0) {
      return path.join(localAppData, "Disk Visualizer", "Logs");
    }
  }

  const xdgStateHome = process.env.XDG_STATE_HOME;
  if (xdgStateHome && xdgStateHome.trim().length > 0) {
    return path.join(xdgStateHome, "disk-visualizer", "logs");
  }

  return path.join(os.homedir(), ".local", "state", "disk-visualizer", "logs");
}

function truncateDetails(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, truncateValue(value)]),
  );
}

function truncateValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_DETAIL_LENGTH
      ? `${value.slice(0, MAX_DETAIL_LENGTH)}...[truncated]`
      : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(truncateValue);
  }

  if (value && typeof value === "object") {
    return truncateDetails(value as Record<string, unknown>);
  }

  return value;
}
