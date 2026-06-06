import { spawn } from "node:child_process";
import path from "node:path";
import { getProtectedPaths } from "../../../shared/domain/pathPolicy";
import {
  getScanTraversalContract,
  matchesSoftSkipPathRules,
  resolveDeepSoftSkipPolicyPrefixes,
  type ScanSoftSkipPathRule,
} from "../../../shared/domain/scanPolicyContract";
import type { ScanMode } from "../../../types/contracts";
import type { NativeScanPhaseMode } from "../native/nativeRustScannerClient";
import type { ResolvedScanOptions } from "./scanRuntimeOptions";

const FAST_DIRECTORY_ESTIMATE_TIMEOUT_MS = 1_500;
const SCAN_TRAVERSAL_CONTRACT = getScanTraversalContract();
const HEAVY_DIRECTORY_BASENAMES = new Set(
  SCAN_TRAVERSAL_CONTRACT.heavyDirectoryBasenames,
);
const DEEP_PACKAGE_SKIP_BASENAMES = new Set(
  SCAN_TRAVERSAL_CONTRACT.deepPackageSkipBasenames,
);

export function normalizeForCompare(
  rawPath: string,
  platform: NodeJS.Platform,
): string {
  const normalized = rawPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const rootSafe = normalized === "" ? "/" : normalized;
  if (platform === "win32") {
    return rootSafe.toLowerCase();
  }

  return rootSafe;
}

export function normalizeForNativePrefix(
  rawPath: string,
  platform: NodeJS.Platform,
): string {
  const normalized = rawPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const rootSafe = normalized === "" ? "/" : normalized;
  if (platform === "win32") {
    return rootSafe.toLowerCase();
  }

  return rootSafe;
}

export function resolveNativeSkipBasenames(
  options: ResolvedScanOptions,
  mode: NativeScanPhaseMode,
): string[] {
  if (mode === "quick") {
    return [...HEAVY_DIRECTORY_BASENAMES];
  }
  if (options.deepPolicyPreset !== "responsive") {
    return [];
  }
  if (options.deepSkipPackageManagers) {
    return [...DEEP_PACKAGE_SKIP_BASENAMES];
  }
  return [];
}

export function resolveNativeSoftSkipPrefixes(
  options: ResolvedScanOptions,
  mode: NativeScanPhaseMode,
  platform: NodeJS.Platform,
): string[] {
  if (
    mode !== "deep" ||
    options.deepPolicyPreset !== "responsive" ||
    !options.deepSkipCachePrefixes
  ) {
    return [];
  }

  const unique = new Set<string>();
  for (const normalized of options.deepSoftSkipPrefixes) {
    const nativeNormalized = normalizeForNativePrefix(normalized, platform);
    unique.add(nativeNormalized);
  }

  return [...unique].sort((left, right) => right.length - left.length);
}

export function resolveNativeSkipDirSuffixes(
  options: ResolvedScanOptions,
  mode: NativeScanPhaseMode,
): string[] {
  if (
    mode !== "deep" ||
    options.deepPolicyPreset !== "responsive" ||
    !options.deepSkipBundleDirs
  ) {
    return [];
  }

  return [...options.deepSkipDirSuffixes];
}

export function resolveDeepSoftSkipPrefixes(
  platform: NodeJS.Platform,
  homeDirectory: string,
  enabled: boolean,
): string[] {
  if (!enabled) {
    return [];
  }

  const raw = resolveDeepSoftSkipPolicyPrefixes(platform, homeDirectory, enabled);
  const unique = new Set<string>();
  for (const item of raw) {
    unique.add(normalizeForCompare(path.resolve(item), platform));
  }
  return [...unique].sort((left, right) => right.length - left.length);
}

export function resolveDeepSkipDirSuffixes(enabled: boolean): string[] {
  if (!enabled) {
    return [];
  }
  return [...SCAN_TRAVERSAL_CONTRACT.bundleDirectorySuffixes];
}

export function shouldEstimateDirectory(
  options: Pick<ResolvedScanOptions, "performanceProfile" | "scanMode">,
  dirPath: string,
  estimatedDirectories: ReadonlySet<string>,
): boolean {
  if (options.performanceProfile === "accuracy-first") {
    return false;
  }

  if (!isHeavyTraversalDirectory(dirPath)) {
    return false;
  }

  if (estimatedDirectories.has(dirPath)) {
    return false;
  }

  return options.scanMode === "portable_plus_os_accel";
}

export function shouldSkipDeepPackageTraversal(input: {
  options: ResolvedScanOptions;
  rootPath: string;
  dirPath: string;
  platform: NodeJS.Platform;
  skippedDirectories: ReadonlySet<string>;
}): boolean {
  const { dirPath, options, platform, rootPath, skippedDirectories } = input;
  if (options.deepPolicyPreset !== "responsive") {
    return false;
  }
  const normalizedPath = normalizeForCompare(path.resolve(dirPath), platform);
  const normalizedRoot = normalizeForCompare(path.resolve(rootPath), platform);
  if (normalizedPath === normalizedRoot) {
    return false;
  }
  if (skippedDirectories.has(dirPath)) {
    return false;
  }

  if (options.deepSkipPackageManagers && isDeepPackageSkipDirectory(dirPath)) {
    return true;
  }

  if (
    options.deepSkipBundleDirs &&
    hasSkippedDirectorySuffix(dirPath, options.deepSkipDirSuffixes)
  ) {
    return true;
  }

  if (
    options.deepSkipCachePrefixes &&
    pathMatchesAnyPrefix(normalizedPath, options.deepSoftSkipPrefixes)
  ) {
    return true;
  }
  if (
    matchesSoftSkipPathRules(normalizedPath, SCAN_TRAVERSAL_CONTRACT.softSkipPathRules)
  ) {
    return true;
  }

  return false;
}

export function shouldSkipHeavyTraversal(
  options: Pick<ResolvedScanOptions, "performanceProfile">,
  dirPath: string,
  skippedDirectories: ReadonlySet<string>,
): boolean {
  if (options.performanceProfile !== "preview-first") {
    return false;
  }

  if (!isHeavyTraversalDirectory(dirPath)) {
    return false;
  }

  return !skippedDirectories.has(dirPath);
}

export function isDeepPackageSkipDirectory(dirPath: string): boolean {
  return DEEP_PACKAGE_SKIP_BASENAMES.has(path.basename(dirPath).toLowerCase());
}

export function hasSkippedDirectorySuffix(
  dirPath: string,
  suffixes: string[],
): boolean {
  if (suffixes.length === 0) {
    return false;
  }
  const basename = path.basename(dirPath).toLowerCase();
  for (const suffix of suffixes) {
    if (basename.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

export function pathMatchesAnyPrefix(
  candidate: string,
  prefixes: string[],
): boolean {
  for (const prefix of prefixes) {
    if (candidate === prefix || candidate.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

export function isKakaoTalkChatTagPath(normalizedPath: string): boolean {
  return matchesSoftSkipPathRules(normalizedPath, SCAN_TRAVERSAL_CONTRACT.softSkipPathRules);
}

export function isHeavyTraversalDirectory(dirPath: string): boolean {
  const normalized = dirPath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  for (const segment of segments) {
    if (HEAVY_DIRECTORY_BASENAMES.has(segment)) {
      return true;
    }
  }

  return false;
}

export function resolveNativeSoftSkipPathRules(
  options: ResolvedScanOptions,
  mode: NativeScanPhaseMode,
): ScanSoftSkipPathRule[] {
  if (mode !== "deep" || options.deepPolicyPreset !== "responsive") {
    return [];
  }
  return SCAN_TRAVERSAL_CONTRACT.softSkipPathRules.map((rule) => ({
    all: [...rule.all],
    any: rule.any ? [...rule.any] : undefined,
  }));
}

export function buildNativeBlockedPrefixes(
  platform: NodeJS.Platform,
  homeDirectory: string,
): string[] {
  const policy = getProtectedPaths(platform, homeDirectory);
  const blocked = [...policy.scanBlocked];
  const unique = new Set<string>();
  for (const raw of blocked) {
    const resolved = path.resolve(raw);
    const normalized = normalizeForNativePrefix(resolved, platform);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique].sort((left, right) => right.length - left.length);
}

export function buildNativePermissionDeniedPrefixes(
  platform: NodeJS.Platform,
  deniedPermissionRoots: string[],
): string[] {
  const unique = new Set<string>();
  for (const raw of deniedPermissionRoots) {
    const resolved = path.resolve(raw);
    const normalized = normalizeForNativePrefix(resolved, platform);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique].sort((left, right) => right.length - left.length);
}

export async function estimateDirectorySizeFast(
  dirPath: string,
  scanMode: ScanMode,
  timeoutMs = FAST_DIRECTORY_ESTIMATE_TIMEOUT_MS,
): Promise<number | null> {
  if (scanMode !== "portable_plus_os_accel") {
    return null;
  }

  if (process.platform === "win32") {
    return null;
  }

  return new Promise((resolve) => {
    const child = spawn("du", ["-sk", dirPath], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }

      const token = output.trim().split(/\s+/)[0];
      const kib = Number.parseInt(token, 10);
      if (!Number.isFinite(kib) || Number.isNaN(kib) || kib <= 0) {
        resolve(null);
        return;
      }

      resolve(kib * 1024);
    });
  });
}
