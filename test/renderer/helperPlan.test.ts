import { describe, expect, it } from "vitest";
import { getHelperPlanLabel } from "../../src/renderer/src/utils/helperPlan";

describe("renderer helper plan formatting", () => {
  it("formats helper engine plans", () => {
    expect(
      getHelperPlanLabel({
        engine: "helper",
        productionReadiness: "ready",
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
    ).toBe("helper ready xpc ready");
  });

  it("formats native fallback plans", () => {
    expect(
      getHelperPlanLabel({
        engine: "native",
        fallbackReason: "helper-unavailable",
        productionReadiness: "unavailable",
        registrationBlockers: [
          "team-id-missing",
          "helper-xpc-enumerate-bridge-missing",
        ],
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
    ).toBe("helper unavailable fallback helper-unavailable xpc not-implemented");
  });

  it("formats prototype-only helper plans without implying production readiness", () => {
    expect(
      getHelperPlanLabel({
        engine: "helper",
        productionReadiness: "prototype-only",
        transport: "xpc",
      }),
    ).toBe("helper prototype-only xpc unknown");
  });
});
