import path from "node:path";

export type PathGateCode = "E_PROTECTED_PATH" | "E_PERMISSION";

export interface ProtectedPathPolicy {
  scanBlocked: string[];
  scanRequiresPermission: string[];
  nonRemovable: string[];
  defaultAllowRoots: string[];
  fullDiskAccessRequired: string[];
}

export function getProtectedPaths(
  platform: NodeJS.Platform,
  homeDirectory: string,
): ProtectedPathPolicy {
  if (platform === "win32") {
    return {
      scanBlocked: ["C:/System Volume Information"],
      scanRequiresPermission: ["C:/Program Files", "C:/Program Files (x86)"],
      nonRemovable: ["C:/Windows"],
      defaultAllowRoots: [homeDirectory],
      fullDiskAccessRequired: ["C:/Program Files", "C:/Program Files (x86)"],
    };
  }

  return {
    scanBlocked: ["/dev", "/net"],
    scanRequiresPermission: [
      `${homeDirectory}/Desktop`,
      `${homeDirectory}/Documents`,
      `${homeDirectory}/Downloads`,
      `${homeDirectory}/Library`,
    ],
    nonRemovable: [
      "/System",
      "/bin",
      "/sbin",
      "/usr/bin",
      "/usr/sbin",
    ],
    defaultAllowRoots: [homeDirectory, "/Applications", "/Library", "/private", "/Volumes"],
    fullDiskAccessRequired: [
      `${homeDirectory}/Desktop`,
      `${homeDirectory}/Documents`,
      `${homeDirectory}/Downloads`,
      `${homeDirectory}/Library`,
      "/Library",
      "/private/var/folders",
    ],
  };
}

export function normalizePolicyPath(
  inputPath: string,
  platform: NodeJS.Platform,
): string {
  const slashNormalized = inputPath.replace(/\\/g, "/");
  const trimmed = slashNormalized.replace(/\/+$/, "");
  const rootSafe = trimmed === "" ? "/" : trimmed;
  return platform === "win32" ? rootSafe.toLowerCase() : rootSafe;
}

export function isSameOrChildPolicyPath(candidate: string, base: string): boolean {
  return candidate === base || candidate.startsWith(`${base}/`);
}

export function resolvePolicyRoots(
  roots: string[],
  platform: NodeJS.Platform,
): string[] {
  const unique = new Set<string>();
  for (const root of roots) {
    unique.add(normalizePolicyPath(path.resolve(root), platform));
  }
  return [...unique].sort((left, right) => right.length - left.length);
}

export function requiresFullDiskAccess(
  inputPath: string,
  platform: NodeJS.Platform,
  homeDirectory: string,
): boolean {
  const policy = getProtectedPaths(platform, homeDirectory);
  const candidate = normalizePolicyPath(path.resolve(inputPath), platform);
  const roots = resolvePolicyRoots(policy.fullDiskAccessRequired, platform);
  return roots.some((root) => isSameOrChildPolicyPath(candidate, root));
}

export function pathIntersectsPolicyPath(candidate: string, base: string): boolean {
  return (
    isSameOrChildPolicyPath(candidate, base) ||
    isSameOrChildPolicyPath(base, candidate)
  );
}
