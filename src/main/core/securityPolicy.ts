import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getProtectedPaths,
  isSameOrChildPolicyPath,
  normalizePolicyPath,
  pathIntersectsPolicyPath,
} from "../../shared/domain/pathPolicy";
import type { AppError } from "../../types/contracts";
import { makeAppError } from "../utils/appError";

export type PermissionState = "not_required" | "granted" | "required";
export type PathBlockedReason = "scan_blocked" | "permission_required";

export interface EffectivePathAccess {
  grantedPermissionRoots: string[];
  deniedPermissionRoots: string[];
  nonRemovableRoots: string[];
  scanBlockedRoots: string[];
}

export interface PathPolicyDecision {
  scanAllowed: boolean;
  removeAllowed: boolean;
  normalizedPath: string;
  permissionState: PermissionState;
  blockedReason?: PathBlockedReason;
  matchedRoot?: string;
  error?: AppError;
  effectiveAccess?: EffectivePathAccess;
}

export interface PathClassifierOptions {
  isResolved?: boolean;
}

export type PathPolicyClassifier = (
  inputPath: string,
  optInProtected: boolean,
  options?: PathClassifierOptions,
) => PathPolicyDecision;

export async function evaluateRootPath(
  inputPath: string,
  _optInProtected: boolean,
): Promise<PathPolicyDecision> {
  void _optInProtected;
  const platform = os.platform();
  const homeDirectory = os.homedir();
  const normalizedInput = await normalizeAndResolvePath(inputPath, platform);
  const effectiveAccess = await resolveEffectivePathAccess(
    normalizedInput,
    platform,
    homeDirectory,
  );

  return classifyNormalizedPath(normalizedInput, effectiveAccess);
}

export function classifyPathByPolicy(
  inputPath: string,
  optInProtected: boolean,
  platform: NodeJS.Platform = os.platform(),
  homeDirectory: string = os.homedir(),
  effectiveAccess?: EffectivePathAccess,
): PathPolicyDecision {
  return createPathPolicyClassifier(
    platform,
    homeDirectory,
    effectiveAccess ??
      buildLegacyEffectivePathAccess(platform, homeDirectory, optInProtected),
  )(
    inputPath,
    optInProtected,
  );
}

export function createPathPolicyClassifier(
  platform: NodeJS.Platform = os.platform(),
  homeDirectory: string = os.homedir(),
  effectiveAccess?: EffectivePathAccess,
): PathPolicyClassifier {
  return (inputPath, optInProtected, options) => {
    const absoluteInput = options?.isResolved ? inputPath : path.resolve(inputPath);
    const normalizedInput = normalizeForComparison(absoluteInput, platform);
    return classifyNormalizedPath(
      normalizedInput,
      effectiveAccess ??
        buildLegacyEffectivePathAccess(platform, homeDirectory, optInProtected),
    );
  };
}

function classifyNormalizedPath(
  normalizedInput: string,
  effectiveAccess: EffectivePathAccess,
): PathPolicyDecision {
  const blockedMatch = findMatch(normalizedInput, effectiveAccess.scanBlockedRoots);
  const nonRemovableMatch = findMatch(normalizedInput, effectiveAccess.nonRemovableRoots);
  const deniedPermissionMatch = findMatch(
    normalizedInput,
    effectiveAccess.deniedPermissionRoots,
  );
  const grantedPermissionMatch = findMatch(
    normalizedInput,
    effectiveAccess.grantedPermissionRoots,
  );

  if (blockedMatch) {
    return {
      scanAllowed: false,
      removeAllowed: false,
      normalizedPath: normalizedInput,
      permissionState: "not_required",
      blockedReason: "scan_blocked",
      matchedRoot: blockedMatch,
      error: makeAppError(
        "E_PROTECTED_PATH",
        "Path is in absolute protected zone",
        true,
        { path: normalizedInput, matched: blockedMatch },
      ),
    };
  }

  if (deniedPermissionMatch && !grantedPermissionMatch) {
    return {
      scanAllowed: false,
      removeAllowed: false,
      normalizedPath: normalizedInput,
      permissionState: "required",
      blockedReason: "permission_required",
      matchedRoot: deniedPermissionMatch,
      error: makeAppError(
        "E_PERMISSION",
        "Path requires system permission",
        true,
        { path: normalizedInput, matched: deniedPermissionMatch },
      ),
    };
  }

  return {
    scanAllowed: true,
    removeAllowed: !nonRemovableMatch,
    normalizedPath: normalizedInput,
    permissionState: grantedPermissionMatch ? "granted" : "not_required",
    matchedRoot: nonRemovableMatch ?? grantedPermissionMatch,
    effectiveAccess,
  };
}

export async function resolveEffectivePathAccess(
  normalizedRootPath: string,
  platform: NodeJS.Platform = os.platform(),
  homeDirectory: string = os.homedir(),
): Promise<EffectivePathAccess> {
  const policy = getProtectedPaths(platform, homeDirectory);
  const scanBlockedRoots = policy.scanBlocked.map((item) =>
    normalizeForComparison(item, platform),
  );
  const nonRemovableRoots = policy.nonRemovable.map((item) =>
    normalizeForComparison(item, platform),
  );
  const permissionRoots = policy.scanRequiresPermission
    .map((item) => normalizeForComparison(item, platform))
    .filter((permissionRoot) =>
      pathIntersectsPolicyPath(normalizedRootPath, permissionRoot),
    );

  const grantedPermissionRoots: string[] = [];
  const deniedPermissionRoots: string[] = [];

  for (const permissionRoot of permissionRoots) {
    const probeTarget = isSameOrChildPath(normalizedRootPath, permissionRoot)
      ? normalizedRootPath
      : permissionRoot;
    const readable = await checkReadable(probeTarget);
    if (readable) {
      grantedPermissionRoots.push(permissionRoot);
      continue;
    }

    deniedPermissionRoots.push(permissionRoot);
  }

  return {
    grantedPermissionRoots,
    deniedPermissionRoots,
    nonRemovableRoots,
    scanBlockedRoots,
  };
}

function buildLegacyEffectivePathAccess(
  platform: NodeJS.Platform,
  homeDirectory: string,
  optInProtected: boolean,
): EffectivePathAccess {
  const policy = getProtectedPaths(platform, homeDirectory);
  return {
    grantedPermissionRoots: optInProtected
      ? policy.scanRequiresPermission.map((item) => normalizeForComparison(item, platform))
      : [],
    deniedPermissionRoots: optInProtected
      ? []
      : policy.scanRequiresPermission.map((item) => normalizeForComparison(item, platform)),
    nonRemovableRoots: policy.nonRemovable.map((item) =>
      normalizeForComparison(item, platform),
    ),
    scanBlockedRoots: policy.scanBlocked.map((item) =>
      normalizeForComparison(item, platform),
    ),
  };
}

async function normalizeAndResolvePath(
  inputPath: string,
  platform: NodeJS.Platform,
): Promise<string> {
  const absolute = path.resolve(inputPath);

  const resolved = await fs.realpath(absolute).catch(() => absolute);
  return normalizeForComparison(resolved, platform);
}

function findMatch(
  candidatePath: string,
  normalizedCandidates: string[],
): string | undefined {
  for (const normalizedItem of normalizedCandidates) {
    if (isSameOrChildPath(candidatePath, normalizedItem)) {
      return normalizedItem;
    }
  }

  return undefined;
}

function normalizeForComparison(rawPath: string, platform: NodeJS.Platform): string {
  return normalizePolicyPath(rawPath, platform);
}

function isSameOrChildPath(candidate: string, base: string): boolean {
  return isSameOrChildPolicyPath(candidate, base);
}

async function checkReadable(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
