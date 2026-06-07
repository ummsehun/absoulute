import { describe, expect, it } from "vitest";
import { buildScanDiagnostics } from "../../src/main/services/diagnostics/scanDiagnostics";
import { ScanDiagnosticsSchema } from "../../src/shared/schemas/scan";

describe("buildScanDiagnostics", () => {
  it("preserves skip cause samples", () => {
    const diagnostics = buildScanDiagnostics(
      {
        scanId: "scan-1",
        phase: "walking",
        scanStage: "deep",
        scannedCount: 12,
        totalBytes: 4096,
        currentPath: "/Users/user",
      },
      250,
      3,
      {
        recoverableErrors: 0,
        permissionErrors: 1,
        ioErrors: 0,
        skipSamples: {
          policy: ["/Users/user/Library/Caches"],
          permission: ["/Users/user/Library/Mail"],
          scope: ["/Volumes/External"],
          budgetDeferred: ["/Users/user/Library/Application Support"],
        },
      },
    );

    expect(diagnostics.skipSamples).toEqual({
      policy: ["/Users/user/Library/Caches"],
      permission: ["/Users/user/Library/Mail"],
      scope: ["/Volumes/External"],
      budgetDeferred: ["/Users/user/Library/Application Support"],
    });
  });

  it("preserves permission rescan state", () => {
    const diagnostics = buildScanDiagnostics(
      {
        scanId: "scan-1",
        phase: "walking",
        scanStage: "deep",
        scannedCount: 12,
        totalBytes: 4096,
        currentPath: "/Users/user",
      },
      250,
      3,
      {
        recoverableErrors: 0,
        permissionErrors: 1,
        ioErrors: 0,
        permissionRescan: {
          pendingRoots: ["/Users/user/Library/Mail"],
          activeRoot: "/Users/user/Library/Messages",
          completedRoots: ["/Users/user/Library/Safari"],
        },
      },
    );

    expect(diagnostics.permissionRescan).toEqual({
      pendingRoots: ["/Users/user/Library/Mail"],
      activeRoot: "/Users/user/Library/Messages",
      completedRoots: ["/Users/user/Library/Safari"],
    });
  });

  it("preserves helper plan diagnostics", () => {
    const diagnostics = buildScanDiagnostics(
      {
        scanId: "scan-1",
        phase: "walking",
        scanStage: "deep",
        scannedCount: 12,
        totalBytes: 4096,
        currentPath: "/Users/user",
      },
      250,
      3,
      {
        recoverableErrors: 0,
        permissionErrors: 0,
        ioErrors: 0,
        helperPlan: {
          engine: "native",
          fallbackReason: "helper-unavailable",
          productionReadiness: "unavailable",
          registrationBlockers: [
            "team-id-missing",
            "helper-xpc-enumerate-bridge-missing",
          ],
          readinessBlockers: [
            "helper-peer-validation-missing",
            "service-management-not-registered",
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
        },
      },
    );

    expect(diagnostics.helperPlan).toEqual({
      engine: "native",
      fallbackReason: "helper-unavailable",
      productionReadiness: "unavailable",
      registrationBlockers: [
        "team-id-missing",
        "helper-xpc-enumerate-bridge-missing",
      ],
      readinessBlockers: [
        "helper-peer-validation-missing",
        "service-management-not-registered",
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
    });

    expect(ScanDiagnosticsSchema.parse(diagnostics).helperPlan).toEqual(
      diagnostics.helperPlan,
    );
  });
});
