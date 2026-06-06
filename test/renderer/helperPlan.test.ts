import { describe, expect, it } from "vitest";
import { getHelperPlanLabel } from "../../src/renderer/src/utils/helperPlan";

describe("renderer helper plan formatting", () => {
  it("formats helper engine plans", () => {
    expect(
      getHelperPlanLabel({
        engine: "helper",
        transport: "xpc",
        lifecycle: {
          state: "ready",
          reason: "ready",
          checks: {
            "service-management": "pass",
            "helper-install": "pass",
            "caller-identity": "pass",
            "full-disk-access": "unknown",
            "xpc-channel": "pass",
          },
        },
      }),
    ).toBe("helper xpc ready");
  });

  it("formats native fallback plans", () => {
    expect(
      getHelperPlanLabel({
        engine: "native",
        fallbackReason: "helper-unavailable",
        transport: "xpc",
        lifecycle: {
          state: "not-implemented",
          reason: "xpc-transport-not-implemented",
          checks: {
            "service-management": "fail",
            "helper-install": "unknown",
            "caller-identity": "unknown",
            "full-disk-access": "unknown",
            "xpc-channel": "fail",
          },
        },
      }),
    ).toBe("helper fallback helper-unavailable xpc not-implemented");
  });
});
