/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HelperEventSchema } from "../../src/shared/schemas/helperProtocol";
import {
  buildHelperEnumerateRequest,
  createDefaultHelperClient,
  createDefaultHelperTransport,
  DisabledHelperClient,
  HELPER_DISABLED_REASON,
  HELPER_TRANSPORT_ENV,
  HelperUnavailableError,
  TransportHelperClient,
} from "../../src/main/services/helper/helperClient";
import { HelperTransportUnavailableError, type HelperTransport } from "../../src/main/services/helper/helperTransport";
import { CommandMacOsHelperEnumerator } from "../../src/main/services/helper/macosHelperEnumerateCommand";
import {
  MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON,
  MacOsXpcHelperTransport,
} from "../../src/main/services/helper/macosXpcHelperTransport";
import { resolveNativeVolumePlan } from "../../src/main/services/scan/nativeScanOrchestrator";
import { resolveScanOptions } from "../../src/main/services/scan/scanRuntimeOptions";

describe("helperClient", () => {
  it("keeps the default helper client disabled until Phase B gates are resolved", async () => {
    const client = createDefaultHelperClient();

    await expect(client.getStatus()).resolves.toEqual({
      available: false,
      lifecycle: {
        state: "disabled",
        reason: HELPER_DISABLED_REASON,
        checks: {
          "service-management": "unknown",
          "helper-install": "unknown",
          "caller-identity": "unknown",
          "full-disk-access": "unknown",
          "xpc-channel": "unknown",
        },
      },
      reason: HELPER_DISABLED_REASON,
      transport: "disabled",
    });
    await expect(client.getVersion()).resolves.toBeNull();
    await expect(client.healthCheck()).resolves.toEqual({
      available: false,
      lifecycle: {
        state: "disabled",
        reason: HELPER_DISABLED_REASON,
        checks: {
          "service-management": "unknown",
          "helper-install": "unknown",
          "caller-identity": "unknown",
          "full-disk-access": "unknown",
          "xpc-channel": "unknown",
        },
      },
      reason: HELPER_DISABLED_REASON,
      transport: "disabled",
    });
  });

  it("fails helper enumeration explicitly instead of silently falling through", async () => {
    const client = new DisabledHelperClient("not-installed");

    await expect(
      client.enumerate(
        {
          rootPath: "/Users/tester",
          scanId: "scan-1",
          stageId: "deep",
          scanMode: "deep",
          options: resolveScanOptions(
            {
              rootPath: "/Users/tester",
              optInProtected: false,
              accuracyMode: "full",
            },
            "/Users/tester",
          ),
          volumePlan: resolveNativeVolumePlan({ rootPath: "/Users/tester" }, "darwin"),
          maxDepth: 128,
        },
        { onEvent: () => undefined },
      ),
    ).rejects.toBeInstanceOf(HelperUnavailableError);
  });

  it("fails helper registration actions explicitly when the helper is disabled", async () => {
    const client = new DisabledHelperClient("phase-gate");

    await expect(client.register()).rejects.toMatchObject({
      name: "HelperUnavailableError",
      reason: "phase-gate",
    });
    await expect(client.unregister()).rejects.toMatchObject({
      name: "HelperUnavailableError",
      reason: "phase-gate",
    });
  });

  it("keeps helper transport disabled unless xpc is explicitly requested", async () => {
    const transport = createDefaultHelperTransport({}, "darwin");

    await expect(transport.getStatus()).resolves.toEqual({
      available: false,
      lifecycle: {
        state: "disabled",
        reason: HELPER_DISABLED_REASON,
        checks: {
          "service-management": "unknown",
          "helper-install": "unknown",
          "caller-identity": "unknown",
          "full-disk-access": "unknown",
          "xpc-channel": "unknown",
        },
      },
      reason: HELPER_DISABLED_REASON,
      transport: "disabled",
    });
  });

  it("selects the macOS xpc transport stub only on darwin opt-in", async () => {
    const transport = createDefaultHelperTransport(
      { [HELPER_TRANSPORT_ENV]: "xpc" },
      "darwin",
    );

    await expect(transport.getStatus()).resolves.toEqual({
      available: false,
      lifecycle: {
        state: "not-implemented",
        reason: MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON,
        checks: {
          "service-management": "fail",
          "helper-install": "unknown",
          "caller-identity": "unknown",
          "full-disk-access": "unknown",
          "xpc-channel": "fail",
        },
      },
      reason: MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON,
      registrationPreflight: {
        blockers: [
          "team-id-missing",
          "designated-requirement-missing",
          "packaging-entitlements-missing",
          "privileged-helper-executable-missing",
          "privileged-helper-listener-requirement-missing",
          "fda-validation-matrix-missing",
        ],
        contract: {
          appBundleIdentifier: "com.example.diskvisualizer",
          helperExecutableBundleRelativePath:
            "Contents/Library/LaunchServices/com.example.diskvisualizer.privileged-helper",
          helperLabel: "com.example.diskvisualizer.privileged-helper",
          launchDaemonBundleRelativePath:
            "Contents/Library/LaunchDaemons/com.example.diskvisualizer.privileged-helper.plist",
          launchDaemonPlistName:
            "com.example.diskvisualizer.privileged-helper.plist",
          serviceManagementModel: "smappservice-daemon",
        },
        status: "blocked",
      },
      transport: "xpc",
    });
    await expect(transport.getVersion()).resolves.toBeNull();
    await expect(transport.healthCheck()).resolves.toEqual({
      available: false,
      lifecycle: {
        state: "not-implemented",
        reason: MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON,
        checks: {
          "service-management": "fail",
          "helper-install": "unknown",
          "caller-identity": "unknown",
          "full-disk-access": "unknown",
          "xpc-channel": "fail",
        },
      },
      reason: MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON,
      registrationPreflight: {
        blockers: [
          "team-id-missing",
          "designated-requirement-missing",
          "packaging-entitlements-missing",
          "privileged-helper-executable-missing",
          "privileged-helper-listener-requirement-missing",
          "fda-validation-matrix-missing",
        ],
        contract: {
          appBundleIdentifier: "com.example.diskvisualizer",
          helperExecutableBundleRelativePath:
            "Contents/Library/LaunchServices/com.example.diskvisualizer.privileged-helper",
          helperLabel: "com.example.diskvisualizer.privileged-helper",
          launchDaemonBundleRelativePath:
            "Contents/Library/LaunchDaemons/com.example.diskvisualizer.privileged-helper.plist",
          launchDaemonPlistName:
            "com.example.diskvisualizer.privileged-helper.plist",
          serviceManagementModel: "smappservice-daemon",
        },
        status: "blocked",
      },
      transport: "xpc",
    });
  });

  it("uses the packaged ServiceManagement probe when xpc transport is enabled", async () => {
    const resourcesRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-client-resources-"),
    );
    const probePath = path.join(
      resourcesRoot,
      "bin",
      "service-management-probe-macos",
    );
    fs.mkdirSync(path.dirname(probePath), { recursive: true });
    fs.writeFileSync(
      probePath,
      "#!/bin/sh\nprintf '%s\\n' '{\"reason\":\"not-found\",\"state\":\"not-installed\"}'\n",
      { mode: 0o755 },
    );

    try {
      const transport = createDefaultHelperTransport(
        { [HELPER_TRANSPORT_ENV]: "xpc" },
        "darwin",
        resourcesRoot,
      );

      await expect(transport.getStatus()).resolves.toMatchObject({
        lifecycle: {
          state: "not-installed",
          checks: {
            "service-management": "fail",
            "helper-install": "unknown",
          },
        },
        transport: "xpc",
      });
    } finally {
      fs.rmSync(resourcesRoot, { force: true, recursive: true });
    }
  });

  it("uses the packaged helper enumerate CLI when xpc transport is enabled", async () => {
    const resourcesRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-enumerate-resources-"),
    );
    const helperPath = path.join(
      resourcesRoot,
      "bin",
      "helper-enumerate-macos",
    );
    fs.mkdirSync(path.dirname(helperPath), { recursive: true });
    fs.writeFileSync(
      helperPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "printf '%s\\n' '{\"type\":\"ready\",\"requestId\":\"request-1\",\"helperVersion\":\"test-helper\"}'",
        "printf '%s\\n' '{\"type\":\"done\",\"requestId\":\"request-1\",\"estimated\":false,\"elapsedMs\":1}'",
      ].join("\n"),
      { mode: 0o755 },
    );
    const events: unknown[] = [];

    try {
      const transport = createDefaultHelperTransport(
        {
          [HELPER_TRANSPORT_ENV]: "xpc",
          SCAN_HELPER_PROTOTYPE_ENUMERATE: "1",
        },
        "darwin",
        resourcesRoot,
      );

      await transport.enumerate(
        buildHelperEnumerateRequest({
          rootPath: "/Users/tester",
          scanId: "scan-1",
          stageId: "deep",
          scanMode: "deep",
          options: resolveScanOptions(
            {
              rootPath: "/Users/tester",
              optInProtected: false,
              accuracyMode: "full",
            },
            "/Users/tester",
          ),
          volumePlan: resolveNativeVolumePlan(
            { rootPath: "/Users/tester" },
            "darwin",
          ),
          maxDepth: 128,
          issuedAtMs: 1_765_000_000_000,
          nonce: "0123456789abcdef",
          requestId: "request-1",
        }),
        { onEvent: (event) => events.push(event) },
      );
    } finally {
      fs.rmSync(resourcesRoot, { force: true, recursive: true });
    }

    expect(events.map((event) => HelperEventSchema.parse(event))).toEqual([
      {
        type: "ready",
        requestId: "request-1",
        helperVersion: "test-helper",
      },
      {
        type: "done",
        requestId: "request-1",
        estimated: false,
        elapsedMs: 1,
      },
    ]);
  });

  it("blocks helper enumeration when registration preflight is not ready", async () => {
    let enumerateCalled = false;
    const transport = new MacOsXpcHelperTransport(
      {
        getStatus: async () => ({
          state: "registered",
          reason: "registered",
        }),
      },
      {},
      {
        enumerator: {
          enumerate: async () => {
            enumerateCalled = true;
          },
        },
      },
    );

    await expect(
      transport.enumerate(
        buildHelperEnumerateRequest({
          rootPath: "/Users/tester",
          scanId: "scan-1",
          stageId: "deep",
          scanMode: "deep",
          options: resolveScanOptions(
            {
              rootPath: "/Users/tester",
              optInProtected: false,
              accuracyMode: "full",
            },
            "/Users/tester",
          ),
          volumePlan: resolveNativeVolumePlan(
            { rootPath: "/Users/tester" },
            "darwin",
          ),
          maxDepth: 128,
          issuedAtMs: 1_765_000_000_000,
          nonce: "0123456789abcdef",
          requestId: "request-1",
        }),
        { onEvent: () => undefined },
      ),
    ).rejects.toMatchObject({
      reason: "registration-preflight-blocked:team-id-missing,designated-requirement-missing,packaging-entitlements-missing,privileged-helper-executable-missing,privileged-helper-listener-requirement-missing,fda-validation-matrix-missing",
    });
    expect(enumerateCalled).toBe(false);
  });

  it("blocks helper registration before install safety evidence is ready", async () => {
    let registerCalled = false;
    const transport = new MacOsXpcHelperTransport(
      {
        getStatus: async () => ({
          state: "not-installed",
          reason: "not-installed",
        }),
      },
      {},
      {
        serviceManagementControl: {
          getStatus: async () => ({
            state: "not-installed",
            reason: "not-installed",
          }),
          register: async () => {
            registerCalled = true;
            return {
              state: "pending-approval",
              reason: "register-succeeded",
            };
          },
          unregister: async () => ({
            state: "not-installed",
            reason: "unregister-succeeded",
          }),
        },
      },
    );

    await expect(transport.register()).rejects.toMatchObject({
      reason: "registration-install-preflight-blocked:team-id-missing,designated-requirement-missing,packaging-entitlements-missing,privileged-helper-executable-missing,privileged-helper-listener-requirement-missing",
    });
    expect(registerCalled).toBe(false);
  });

  it("allows helper registration when only FDA validation remains unresolved", async () => {
    let registerCalled = false;
    const transport = new MacOsXpcHelperTransport(
      {
        getStatus: async () => ({
          state: "not-installed",
          reason: "not-installed",
        }),
      },
      {
        identity: {
          teamId: "ABCDE12345",
          designatedRequirement:
            'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
        },
        packagingEntitlementsReady: true,
        privilegedHelperExecutableReady: true,
        privilegedHelperListenerRequirementReady: true,
        fdaValidationMatrixReady: false,
      },
      {
        serviceManagementControl: {
          getStatus: async () => ({
            state: "not-installed",
            reason: "not-installed",
          }),
          register: async () => {
            registerCalled = true;
            return {
              state: "pending-approval",
              reason: "register-succeeded",
            };
          },
          unregister: async () => ({
            state: "not-installed",
            reason: "unregister-succeeded",
          }),
        },
      },
    );

    await expect(transport.register()).resolves.toMatchObject({
      available: false,
      lifecycle: {
        state: "pending-approval",
        reason: "register-succeeded",
      },
      registrationPreflight: {
        status: "blocked",
        blockers: ["fda-validation-matrix-missing"],
      },
      reason: "register-succeeded",
      transport: "xpc",
    });
    expect(registerCalled).toBe(true);
  });

  it("rejects replayed helper enumerate requests before invoking the command transport", async () => {
    let runCount = 0;
    const enumerator = new CommandMacOsHelperEnumerator({
      commandPath: "/test/helper-enumerate-macos",
      run: async (request, handlers) => {
        runCount += 1;
        handlers.onEvent({
          type: "done",
          requestId: request.request.requestId,
          estimated: false,
          elapsedMs: 1,
        });
        return { exitCode: 0, stderr: "" };
      },
    });
    const request = buildHelperEnumerateRequest({
      rootPath: "/Users/tester",
      scanId: "scan-1",
      stageId: "deep",
      scanMode: "deep",
      options: resolveScanOptions(
        {
          rootPath: "/Users/tester",
          optInProtected: false,
          accuracyMode: "full",
        },
        "/Users/tester",
      ),
      volumePlan: resolveNativeVolumePlan(
        { rootPath: "/Users/tester" },
        "darwin",
      ),
      maxDepth: 128,
      issuedAtMs: 1_765_000_000_000,
      nonce: "0123456789abcdef",
      requestId: "request-1",
    });

    await enumerator.enumerate(request, { onEvent: () => undefined });
    await expect(
      enumerator.enumerate(request, { onEvent: () => undefined }),
    ).rejects.toThrow("helper-enumerate-replayed-request");
    expect(runCount).toBe(1);
  });

  it("reflects ServiceManagement probe results in macOS xpc lifecycle status", async () => {
    const transport = new MacOsXpcHelperTransport({
      getStatus: async () => ({
        state: "pending-approval",
        reason: "admin-approval-required",
      }),
    });

    await expect(transport.getStatus()).resolves.toEqual({
      available: false,
      lifecycle: {
        state: "pending-approval",
        reason: MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON,
        checks: {
          "service-management": "fail",
          "helper-install": "unknown",
          "caller-identity": "unknown",
          "full-disk-access": "unknown",
          "xpc-channel": "fail",
        },
      },
      reason: MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON,
      registrationPreflight: {
        blockers: [
          "team-id-missing",
          "designated-requirement-missing",
          "packaging-entitlements-missing",
          "privileged-helper-executable-missing",
          "privileged-helper-listener-requirement-missing",
          "fda-validation-matrix-missing",
        ],
        contract: {
          appBundleIdentifier: "com.example.diskvisualizer",
          helperExecutableBundleRelativePath:
            "Contents/Library/LaunchServices/com.example.diskvisualizer.privileged-helper",
          helperLabel: "com.example.diskvisualizer.privileged-helper",
          launchDaemonBundleRelativePath:
            "Contents/Library/LaunchDaemons/com.example.diskvisualizer.privileged-helper.plist",
          launchDaemonPlistName:
            "com.example.diskvisualizer.privileged-helper.plist",
          serviceManagementModel: "smappservice-daemon",
        },
        status: "blocked",
      },
      transport: "xpc",
    });
  });

  it("streams validated helper enumerate events from the macOS helper CLI", async () => {
    const tempRootPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-transport-root-"),
    );
    const rootPath = fs.realpathSync(tempRootPath);
    fs.mkdirSync(path.join(rootPath, "Library"), { recursive: true });
    fs.writeFileSync(path.join(rootPath, "Library", "cache.bin"), "cache");
    const helperPath = path.join(
      process.cwd(),
      "resources",
      "bin",
      "helper-enumerate-macos",
    );
    const events: unknown[] = [];
    const transport = new MacOsXpcHelperTransport(
      {
        getStatus: async () => ({
          state: "registered",
          reason: "registered",
        }),
      },
      {
        identity: {
          teamId: "ABCDE12345",
          designatedRequirement:
            'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
        },
        packagingEntitlementsReady: true,
        privilegedHelperExecutableReady: true,
        privilegedHelperListenerRequirementReady: true,
        fdaValidationMatrixReady: true,
      },
      { enumerateBinaryPath: helperPath },
    );

    try {
      await transport.enumerate(
        buildHelperEnumerateRequest({
          rootPath,
          scanId: "scan-1",
          stageId: "deep",
          scanMode: "deep",
          options: resolveScanOptions(
            {
              rootPath,
              optInProtected: false,
              accuracyMode: "full",
            },
            rootPath,
          ),
          volumePlan: resolveNativeVolumePlan({ rootPath }, "darwin"),
          maxDepth: 4,
          issuedAtMs: 1_765_000_000_000,
          nonce: "0123456789abcdef",
          requestId: "request-1",
        }),
        { onEvent: (event) => events.push(event) },
      );
    } finally {
      fs.rmSync(rootPath, { force: true, recursive: true });
    }

    const parsedEvents = events.map((event) => HelperEventSchema.parse(event));
    expect(parsedEvents.map((event) => event.type)).toContain("ready");
    expect(parsedEvents.map((event) => event.type)).toContain("entry_batch");
    expect(parsedEvents.at(-1)).toMatchObject({
      type: "done",
      requestId: "request-1",
      estimated: false,
    });
    expect(
      parsedEvents
        .filter((event) => event.type === "entry_batch")
        .flatMap((event) => event.items.map((item) => item.path)),
    ).toContain(path.join(rootPath, "Library", "cache.bin"));
  });

  it("surfaces registration preflight blockers before reporting xpc readiness", async () => {
    const transport = new MacOsXpcHelperTransport(
      {
        getStatus: async () => ({
          state: "registered",
          reason: "registered",
        }),
      },
      {
        identity: {
          teamId: "ABCDE12345",
          designatedRequirement:
            'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
        },
        packagingEntitlementsReady: true,
        privilegedHelperExecutableReady: true,
        privilegedHelperListenerRequirementReady: true,
        fdaValidationMatrixReady: false,
      },
    );

    await expect(transport.getStatus()).resolves.toMatchObject({
      available: false,
      registrationPreflight: {
        status: "blocked",
        blockers: ["fda-validation-matrix-missing"],
      },
      lifecycle: {
        state: "not-authorized",
        reason: "registration-preflight-blocked:fda-validation-matrix-missing",
        checks: {
          "service-management": "pass",
          "helper-install": "pass",
          "caller-identity": "pass",
          "full-disk-access": "fail",
          "xpc-channel": "unknown",
        },
      },
      reason: "registration-preflight-blocked:fda-validation-matrix-missing",
      transport: "xpc",
    });
  });

  it("does not select xpc transport on non-macOS platforms", async () => {
    const transport = createDefaultHelperTransport(
      { [HELPER_TRANSPORT_ENV]: "xpc" },
      "linux",
    );

    await expect(transport.getStatus()).resolves.toEqual({
      available: false,
      lifecycle: {
        state: "disabled",
        reason: "xpc-transport-non-darwin",
        checks: {
          "service-management": "unknown",
          "helper-install": "unknown",
          "caller-identity": "unknown",
          "full-disk-access": "unknown",
          "xpc-channel": "unknown",
        },
      },
      reason: "xpc-transport-non-darwin",
      transport: "disabled",
    });
  });

  it("builds a validated helper enumerate request from main-process scan inputs", () => {
    const options = resolveScanOptions(
      {
        rootPath: "/Users/tester",
        optInProtected: false,
        accuracyMode: "full",
      },
      "/Users/tester",
    );

    const request = buildHelperEnumerateRequest({
      rootPath: "/Users/tester",
      scanId: "scan-1",
      stageId: "deep",
      scanMode: "deep",
      options,
      volumePlan: resolveNativeVolumePlan({ rootPath: "/Users/tester" }, "darwin"),
      maxDepth: 128,
      issuedAtMs: 1_765_000_000_000,
      nonce: "0123456789abcdef",
      requestId: "request-1",
      traversalPolicyPlanId: "policy-plan-1",
    });

    expect(request).toMatchObject({
      schemaVersion: 1,
      requestId: "request-1",
      scanId: "scan-1",
      stageId: "deep",
      operation: "scan.enumerate",
      issuedAtMs: 1_765_000_000_000,
      nonce: "0123456789abcdef",
      payload: {
        root: "/Users/tester",
        scanMode: "deep",
        accuracyMode: "full",
        volumePolicy: "same-device",
        plannedRoots: ["/Users/tester"],
        maxDepth: 128,
        sameDeviceOnly: true,
        permissionPolicy: "report-only",
        traversalPolicyPlanId: "policy-plan-1",
        emitPolicy: {
          batchMaxItems: options.emitPolicy.aggBatchMaxItems,
          progressIntervalMs: options.emitPolicy.progressIntervalMs,
        },
      },
    });
  });

  it("delegates validated enumerate requests to the configured transport", async () => {
    const receivedRequests: unknown[] = [];
    const transport: HelperTransport = {
      getStatus: async () => ({ available: true, transport: "xpc" }),
      getVersion: async () => "test-helper",
      healthCheck: async () => ({ available: true, transport: "xpc" }),
      register: async () => ({ available: false, transport: "xpc" }),
      unregister: async () => ({ available: false, transport: "xpc" }),
      enumerate: async (request, handlers) => {
        receivedRequests.push(request);
        handlers.onEvent({
          type: "done",
          requestId: request.requestId,
          elapsedMs: 1,
          estimated: false,
        });
      },
    };
    const events: unknown[] = [];
    const client = new TransportHelperClient(transport);

    await client.enumerate(
      {
        rootPath: "/Users/tester",
        scanId: "scan-1",
        stageId: "deep",
        scanMode: "deep",
        options: resolveScanOptions(
          {
            rootPath: "/Users/tester",
            optInProtected: false,
            accuracyMode: "full",
          },
          "/Users/tester",
        ),
        volumePlan: resolveNativeVolumePlan({ rootPath: "/Users/tester" }, "darwin"),
        maxDepth: 128,
        issuedAtMs: 1_765_000_000_000,
        nonce: "0123456789abcdef",
        requestId: "request-1",
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(receivedRequests).toHaveLength(1);
    expect(receivedRequests[0]).toMatchObject({
      schemaVersion: 1,
      requestId: "request-1",
      scanId: "scan-1",
      stageId: "deep",
      operation: "scan.enumerate",
      payload: {
        root: "/Users/tester",
        permissionPolicy: "report-only",
      },
    });
    expect(events).toEqual([
      {
        type: "done",
        requestId: "request-1",
        elapsedMs: 1,
        estimated: false,
      },
    ]);
  });

  it("delegates helper registration actions to the configured transport", async () => {
    const calls: string[] = [];
    const transport: HelperTransport = {
      getStatus: async () => ({ available: true, transport: "xpc" }),
      getVersion: async () => "test-helper",
      healthCheck: async () => ({ available: true, transport: "xpc" }),
      register: async () => {
        calls.push("register");
        return { available: false, reason: "register-succeeded", transport: "xpc" };
      },
      unregister: async () => {
        calls.push("unregister");
        return { available: false, reason: "unregister-succeeded", transport: "xpc" };
      },
      enumerate: async () => undefined,
    };
    const client = new TransportHelperClient(transport);

    await expect(client.register()).resolves.toMatchObject({
      reason: "register-succeeded",
    });
    await expect(client.unregister()).resolves.toMatchObject({
      reason: "unregister-succeeded",
    });
    expect(calls).toEqual(["register", "unregister"]);
  });

  it("maps unavailable transport errors to helper client errors", async () => {
    const transport: HelperTransport = {
      getStatus: async () => ({ available: false, transport: "disabled" }),
      getVersion: async () => null,
      healthCheck: async () => ({ available: false, transport: "disabled" }),
      register: async () => {
        throw new HelperTransportUnavailableError("xpc-not-registered");
      },
      unregister: async () => {
        throw new HelperTransportUnavailableError("xpc-not-registered");
      },
      enumerate: async () => {
        throw new HelperTransportUnavailableError("xpc-not-registered");
      },
    };
    const client = new TransportHelperClient(transport);

    await expect(
      client.enumerate(
        {
          rootPath: "/Users/tester",
          scanId: "scan-1",
          stageId: "deep",
          scanMode: "deep",
          options: resolveScanOptions(
            {
              rootPath: "/Users/tester",
              optInProtected: false,
              accuracyMode: "full",
            },
            "/Users/tester",
          ),
          volumePlan: resolveNativeVolumePlan({ rootPath: "/Users/tester" }, "darwin"),
          maxDepth: 128,
        },
        { onEvent: () => undefined },
      ),
    ).rejects.toMatchObject({
      name: "HelperUnavailableError",
      reason: "xpc-not-registered",
    });
  });

  it("rejects helper requests whose root is outside the resolved volume plan", () => {
    const options = resolveScanOptions(
      {
        rootPath: "/Users/tester",
        optInProtected: false,
        accuracyMode: "full",
      },
      "/Users/tester",
    );

    expect(() =>
      buildHelperEnumerateRequest({
        rootPath: "/Library",
        scanId: "scan-1",
        stageId: "deep",
        scanMode: "deep",
        options,
        volumePlan: resolveNativeVolumePlan({ rootPath: "/Users/tester" }, "darwin"),
        maxDepth: 128,
        issuedAtMs: 1_765_000_000_000,
        nonce: "0123456789abcdef",
        requestId: "request-1",
      }),
    ).toThrow();
  });
});
