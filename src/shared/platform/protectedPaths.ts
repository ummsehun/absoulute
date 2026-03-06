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
  };
}
