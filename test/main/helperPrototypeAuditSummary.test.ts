/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { summarizeHelperPrototypeAudit } from "../../src/main/services/diagnostics/helperPrototypeAuditSummary";

describe("helperPrototypeAuditSummary", () => {
  it("summarizes helper prototype scan evidence for root coverage audits", () => {
    expect(
      summarizeHelperPrototypeAudit({
        root: "/Library",
        maxDepth: 8,
        result: { estimated: false },
        helperPlans: [
          {
            engine: "helper",
            productionReadiness: "prototype-only",
            prototypeEnumerate: true,
            registrationBlockers: [],
            transport: "xpc",
          },
        ],
        aggBatches: [
          {
            type: "agg_batch",
            items: [
              {
                path: "/Library/A",
                sizeDelta: 10,
                countDelta: 1,
                estimated: false,
              },
              {
                path: "/Library/B",
                sizeDelta: 20,
                countDelta: 1,
                estimated: false,
              },
            ],
          },
        ],
        coverage: [
          {
            type: "coverage",
            scanned: 2,
            blockedByPolicy: 0,
            blockedByPermission: 1,
            skippedByScope: 0,
            elevationRequired: false,
          },
        ],
        done: [
          {
            type: "done",
            elapsedMs: 42,
            estimated: false,
          },
        ],
        progress: [
          {
            type: "progress",
            scannedCount: 2,
            queuedDirs: 0,
            elapsedMs: 40,
            currentPath: "/Library/B",
          },
        ],
        warnings: [
          {
            type: "warn",
            code: "E_PERMISSION",
            message: "denied",
            path: "/Library/Protected",
          },
          {
            type: "warn",
            code: "E_PERMISSION",
            message: "denied again",
            path: "/Library/Protected",
          },
          {
            type: "warn",
            code: "E_IO",
            message: "io failed",
            path: "/Library/Broken",
          },
          {
            type: "warn",
            code: "E_IO",
            message: "missing path warning",
          },
        ],
        logEvents: [
          {
            event: "native_helper_scan_plan",
            details: {
              helperPrototypeEnumerate: true,
              helperAvailable: false,
            },
          },
        ],
      }),
    ).toEqual({
      root: "/Library",
      maxDepth: 8,
      engine: "helper",
      transport: "xpc",
      productionReadiness: "prototype-only",
      prototypeEnumerate: true,
      resultEstimated: false,
      aggBatchCount: 1,
      aggItemCount: 2,
      scanned: 2,
      blockedByPermission: 1,
      skippedByScope: 0,
      warningCount: 4,
      permissionWarningCount: 2,
      warningSamples: [
        "/Library/Protected",
        "/Library/Broken",
        "missing path warning",
      ],
      permissionWarningSamples: ["/Library/Protected"],
      doneElapsedMs: 42,
      fallbackUsed: false,
      helperAvailable: false,
      helperPrototypeLogged: true,
      registrationBlocked: false,
      registrationBlockers: [],
      readinessBlocked: false,
      readinessBlockers: [],
    });
  });

  it("summarizes helper blocker evidence from the latest helper plan", () => {
    expect(
      summarizeHelperPrototypeAudit({
        root: "/Users/user",
        maxDepth: 4,
        result: { estimated: true },
        helperPlans: [
          {
            engine: "native",
            fallbackReason: "helper-unavailable",
            productionReadiness: "unavailable",
            registrationBlockers: ["team-id-missing"],
            readinessBlockers: ["service-management-not-registered"],
            transport: "xpc",
          },
          {
            engine: "native",
            fallbackReason: "registration-preflight-blocked",
            productionReadiness: "blocked",
            readinessBlockers: [
              "helper-peer-validation-missing",
              "service-management-not-registered",
            ],
            registrationBlockers: [
              "team-id-missing",
              "helper-xpc-enumerate-bridge-missing",
            ],
            transport: "xpc",
          },
        ],
        aggBatches: [],
        coverage: [],
        done: [],
        progress: [],
        warnings: [],
        logEvents: [],
      }),
    ).toMatchObject({
      engine: "native",
      fallbackUsed: false,
      productionReadiness: "blocked",
      registrationBlocked: true,
      registrationBlockers: [
        "team-id-missing",
        "helper-xpc-enumerate-bridge-missing",
      ],
      readinessBlocked: true,
      readinessBlockers: [
        "helper-peer-validation-missing",
        "service-management-not-registered",
      ],
      transport: "xpc",
    });
  });

  it("filters helper blocker summary to stable blocker codes", () => {
    expect(
      summarizeHelperPrototypeAudit({
        root: "/Users/user",
        maxDepth: 4,
        result: { estimated: true },
        helperPlans: [
          {
            engine: "native",
            fallbackReason: "registration-preflight-blocked",
            productionReadiness: "blocked",
            readinessBlockers: [
              "helper-peer-validation-missing",
              "human readable readiness reason",
            ] as never,
            registrationBlockers: [
              "team-id-missing",
              "human readable fallback reason",
            ] as never,
            transport: "xpc",
          },
        ],
        aggBatches: [],
        coverage: [],
        done: [],
        progress: [],
        warnings: [],
        logEvents: [],
      }),
    ).toMatchObject({
      registrationBlocked: true,
      registrationBlockers: ["team-id-missing"],
      readinessBlocked: true,
      readinessBlockers: ["helper-peer-validation-missing"],
    });
  });
});
