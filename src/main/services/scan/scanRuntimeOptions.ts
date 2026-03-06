import os from "node:os";
import path from "node:path";
import { resolveScanIntent } from "../../../shared/domain/scanIntent";
import type {
  ScanAccuracyMode,
  ScanConcurrencyPolicy,
  ScanDeepPolicyPreset,
  ScanElevationPolicy,
  ScanMode,
  ScanStartRequest,
} from "../../../types/contracts";
import {
  resolveDeepSkipDirSuffixes,
  resolveDeepSoftSkipPrefixes,
} from "./scanTraversalPolicy";

const BASE_STAT_CONCURRENCY = 32;
const QUICK_PASS_DEPTH = 2;
const QUICK_PASS_TIME_BUDGET_MS = 5000;
const ROOT_QUICK_PASS_DEPTH = 1;
const ROOT_QUICK_PASS_TIME_BUDGET_MS = 3000;
const DEFAULT_NON_ROOT_QUICK_BUDGET_MS = 3000;
const DEFAULT_AGG_BATCH_MAX_ITEMS = 512;
const DEFAULT_AGG_BATCH_MAX_MS = 120;
const DEFAULT_PROGRESS_INTERVAL_MS = 120;
const DEFAULT_CONCURRENCY_MIN = 16;
const DEFAULT_CONCURRENCY_MAX = 64;
const DEEP_SKIP_PACKAGE_MANAGERS_DEFAULT = process.env.SCAN_DEEP_SKIP_PACKAGE_MANAGERS !== "0";
const DEEP_SKIP_CACHE_PREFIXES_DEFAULT = process.env.SCAN_DEEP_SKIP_CACHE_PREFIXES !== "0";
const DEEP_SKIP_BUNDLE_DIRS_DEFAULT = process.env.SCAN_DEEP_SKIP_BUNDLE_DIRS !== "0";

export interface QuickPassConfig {
  depthLimit: number;
  timeBudgetMs: number;
}

export interface ResolvedScanOptions {
  performanceProfile: NonNullable<ScanStartRequest["performanceProfile"]>;
  scanMode: ScanMode;
  accuracyMode: ScanAccuracyMode;
  deepPolicyPreset: ScanDeepPolicyPreset;
  elevationPolicy: ScanElevationPolicy;
  emitPolicy: {
    aggBatchMaxItems: number;
    aggBatchMaxMs: number;
    progressIntervalMs: number;
  };
  concurrencyPolicy: Required<ScanConcurrencyPolicy>;
  allowNodeFallback: boolean;
  deepSkipPackageManagers: boolean;
  deepSkipCachePrefixes: boolean;
  deepSkipBundleDirs: boolean;
  deepSoftSkipPrefixes: string[];
  deepSkipDirSuffixes: string[];
  quickBudgetMs: number;
  statConcurrency: number;
}

export function resolveQuickPassConfig(
  rootPath: string,
  platform: NodeJS.Platform,
  options: ResolvedScanOptions,
): QuickPassConfig {
  const quickBudgetMs = Math.max(500, options.quickBudgetMs);
  if (isFilesystemRoot(rootPath, platform)) {
    return {
      depthLimit: ROOT_QUICK_PASS_DEPTH,
      timeBudgetMs: quickBudgetMs,
    };
  }

  return {
    depthLimit: QUICK_PASS_DEPTH,
    timeBudgetMs: quickBudgetMs,
  };
}

export function resolveScanOptions(
  input: ScanStartRequest,
  normalizedRootPath: string,
): ResolvedScanOptions {
  const isRoot = normalizedRootPath === path.parse(normalizedRootPath).root;
  const scanMode: ScanMode =
    input.scanMode ?? (process.platform === "darwin" ? "native_rust" : "portable");
  const intent = resolveScanIntent({
    performanceProfile: input.performanceProfile,
    accuracyMode: input.accuracyMode,
    deepPolicyPreset: input.deepPolicyPreset,
  });
  const deepPolicyPreset: ScanDeepPolicyPreset = intent.deepPolicyPreset;
  const accuracyMode: ScanAccuracyMode = intent.accuracyMode;
  const performanceProfile = intent.performanceProfile;
  const elevationPolicy: ScanElevationPolicy = input.elevationPolicy ?? "manual";
  const emitPolicy = {
    aggBatchMaxItems: Math.max(
      64,
      Math.min(20_000, input.emitPolicy?.aggBatchMaxItems ?? DEFAULT_AGG_BATCH_MAX_ITEMS),
    ),
    aggBatchMaxMs: Math.max(
      20,
      Math.min(5_000, input.emitPolicy?.aggBatchMaxMs ?? DEFAULT_AGG_BATCH_MAX_MS),
    ),
    progressIntervalMs: Math.max(
      80,
      Math.min(
        5_000,
        input.emitPolicy?.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS,
      ),
    ),
  };
  const concurrencyPolicy = resolveConcurrencyPolicy(input.concurrencyPolicy);
  const allowNodeFallback =
    Boolean(input.allowNodeFallback) || process.env.SCAN_ALLOW_NODE_FALLBACK === "1";
  const deepSkipPackageManagers =
    deepPolicyPreset === "responsive" && DEEP_SKIP_PACKAGE_MANAGERS_DEFAULT;
  const deepSkipCachePrefixes =
    deepPolicyPreset === "responsive" && DEEP_SKIP_CACHE_PREFIXES_DEFAULT;
  const deepSkipBundleDirs =
    deepPolicyPreset === "responsive" && DEEP_SKIP_BUNDLE_DIRS_DEFAULT;
  const deepSoftSkipPrefixes = resolveDeepSoftSkipPrefixes(
    os.platform(),
    os.homedir(),
    deepSkipCachePrefixes,
  );
  const deepSkipDirSuffixes = resolveDeepSkipDirSuffixes(deepSkipBundleDirs);

  const defaultBudget = isRoot
    ? ROOT_QUICK_PASS_TIME_BUDGET_MS
    : DEFAULT_NON_ROOT_QUICK_BUDGET_MS;
  const profileBudget =
    performanceProfile === "accuracy-first"
      ? defaultBudget + 1500
      : Math.min(defaultBudget, QUICK_PASS_TIME_BUDGET_MS);

  return {
    performanceProfile,
    scanMode,
    accuracyMode,
    deepPolicyPreset,
    elevationPolicy,
    emitPolicy,
    concurrencyPolicy,
    allowNodeFallback,
    deepSkipPackageManagers,
    deepSkipCachePrefixes,
    deepSkipBundleDirs,
    deepSoftSkipPrefixes,
    deepSkipDirSuffixes,
    quickBudgetMs: input.quickBudgetMs ?? profileBudget,
    statConcurrency: resolveStatConcurrency(
      performanceProfile,
      isRoot,
      concurrencyPolicy,
    ),
  };
}

export function isFilesystemRoot(
  inputPath: string,
  platform: NodeJS.Platform,
): boolean {
  const resolved = path.resolve(inputPath);
  const normalized = normalizeForCompare(resolved, platform);
  const root = normalizeForCompare(path.parse(resolved).root, platform);
  return normalized === root;
}

function normalizeForCompare(rawPath: string, platform: NodeJS.Platform): string {
  const normalized = rawPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const rootSafe = normalized === "" ? "/" : normalized;
  if (platform === "win32") {
    return rootSafe.toLowerCase();
  }

  return rootSafe;
}

function resolveStatConcurrency(
  profile: ResolvedScanOptions["performanceProfile"],
  isRoot: boolean,
  policy: Required<ScanConcurrencyPolicy>,
): number {
  const min = Math.max(1, policy.min);
  const max = Math.max(min, policy.max);

  if (!policy.adaptive) {
    return max;
  }

  let desired = BASE_STAT_CONCURRENCY;
  if (profile === "preview-first" && isRoot) {
    desired = Math.min(max, desired + 8);
  } else if (profile === "accuracy-first") {
    desired = Math.max(min, desired);
  }

  return Math.max(min, Math.min(max, desired));
}

function resolveConcurrencyPolicy(
  input: ScanStartRequest["concurrencyPolicy"],
): Required<ScanConcurrencyPolicy> {
  const min = Math.max(1, input?.min ?? DEFAULT_CONCURRENCY_MIN);
  const max = Math.max(min, input?.max ?? DEFAULT_CONCURRENCY_MAX);
  const adaptive = input?.adaptive ?? true;

  return { min, max, adaptive };
}
