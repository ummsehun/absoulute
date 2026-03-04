import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getProtectedPaths } from "../../shared/platform/protectedPaths";
import type { AppError } from "../../types/contracts";
import { makeAppError } from "../utils/appError";

export interface PathPolicyDecision {
  allowed: boolean;
  normalizedPath: string;
  requiresOptIn: boolean;
  error?: AppError;
}

export async function evaluateRootPath(
  inputPath: string,
  optInProtected: boolean,
): Promise<PathPolicyDecision> {
  const platform = os.platform();
  const homeDirectory = os.homedir();
  const policy = getProtectedPaths(platform, homeDirectory);
  const normalizedInput = await normalizeAndResolvePath(inputPath, platform);

  return classifyNormalizedPath(normalizedInput, optInProtected, platform, policy);
}

export function classifyPathByPolicy(
  inputPath: string,
  optInProtected: boolean,
  platform: NodeJS.Platform = os.platform(),
  homeDirectory: string = os.homedir(),
): PathPolicyDecision {
  const policy = getProtectedPaths(platform, homeDirectory);
  const normalizedInput = normalizeForComparison(path.resolve(inputPath), platform);

  return classifyNormalizedPath(normalizedInput, optInProtected, platform, policy);
}

function classifyNormalizedPath(
  normalizedInput: string,
  optInProtected: boolean,
  platform: NodeJS.Platform,
  policy: ReturnType<typeof getProtectedPaths>,
): PathPolicyDecision {
  const absoluteMatch = findMatch(normalizedInput, policy.absoluteBlock, platform);
  if (absoluteMatch) {
    return {
      allowed: false,
      normalizedPath: normalizedInput,
      requiresOptIn: false,
      error: makeAppError(
        "E_PROTECTED_PATH",
        "Path is in absolute protected zone",
        true,
        { path: normalizedInput, matched: absoluteMatch },
      ),
    };
  }

  const optInMatch = findMatch(normalizedInput, policy.optInRequired, platform);
  if (optInMatch && !optInProtected) {
    return {
      allowed: false,
      normalizedPath: normalizedInput,
      requiresOptIn: true,
      error: makeAppError(
        "E_OPTIN_REQUIRED",
        "Path requires explicit opt-in",
        true,
        { path: normalizedInput, matched: optInMatch },
      ),
    };
  }

  return {
    allowed: true,
    normalizedPath: normalizedInput,
    requiresOptIn: Boolean(optInMatch),
  };
}

async function normalizeAndResolvePath(
  inputPath: string,
  platform: NodeJS.Platform,
): Promise<string> {
  const absolute = path.resolve(inputPath);

  let resolved = absolute;
  try {
    resolved = await fs.realpath(absolute);
  } catch {
    resolved = absolute;
  }

  return normalizeForComparison(resolved, platform);
}

function findMatch(
  candidatePath: string,
  candidates: string[],
  platform: NodeJS.Platform,
): string | undefined {
  for (const item of candidates) {
    const normalizedItem = normalizeForComparison(item, platform);
    if (isSameOrChildPath(candidatePath, normalizedItem)) {
      return normalizedItem;
    }
  }

  return undefined;
}

function normalizeForComparison(rawPath: string, platform: NodeJS.Platform): string {
  const slashNormalized = rawPath.replace(/\\/g, "/");
  const trimmed = slashNormalized.replace(/\/+$/, "");
  const rootSafe = trimmed === "" ? "/" : trimmed;

  if (platform === "win32") {
    return rootSafe.toLowerCase();
  }

  return rootSafe;
}

function isSameOrChildPath(candidate: string, base: string): boolean {
  return candidate === base || candidate.startsWith(`${base}/`);
}
