import { spawn } from "node:child_process";
import path from "node:path";
import { getProtectedPaths } from "../../../shared/domain/pathPolicy";
import type { ScanMode } from "../../../types/contracts";
import type { NativeScanPhaseMode } from "../native/nativeRustScannerClient";
import type { ResolvedScanOptions } from "./scanRuntimeOptions";

const FAST_DIRECTORY_ESTIMATE_TIMEOUT_MS = 1_500;
const HEAVY_DIRECTORY_BASENAMES = new Set([
  "node_modules",
  ".pnpm",
  ".yarn",
  ".cache",
  ".npm",
  ".rustup",
  ".nvm",
  ".rbenv",
  ".pyenv",
  ".asdf",
  ".pnpm-store",
  ".turbo",
  ".nx",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "__pycache__",
  ".venv",
  "venv",
  ".gradle",
  ".m2",
  ".cargo",
  ".terraform",
  "vendor",
  "deps",
  "third_party",
  "build",
  "dist",
  "out",
  "target",
  "SDKs",
  "CommandLineTools",
  "CoreSimulator",
  "gems",
  "site-packages",
  ".git",
  "DerivedData",
  "Caches",
  "Volumes",
  ".Spotlight-V100",
  ".fseventsd",
  "Trash",
  ".Trash",
  "Applications",
  "Library",
  "System",
  "private",
  "cores",
  ".DocumentRevisions-V100",
  ".TemporaryItems",
  ".VolumeIcon.icns",
  ".apdisk",
  ".AppleDouble",
  ".LSOverride",
  ".PKInstallSandboxManager",
  ".PKInstallSandboxManager-SystemSoftware",
  ".Trashes",
]);
const DEEP_PACKAGE_SKIP_BASENAMES = new Set([
  "node_modules",
  ".pnpm",
  ".pnpm-store",
  ".yarn",
  ".npm",
  ".nvm",
  "venv",
  ".venv",
  "site-packages",
  "dist-packages",
  ".pyenv",
  ".rustup",
  ".cargo",
  ".gradle",
  ".m2",
  ".ivy2",
  ".android",
  ".nuget",
  ".cache",
  "__pycache__",
  "caches",
  "deriveddata",
]);
const PACKAGE_DIRECTORY_SUFFIXES = new Set([
  ".app",
  ".framework",
  ".bundle",
  ".plugin",
  ".kext",
  ".prefpane",
  ".xpc",
  ".appex",
]);

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

  const raw = [
    path.join(homeDirectory, "Library", "Caches"),
    "/Library/Caches",
    "/private/var/folders",
    path.join(homeDirectory, ".nvm", "versions"),
    path.join(homeDirectory, ".pyenv", "versions"),
  ];
  if (platform === "win32") {
    raw.push(path.join(homeDirectory, "AppData", "Local"));
    raw.push("C:/Windows/WinSxS");
  }
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
  return [...PACKAGE_DIRECTORY_SUFFIXES];
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
    isRustupDocOrSourcePath(normalizedPath, platform) ||
    isNvmVersionsPath(normalizedPath, platform) ||
    isPyenvVersionsPath(normalizedPath, platform) ||
    isPythonVenvPackagesPath(normalizedPath, platform) ||
    isKakaoTalkChatTagPath(normalizedPath, platform) ||
    isBrowserExtensionsPath(normalizedPath, platform) ||
    isBrowserStoragePath(normalizedPath, platform) ||
    isBrowserWebAppResourcesPath(normalizedPath, platform)
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

export function isRustupDocOrSourcePath(
  normalizedPath: string,
  platform: NodeJS.Platform,
): boolean {
  const candidate = platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  if (!candidate.includes("/.rustup/toolchains/")) {
    return false;
  }
  return candidate.includes("/share/doc/") || candidate.includes("/lib/rustlib/src/");
}

export function isNvmVersionsPath(
  normalizedPath: string,
  platform: NodeJS.Platform,
): boolean {
  const candidate = platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  return candidate.includes("/.nvm/versions/");
}

export function isPyenvVersionsPath(
  normalizedPath: string,
  platform: NodeJS.Platform,
): boolean {
  const candidate = platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  return candidate.includes("/.pyenv/versions/");
}

export function isPythonVenvPackagesPath(
  normalizedPath: string,
  platform: NodeJS.Platform,
): boolean {
  const candidate = platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  const inVenv = candidate.includes("/venv/") || candidate.includes("/.venv/");
  if (!inVenv) {
    return false;
  }
  return candidate.includes("/site-packages/") || candidate.includes("/dist-packages/");
}

export function isBrowserExtensionsPath(
  normalizedPath: string,
  platform: NodeJS.Platform,
): boolean {
  const candidate = platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  const lower = candidate.toLowerCase();
  if (!lower.includes("/extensions/")) {
    return false;
  }

  const browserRoots = [
    "/library/application support/google/chrome/",
    "/library/application support/google/chrome beta/",
    "/library/application support/google/chrome canary/",
    "/library/application support/bravesoftware/brave-browser/",
    "/library/application support/microsoft edge/",
    "/library/application support/vivaldi/",
    "/library/application support/opera",
    "/library/application support/zen/",
    "/library/application support/firefox/",
    "/library/application support/librewolf/",
  ];

  return browserRoots.some((prefix) => lower.includes(prefix));
}

export function isBrowserStoragePath(
  normalizedPath: string,
  platform: NodeJS.Platform,
): boolean {
  const candidate = platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  const lower = candidate.toLowerCase();
  const browserRoots = [
    "/library/application support/google/chrome/",
    "/library/application support/google/chrome beta/",
    "/library/application support/google/chrome canary/",
    "/library/application support/bravesoftware/brave-browser/",
    "/library/application support/microsoft edge/",
    "/library/application support/vivaldi/",
    "/library/application support/opera",
    "/library/application support/zen/",
    "/library/application support/firefox/",
    "/library/application support/librewolf/",
  ];
  const inBrowserRoot = browserRoots.some((prefix) => lower.includes(prefix));
  if (!inBrowserRoot) {
    return false;
  }

  if (lower.includes("/storage/ext/")) {
    return true;
  }
  if (lower.includes("/shared dictionary/cache/")) {
    return true;
  }
  const isProfileStorage =
    lower.includes("/profiles/") &&
    (lower.includes("/storage/default/") ||
      lower.includes("/storage/temporary/") ||
      lower.includes("/storage/permanent/"));
  if (
    isProfileStorage &&
    (lower.includes("/cache/") || lower.includes("/cache2/") || lower.includes("/morgue/"))
  ) {
    return true;
  }

  return false;
}

export function isBrowserWebAppResourcesPath(
  normalizedPath: string,
  platform: NodeJS.Platform,
): boolean {
  const candidate = platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  const lower = candidate.toLowerCase();
  const browserRoots = [
    "/library/application support/google/chrome/",
    "/library/application support/google/chrome beta/",
    "/library/application support/google/chrome canary/",
    "/library/application support/bravesoftware/brave-browser/",
    "/library/application support/microsoft edge/",
    "/library/application support/vivaldi/",
    "/library/application support/opera",
  ];
  const inBrowserRoot = browserRoots.some((prefix) => lower.includes(prefix));
  if (!inBrowserRoot) {
    return false;
  }

  if (lower.includes("/web applications/")) {
    return true;
  }
  if (lower.includes("/manifest resources/")) {
    return true;
  }
  if (lower.includes("/shortcuts menu icons/")) {
    return true;
  }

  return false;
}

export function isKakaoTalkChatTagPath(
  normalizedPath: string,
  platform: NodeJS.Platform,
): boolean {
  const candidate = platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  const lower = candidate.toLowerCase();
  return lower.includes(
    "/library/containers/com.kakao.kakaotalkmac/data/library/application support/com.kakao.kakaotalkmac/",
  ) && lower.includes("/commonresource/mychattag");
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

export function buildNativeBlockedPrefixes(
  platform: NodeJS.Platform,
  homeDirectory: string,
  optInProtected: boolean,
): string[] {
  const policy = getProtectedPaths(platform, homeDirectory);
  const blocked = [...policy.absoluteBlock];
  if (!optInProtected) {
    blocked.push(...policy.optInRequired);
  }

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
