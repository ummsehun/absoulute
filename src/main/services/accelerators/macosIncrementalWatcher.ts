import fs from "node:fs";
import path from "node:path";
import type { ScanMode } from "../../../types/contracts";

export interface IncrementalChange {
  changedPath: string;
  eventType: "rename" | "change";
  at: number;
}

export interface IncrementalWatcherHandle {
  close: () => void;
}

export function createMacOSIncrementalWatcher(
  rootPath: string,
  scanMode: ScanMode,
  onChange: (change: IncrementalChange) => void,
): IncrementalWatcherHandle | null {
  if (process.platform !== "darwin") {
    return null;
  }

  if (scanMode !== "portable_plus_os_accel") {
    return null;
  }

  try {
    const watcher = fs.watch(
      rootPath,
      { recursive: true, persistent: false },
      (eventType, filename) => {
        const changedPath = normalizeWatchPath(rootPath, filename);
        if (!changedPath) {
          return;
        }

        onChange({
          changedPath,
          eventType,
          at: Date.now(),
        });
      },
    );

    return {
      close: () => watcher.close(),
    };
  } catch {
    return null;
  }
}

function normalizeWatchPath(rootPath: string, filename: string | Buffer | null): string | null {
  if (!filename || filename.length === 0) {
    return rootPath;
  }

  const asString = typeof filename === "string" ? filename : filename.toString("utf8");
  if (!asString) {
    return rootPath;
  }

  if (path.isAbsolute(asString)) {
    return asString;
  }

  return path.join(rootPath, asString);
}
