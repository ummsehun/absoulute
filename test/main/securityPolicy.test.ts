/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { classifyPathByPolicy } from "../../src/main/core/securityPolicy";

describe("securityPolicy classifyPathByPolicy", () => {
  it("blocks absolute protected paths", () => {
    const result = classifyPathByPolicy(
      "/System/Library",
      false,
      "darwin",
      "/Users/tester",
    );

    expect(result.allowed).toBe(false);
    expect(result.error?.code).toBe("E_PROTECTED_PATH");
  });

  it("requires opt-in for optional protected paths", () => {
    const result = classifyPathByPolicy(
      "/Users/tester/Documents",
      false,
      "darwin",
      "/Users/tester",
    );

    expect(result.allowed).toBe(false);
    expect(result.error?.code).toBe("E_OPTIN_REQUIRED");
  });

  it("allows opt-in path when explicit consent is enabled", () => {
    const result = classifyPathByPolicy(
      "/Users/tester/Documents",
      true,
      "darwin",
      "/Users/tester",
    );

    expect(result.allowed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("allows general Library application support paths without opt-in", () => {
    const result = classifyPathByPolicy(
      "/Users/tester/Library/Application Support/com.kakao.KakaoTalkMac",
      false,
      "darwin",
      "/Users/tester",
    );

    expect(result.allowed).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
