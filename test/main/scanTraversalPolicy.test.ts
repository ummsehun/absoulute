/* @vitest-environment node */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveScanOptions } from "../../src/main/services/scan/scanRuntimeOptions";
import {
  buildNativeBlockedPrefixes,
  buildNativePermissionDeniedPrefixes,
  shouldEstimateDirectory,
  isKakaoTalkChatTagPath,
  shouldSkipDeepPackageTraversal,
} from "../../src/main/services/scan/scanTraversalPolicy";

describe("scanTraversalPolicy", () => {
  const homeDirectory = "/Users/tester";
  const rootPath = path.join(homeDirectory, "Projects", "sample-app");

  it("estimates heavy directories only for preview-friendly accelerated scans", () => {
    const options = resolveScanOptions(
      {
        rootPath,
        optInProtected: false,
        scanMode: "portable_plus_os_accel",
        performanceProfile: "preview-first",
      },
      rootPath,
    );
    const heavyDir = path.join(rootPath, "node_modules");

    expect(shouldEstimateDirectory(options, heavyDir, new Set())).toBe(true);
    expect(shouldEstimateDirectory(options, heavyDir, new Set([heavyDir]))).toBe(false);
  });

  it("soft-skips known browser extension trees during responsive deep scans", () => {
    const options = resolveScanOptions(
      {
        rootPath,
        optInProtected: false,
        scanMode: "portable_plus_os_accel",
      },
      rootPath,
    );
    const browserExtensions = path.join(
      homeDirectory,
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "Default",
      "Extensions",
      "abc123",
    );

    const skipped = shouldSkipDeepPackageTraversal({
      options,
      rootPath,
      dirPath: browserExtensions,
      platform: "darwin",
      skippedDirectories: new Set(),
    });

    expect(skipped).toBe(true);
  });

  it("soft-skips KakaoTalk chat tag containers during responsive deep scans", () => {
    const options = resolveScanOptions(
      {
        rootPath,
        optInProtected: false,
        scanMode: "portable_plus_os_accel",
      },
      rootPath,
    );
    const kakaoChatTag = path.join(
      homeDirectory,
      "Library",
      "Containers",
      "com.kakao.KakaoTalkMac",
      "Data",
      "Library",
      "Application Support",
      "com.kakao.KakaoTalkMac",
      "session-1",
      "commonResource",
      "myChatTag",
    );

    expect(isKakaoTalkChatTagPath(kakaoChatTag, "darwin")).toBe(true);
    expect(
      shouldSkipDeepPackageTraversal({
        options,
        rootPath,
        dirPath: kakaoChatTag,
        platform: "darwin",
        skippedDirectories: new Set(),
      }),
    ).toBe(true);
  });

  it("separates hard blocked roots from permission-gated roots", () => {
    const blockedRoots = buildNativeBlockedPrefixes("darwin", homeDirectory);
    const permissionRoots = buildNativePermissionDeniedPrefixes("darwin", [
      path.join(homeDirectory, "Documents"),
    ]);

    expect(blockedRoots).toContain("/dev");
    expect(blockedRoots).not.toContain(path.join(homeDirectory, "Documents"));
    expect(permissionRoots).toContain(path.join(homeDirectory, "Documents"));
  });
});
