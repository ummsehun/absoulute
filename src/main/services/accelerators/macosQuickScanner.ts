import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { ScanMode } from "../../../types/contracts";

const MACOS_ROOT_PRIORITY = [
  "/Users",
  "/Volumes",
  "/Applications",
  "/Library",
  "/System",
  "/private",
] as const;

export async function buildMacOSQuickQueue(
  rootPath: string,
  scanMode: ScanMode,
): Promise<string[] | null> {
  if (process.platform !== "darwin") {
    return null;
  }

  if (rootPath !== "/") {
    return null;
  }

  if (scanMode !== "portable_plus_os_accel") {
    return null;
  }

  const helperQueue = tryNativeQuickHelper(rootPath);
  if (helperQueue && helperQueue.length > 0) {
    return helperQueue;
  }

  const discovered: string[] = [];
  const dir = await fs.opendir(rootPath, { bufferSize: 128 });
  for await (const entry of dir) {
    if (!entry.isDirectory()) {
      continue;
    }
    discovered.push(path.join(rootPath, entry.name));
  }

  const seen = new Set<string>();
  const prioritized: string[] = [];

  for (const preferred of MACOS_ROOT_PRIORITY) {
    if (discovered.includes(preferred)) {
      prioritized.push(preferred);
      seen.add(preferred);
    }
  }

  for (const candidate of discovered.sort((a, b) => a.localeCompare(b))) {
    if (seen.has(candidate)) {
      continue;
    }
    prioritized.push(candidate);
  }

  return prioritized;
}

function tryNativeQuickHelper(rootPath: string): string[] | null {
  const helperPath = process.env.MACOS_QUICK_HELPER_BIN;
  if (!helperPath) {
    return null;
  }

  const result = spawnSync(helperPath, [rootPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 1500,
  });

  if (result.status !== 0 || !result.stdout) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}
