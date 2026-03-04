export type PathGateCode = "E_PROTECTED_PATH" | "E_OPTIN_REQUIRED";

export interface ProtectedPathPolicy {
  absoluteBlock: string[];
  optInRequired: string[];
  defaultAllowRoots: string[];
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
    };
  }

  return {
    absoluteBlock: ["/System", "/usr", "/bin", "/sbin", "/private"],
    optInRequired: [
      "/Applications",
      `${homeDirectory}/Library`,
      `${homeDirectory}/Library/Application Support`,
    ],
    defaultAllowRoots: [homeDirectory],
  };
}
