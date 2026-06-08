import path from "node:path";

export interface ScanTraversalContract {
  bundleDirectorySuffixes: readonly string[];
  deepPackageSkipBasenames: readonly string[];
  heavyDirectoryBasenames: readonly string[];
  softSkipPathRules: readonly ScanSoftSkipPathRule[];
}

export interface ScanSoftSkipPathRule {
  all: readonly string[];
  any?: readonly string[];
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
  ".Spotlight-V100",
  ".fseventsd",
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

const BROWSER_ROOTS = [
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
] as const;

const CHROMIUM_WEB_APP_ROOTS = [
  "/library/application support/google/chrome/",
  "/library/application support/google/chrome beta/",
  "/library/application support/google/chrome canary/",
  "/library/application support/bravesoftware/brave-browser/",
  "/library/application support/microsoft edge/",
  "/library/application support/vivaldi/",
  "/library/application support/opera",
] as const;

const PROFILE_STORAGE_SEGMENTS = [
  "/storage/default/",
  "/storage/temporary/",
  "/storage/permanent/",
] as const;

const PROFILE_CACHE_SEGMENTS = ["/cache/", "/cache2/", "/morgue/"] as const;

const SOFT_SKIP_PATH_RULES: readonly ScanSoftSkipPathRule[] = [
  {
    all: ["/.rustup/toolchains/"],
    any: ["/share/doc/", "/lib/rustlib/src/"],
  },
  { all: ["/.nvm/versions/"] },
  { all: ["/.pyenv/versions/"] },
  { all: ["/venv/", "/site-packages/"] },
  { all: ["/venv/", "/dist-packages/"] },
  { all: ["/.venv/", "/site-packages/"] },
  { all: ["/.venv/", "/dist-packages/"] },
  {
    all: [
      "/library/containers/com.kakao.kakaotalkmac/data/library/application support/com.kakao.kakaotalkmac/",
      "/commonresource/mychattag",
    ],
  },
  {
    all: ["/extensions/"],
    any: BROWSER_ROOTS,
  },
  {
    all: ["/storage/ext/"],
    any: BROWSER_ROOTS,
  },
  {
    all: ["/shared dictionary/cache/"],
    any: BROWSER_ROOTS,
  },
  ...BROWSER_ROOTS.flatMap((browserRoot) =>
    PROFILE_STORAGE_SEGMENTS.flatMap((storageSegment) =>
      PROFILE_CACHE_SEGMENTS.map((cacheSegment) => ({
        all: [browserRoot, "/profiles/", storageSegment, cacheSegment],
      })),
    ),
  ),
  {
    all: ["/web applications/"],
    any: CHROMIUM_WEB_APP_ROOTS,
  },
  {
    all: ["/manifest resources/"],
    any: CHROMIUM_WEB_APP_ROOTS,
  },
  {
    all: ["/shortcuts menu icons/"],
    any: CHROMIUM_WEB_APP_ROOTS,
  },
] as const;

export function getScanTraversalContract(): ScanTraversalContract {
  return {
    bundleDirectorySuffixes: BUNDLE_DIRECTORY_SUFFIXES,
    deepPackageSkipBasenames: DEEP_PACKAGE_SKIP_BASENAMES,
    heavyDirectoryBasenames: HEAVY_DIRECTORY_BASENAMES,
    softSkipPathRules: SOFT_SKIP_PATH_RULES,
  };
}

export function matchesSoftSkipPathRules(
  normalizedPath: string,
  rules: readonly ScanSoftSkipPathRule[] = SOFT_SKIP_PATH_RULES,
): boolean {
  const candidate = normalizedPath.toLowerCase();
  return rules.some((rule) => {
    if (!rule.all.every((fragment) => candidate.includes(fragment.toLowerCase()))) {
      return false;
    }
    if (!rule.any || rule.any.length === 0) {
      return true;
    }
    return rule.any.some((fragment) => candidate.includes(fragment.toLowerCase()));
  });
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
