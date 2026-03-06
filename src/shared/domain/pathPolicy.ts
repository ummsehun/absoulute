import path from "node:path";

export type PathGateCode = "E_PROTECTED_PATH" | "E_OPTIN_REQUIRED";

export interface ProtectedPathPolicy {
  absoluteBlock: string[];
  optInRequired: string[];
  defaultAllowRoots: string[];
  fullDiskAccessRequired: string[];
}

export function getProtectedPaths(
  platform: NodeJS.Platform,
  homeDirectory: string,
): ProtectedPathPolicy {
  if (platform === "win32") {
    return {
      absoluteBlock: ["C:/Windows"],
      optInRequired: ["C:/Program Files", "C:/Program Files (x86)"],
      defaultAllowRoots: [homeDirectory],
      fullDiskAccessRequired: ["C:/Program Files", "C:/Program Files (x86)"],
    };
  }

  return {
    absoluteBlock: ["/System", "/bin", "/sbin", "/usr/bin", "/usr/sbin"],
    optInRequired: [
      `${homeDirectory}/Desktop`,
      `${homeDirectory}/Documents`,
      `${homeDirectory}/Downloads`,
      `${homeDirectory}/Library/Mail`,
      `${homeDirectory}/Library/Messages`,
      `${homeDirectory}/Library/Safari`,
      `${homeDirectory}/Library/Calendars`,
      `${homeDirectory}/Library/Application Support/AddressBook`,
      `${homeDirectory}/Library/Application Support/CallHistoryDB`,
      `${homeDirectory}/Library/Application Support/com.apple.TCC`,
      `${homeDirectory}/Library/Application Support/MobileSync`,
      `${homeDirectory}/Library/Containers/com.apple.mail`,
      `${homeDirectory}/Library/Containers/com.apple.MobileSMS`,
      `${homeDirectory}/Library/Containers/com.apple.Safari`,
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
