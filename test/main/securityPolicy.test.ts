/* @vitest-environment node */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyPathByPolicy,
  createPathPolicyClassifier,
  resolveEffectivePathAccess,
} from "../../src/main/core/securityPolicy";

describe("securityPolicy classifyPathByPolicy", () => {
  it("marks system paths as non-removable while keeping them scannable", () => {
    const result = classifyPathByPolicy(
      "/System/Library",
      false,
      "darwin",
      "/Users/tester",
    );

    expect(result.scanAllowed).toBe(true);
    expect(result.removeAllowed).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it("requires system permission for protected paths by default", () => {
    const result = classifyPathByPolicy(
      "/Users/tester/Documents",
      false,
      "darwin",
      "/Users/tester",
    );

    expect(result.scanAllowed).toBe(false);
    expect(result.permissionState).toBe("required");
    expect(result.error?.code).toBe("E_PERMISSION");
  });

  it("allows protected paths when effective access is granted", () => {
    const effectiveAccess = {
      grantedPermissionRoots: ["/Users/tester/Documents"],
      deniedPermissionRoots: [],
      nonRemovableRoots: [
        "/System",
        "/bin",
        "/sbin",
        "/usr/bin",
        "/usr/sbin",
      ],
      scanBlockedRoots: ["/dev", "/net"],
    };
    const result = classifyPathByPolicy(
      "/Users/tester/Documents",
      false,
      "darwin",
      "/Users/tester",
      effectiveAccess,
    );

    expect(result.scanAllowed).toBe(true);
    expect(result.permissionState).toBe("granted");
    expect(result.error).toBeUndefined();
  });

  it("requires permission for Library-scoped user data by default", () => {
    const result = classifyPathByPolicy(
      "/Users/tester/Library/Application Support/com.kakao.KakaoTalkMac",
      false,
      "darwin",
      "/Users/tester",
    );

    expect(result.scanAllowed).toBe(false);
    expect(result.permissionState).toBe("required");
    expect(result.error?.code).toBe("E_PERMISSION");
  });

  it("auto-grants readable protected roots when effective access is resolved", async () => {
    const tempHomeBase = path.join(process.cwd(), ".tmp-tests");
    await fs.mkdir(tempHomeBase, { recursive: true });
    const tempHome = await fs.mkdtemp(path.join(tempHomeBase, "policy-home-"));
    const documentsPath = path.join(tempHome, "Documents");
    await fs.mkdir(documentsPath, { recursive: true });

    try {
      const access = await resolveEffectivePathAccess(tempHome, "darwin", tempHome);
      const result = createPathPolicyClassifier("darwin", tempHome, access)(
        documentsPath,
        false,
      );

      expect(access.grantedPermissionRoots).toContain(documentsPath);
      expect(result.scanAllowed).toBe(true);
      expect(result.permissionState).toBe("granted");
    } finally {
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });
});
