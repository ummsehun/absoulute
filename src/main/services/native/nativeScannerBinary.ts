import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ResolveNativeScannerBinaryPathInput {
  cwd: string;
  envPath?: string;
  exists: (candidate: string) => boolean;
  nodeEnv?: string;
  platform: NodeJS.Platform;
  resourcesPath: string | null;
}

export function resolveNativeScannerBinaryPath(
  input: ResolveNativeScannerBinaryPathInput,
): string | null {
  if (input.envPath && input.exists(input.envPath)) {
    return input.envPath;
  }

  const binaryNames = getPlatformBinaryNames(input.platform);
  const preferReleaseFirst = input.nodeEnv === "production";
  const buildModes = preferReleaseFirst
    ? (["release", "debug"] as const)
    : (["debug", "release"] as const);
  for (const mode of buildModes) {
    for (const binaryName of binaryNames) {
      const devCandidate = path.resolve(
        input.cwd,
        "native",
        "scanner",
        "target",
        mode,
        binaryName,
      );
      if (input.exists(devCandidate)) {
        return devCandidate;
      }
    }
  }

  if (input.resourcesPath) {
    for (const binaryName of binaryNames) {
      const bundledCandidate = path.resolve(input.resourcesPath, "bin", binaryName);
      if (input.exists(bundledCandidate)) {
        return bundledCandidate;
      }
    }
  }

  return null;
}

export function resolveNativeScannerBinary(): string | null {
  return resolveNativeScannerBinaryPath({
    cwd: process.cwd(),
    envPath: process.env.SCAN_NATIVE_BIN,
    exists: fs.existsSync,
    nodeEnv: process.env.NODE_ENV,
    platform: process.platform,
    resourcesPath:
      typeof process.resourcesPath === "string" ? process.resourcesPath : null,
  });
}

export function detectCpuHint(cpuCount: number): string {
  if (cpuCount <= 0) {
    return "unknown";
  }
  if (cpuCount >= 8) {
    return "parallel-high";
  }
  if (cpuCount >= 4) {
    return "parallel-medium";
  }
  return "parallel-low";
}

export function detectCpuHintFromPlatform(): string {
  return detectCpuHint(os.cpus()?.length ?? 0);
}

function getPlatformBinaryNames(platform: NodeJS.Platform): string[] {
  if (platform === "darwin") {
    return ["scanner-macos", "diskviz-scanner"];
  }

  if (platform === "win32") {
    return ["scanner-win.exe", "diskviz-scanner.exe"];
  }

  return ["scanner-linux", "diskviz-scanner"];
}
