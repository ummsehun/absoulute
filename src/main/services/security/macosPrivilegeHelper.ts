import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveNativeScannerBinary } from "../native/nativeRustScannerClient";

const HELPER_LABEL = "com.spacelens.privilege-helper";
const HELPER_SCRIPT_PATH = "/Library/PrivilegedHelperTools/com.spacelens.helper.sh";
const HELPER_PLIST_PATH = `/Library/LaunchDaemons/${HELPER_LABEL}.plist`;
const FULL_DISK_ACCESS_URI =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

export async function getPrivilegeHelperStatus(): Promise<{
  installed: boolean;
  label: string;
}> {
  if (process.platform !== "darwin") {
    return { installed: false, label: HELPER_LABEL };
  }

  const installed = await filesExist([HELPER_SCRIPT_PATH, HELPER_PLIST_PATH]);
  return { installed, label: HELPER_LABEL };
}

export async function installPrivilegeHelper(): Promise<{ installed: boolean }> {
  if (process.platform !== "darwin") {
    return { installed: false };
  }

  const scannerBinary = resolveNativeScannerBinary();
  if (!scannerBinary) {
    throw new Error("Native scanner binary not found for helper installation");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "space-lens-helper-"));
  const tempScript = path.join(tempDir, "space-lens-helper.sh");
  const tempPlist = path.join(tempDir, `${HELPER_LABEL}.plist`);

  try {
    await fs.writeFile(tempScript, buildHelperScript(scannerBinary), {
      encoding: "utf8",
      mode: 0o755,
    });
    await fs.writeFile(tempPlist, buildLaunchDaemonPlist(), "utf8");

    const shellCommand = [
      `/bin/mkdir -p ${quoteSh("/Library/PrivilegedHelperTools")} ${quoteSh("/Library/LaunchDaemons")}`,
      `/bin/cp ${quoteSh(tempScript)} ${quoteSh(HELPER_SCRIPT_PATH)}`,
      `/usr/sbin/chown root:wheel ${quoteSh(HELPER_SCRIPT_PATH)}`,
      `/bin/chmod 755 ${quoteSh(HELPER_SCRIPT_PATH)}`,
      `/bin/cp ${quoteSh(tempPlist)} ${quoteSh(HELPER_PLIST_PATH)}`,
      `/usr/sbin/chown root:wheel ${quoteSh(HELPER_PLIST_PATH)}`,
      `/bin/chmod 644 ${quoteSh(HELPER_PLIST_PATH)}`,
      `/bin/launchctl bootout system ${quoteSh(HELPER_PLIST_PATH)} >/dev/null 2>&1 || true`,
      `/bin/launchctl bootstrap system ${quoteSh(HELPER_PLIST_PATH)} >/dev/null 2>&1 || true`,
    ].join(" && ");

    await runAdminShell(shellCommand);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  const installed = await filesExist([HELPER_SCRIPT_PATH, HELPER_PLIST_PATH]);
  return { installed };
}

export async function requestElevation(targetPath: string): Promise<{ granted: boolean }> {
  if (process.platform !== "darwin") {
    return { granted: false };
  }

  const normalizedTarget = path.resolve(String(targetPath ?? ""));
  if (isUserLibraryPath(normalizedTarget)) {
    const hasAccess = await hasMacOSLibraryAccess(normalizedTarget);
    if (hasAccess) {
      return { granted: true };
    }

    await openFullDiskAccessSettings();
    return { granted: false };
  }

  const status = await getPrivilegeHelperStatus();
  if (!status.installed) {
    const installed = await installPrivilegeHelper();
    if (!installed.installed) {
      return { granted: false };
    }
  }

  const command = `${quoteSh(HELPER_SCRIPT_PATH)} --probe ${quoteSh(targetPath)}`;
  try {
    await runAdminShell(command);
    return { granted: true };
  } catch {
    return { granted: false };
  }
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

function buildHelperScript(scannerBinary: string): string {
  return `#!/bin/sh
set -eu

SCANNER_BIN=${quoteSh(scannerBinary)}

if [ "$#" -ge 2 ] && [ "$1" = "--probe" ]; then
  TARGET="$2"
  /usr/bin/test -r "$TARGET"
  exit $?
fi

exec "$SCANNER_BIN" "$@"
`;
}

function buildLaunchDaemonPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${HELPER_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${HELPER_SCRIPT_PATH}</string>
      <string>--daemon</string>
    </array>
    <key>RunAtLoad</key>
    <false/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/var/log/space-lens-helper.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/space-lens-helper.log</string>
  </dict>
</plist>
`;
}

async function runAdminShell(shellCommand: string): Promise<void> {
  const appleScript = `do shell script "${escapeForAppleScript(shellCommand)}" with administrator privileges`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn("osascript", ["-e", appleScript], {
      stdio: ["ignore", "pipe", "pipe"],
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
      reject(new Error(`osascript admin command failed: ${stderr.trim()}`));
    });
  });
}

async function filesExist(paths: string[]): Promise<boolean> {
  for (const candidate of paths) {
    try {
      await fs.access(candidate);
    } catch {
      return false;
    }
  }
  return true;
}

function quoteSh(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isUserLibraryPath(inputPath: string): boolean {
  const homeLibrary = normalizePath(path.join(os.homedir(), "Library"));
  const normalizedInput = normalizePath(inputPath);
  return normalizedInput === homeLibrary || normalizedInput.startsWith(`${homeLibrary}/`);
}

function normalizePath(inputPath: string): string {
  const normalized = inputPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

async function hasMacOSLibraryAccess(targetLibraryPath: string): Promise<boolean> {
  const probes = [
    targetLibraryPath,
    path.join(targetLibraryPath, "Mail"),
    path.join(targetLibraryPath, "Messages"),
    path.join(targetLibraryPath, "Safari"),
    path.join(targetLibraryPath, "Calendars"),
  ];

  let observedExistingProbe = false;

  for (const probe of probes) {
    const readable = await checkReadable(probe);
    if (readable === null) {
      continue;
    }
    observedExistingProbe = true;
    if (!readable) {
      return false;
    }
  }

  return observedExistingProbe;
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
