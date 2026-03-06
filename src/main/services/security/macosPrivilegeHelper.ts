import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { requiresFullDiskAccess } from "../../../shared/domain/pathPolicy";

const FULL_DISK_ACCESS_URI =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

export async function requestElevation(targetPath: string): Promise<{ granted: boolean }> {
  if (process.platform !== "darwin") {
    return { granted: false };
  }

  const normalizedTarget = path.resolve(String(targetPath ?? ""));
  const readable = await checkReadable(normalizedTarget);
  if (readable) {
    return { granted: true };
  }

  if (requiresFullDiskAccess(normalizedTarget, process.platform, os.homedir())) {
    await openFullDiskAccessSettings();
  }

  return { granted: false };
}

export async function openFullDiskAccessSettings(): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("open", [FULL_DISK_ACCESS_URI], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`failed to open Full Disk Access settings: ${stderr.trim()}`));
    });
  });
}

async function checkReadable(targetPath: string): Promise<boolean | null> {
  try {
    await fs.access(targetPath, fsConstants.R_OK);
    return true;
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as NodeJS.ErrnoException).code)
        : "UNKNOWN";
    if (code === "ENOENT" || code === "ENOTDIR") {
      return null;
    }
    if (code === "EACCES" || code === "EPERM") {
      return false;
    }
    return false;
  }
}
