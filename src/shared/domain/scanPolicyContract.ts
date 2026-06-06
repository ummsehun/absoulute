import path from "node:path";

export interface ScanTraversalContract {
  bundleDirectorySuffixes: readonly string[];
  deepPackageSkipBasenames: readonly string[];
  heavyDirectoryBasenames: readonly string[];
}

const HEAVY_DIRECTORY_BASENAMES = [
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
] as const;

const DEEP_PACKAGE_SKIP_BASENAMES = [
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
] as const;

const BUNDLE_DIRECTORY_SUFFIXES = [
  ".app",
  ".framework",
  ".bundle",
  ".plugin",
  ".kext",
  ".prefpane",
  ".xpc",
  ".appex",
] as const;

export function getScanTraversalContract(): ScanTraversalContract {
  return {
    bundleDirectorySuffixes: BUNDLE_DIRECTORY_SUFFIXES,
    deepPackageSkipBasenames: DEEP_PACKAGE_SKIP_BASENAMES,
    heavyDirectoryBasenames: HEAVY_DIRECTORY_BASENAMES,
  };
}

export function resolveDeepSoftSkipPolicyPrefixes(
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

  return raw;
}
