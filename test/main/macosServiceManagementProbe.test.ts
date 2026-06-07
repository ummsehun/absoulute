/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CommandMacOsServiceManagementProbe,
  CommandMacOsServiceManagementController,
  createMacOsServiceManagementControllerFromEnv,
  createMacOsServiceManagementProbeFromEnv,
  resolveMacOsServiceManagementProbeBinary,
} from "../../src/main/services/helper/macosServiceManagementProbe";

describe("macosServiceManagementProbe", () => {
  it("maps a probe command JSON result into ServiceManagement status", async () => {
    const probe = new CommandMacOsServiceManagementProbe({
      commandPath: "/tmp/probe-sm-status",
      run: async (request) => {
        expect(request).toEqual({
          commandPath: "/tmp/probe-sm-status",
          args: [],
          timeoutMs: 2_000,
        });

        return {
          exitCode: 0,
          stderr: "",
          stdout: '{"state":"registered","reason":"enabled"}\n',
        };
      },
    });

    await expect(probe.getStatus()).resolves.toEqual({
      state: "registered",
      reason: "enabled",
    });
  });

  it("runs explicit register and unregister commands through the ServiceManagement controller", async () => {
    const calls: unknown[] = [];
    const controller = new CommandMacOsServiceManagementController({
      commandPath: "/tmp/control-sm-service",
      run: async (request) => {
        calls.push(request);
        return {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            action: request.args[0],
            state: request.args[0] === "register" ? "pending-approval" : "not-installed",
            reason: `${request.args[0]}-succeeded`,
          }),
        };
      },
    });

    await expect(controller.register()).resolves.toEqual({
      state: "pending-approval",
      reason: "register-succeeded",
    });
    await expect(controller.unregister()).resolves.toEqual({
      state: "not-installed",
      reason: "unregister-succeeded",
    });
    expect(calls).toEqual([
      {
        commandPath: "/tmp/control-sm-service",
        args: ["register"],
        timeoutMs: 2_000,
      },
      {
        commandPath: "/tmp/control-sm-service",
        args: ["unregister"],
        timeoutMs: 2_000,
      },
    ]);
  });

  it("rejects register output that does not prove register completion", async () => {
    const controller = new CommandMacOsServiceManagementController({
      commandPath: "/tmp/control-sm-service",
      run: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          state: "registered",
          reason: "enabled",
        }),
      }),
    });

    await expect(controller.register()).resolves.toEqual({
      state: "not-implemented",
      reason: "service-management-control-output-mismatch:register:enabled",
    });
  });

  it("rejects unregister output that does not prove unregister completion", async () => {
    const controller = new CommandMacOsServiceManagementController({
      commandPath: "/tmp/control-sm-service",
      run: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          state: "not-installed",
          reason: "not-registered",
        }),
      }),
    });

    await expect(controller.unregister()).resolves.toEqual({
      state: "not-implemented",
      reason: "service-management-control-output-mismatch:unregister:not-registered",
    });
  });

  it("rejects unregister output that reports a registered state", async () => {
    const controller = new CommandMacOsServiceManagementController({
      commandPath: "/tmp/control-sm-service",
      run: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          state: "registered",
          reason: "unregister-succeeded",
        }),
      }),
    });

    await expect(controller.unregister()).resolves.toEqual({
      state: "not-implemented",
      reason: "service-management-control-output-mismatch:unregister:unregister-succeeded",
    });
  });

  it("rejects register output that reports an uninstalled state", async () => {
    const controller = new CommandMacOsServiceManagementController({
      commandPath: "/tmp/control-sm-service",
      run: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          state: "not-installed",
          reason: "register-succeeded",
        }),
      }),
    });

    await expect(controller.register()).resolves.toEqual({
      state: "not-implemented",
      reason: "service-management-control-output-mismatch:register:register-succeeded",
    });
  });

  it("turns failed probe commands into explicit not-implemented status", async () => {
    const probe = new CommandMacOsServiceManagementProbe({
      commandPath: "/tmp/probe-sm-status",
      run: async () => ({
        exitCode: 2,
        stderr: "missing helper plist",
        stdout: "",
      }),
    });

    await expect(probe.getStatus()).resolves.toEqual({
      state: "not-implemented",
      reason: "service-management-probe-failed:exit-2:missing helper plist",
    });
  });

  it("rejects invalid probe JSON without pretending the helper is installed", async () => {
    const probe = new CommandMacOsServiceManagementProbe({
      commandPath: "/tmp/probe-sm-status",
      run: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: '{"state":"enabled","reason":"wrong enum"}',
      }),
    });

    await expect(probe.getStatus()).resolves.toEqual({
      state: "not-implemented",
      reason: "service-management-probe-invalid-output",
    });
  });

  it("selects the command probe only on darwin with an executable explicit probe binary", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-sm-probe-env-"),
    );
    const probePath = path.join(tempDir, "probe-sm-status");

    try {
      expect(
        createMacOsServiceManagementProbeFromEnv(
          { SCAN_HELPER_SM_PROBE_BIN: probePath },
          "darwin",
        ).constructor.name,
      ).toBe("NotImplementedMacOsServiceManagementProbe");

      fs.writeFileSync(probePath, "#!/bin/sh\nexit 0\n");

      expect(
        resolveMacOsServiceManagementProbeBinary(
          { SCAN_HELPER_SM_PROBE_BIN: probePath },
          null,
        ),
      ).toBeNull();

      fs.chmodSync(probePath, 0o755);

      expect(
        createMacOsServiceManagementProbeFromEnv(
          { SCAN_HELPER_SM_PROBE_BIN: probePath },
          "darwin",
        ),
      ).toBeInstanceOf(CommandMacOsServiceManagementProbe);
      expect(
        resolveMacOsServiceManagementProbeBinary(
          { SCAN_HELPER_SM_PROBE_BIN: probePath },
          null,
        ),
      ).toBe(probePath);

      expect(
        createMacOsServiceManagementProbeFromEnv(
          { SCAN_HELPER_SM_PROBE_BIN: probePath },
          "linux",
        ).constructor.name,
      ).toBe("NotImplementedMacOsServiceManagementProbe");
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("selects the command controller only on darwin with an executable ServiceManagement binary", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-sm-control-env-"),
    );
    const controlPath = path.join(tempDir, "control-sm-service");

    try {
      expect(
        createMacOsServiceManagementControllerFromEnv(
          { SCAN_HELPER_SM_PROBE_BIN: controlPath },
          "darwin",
        ),
      ).toBeNull();

      fs.writeFileSync(controlPath, "#!/bin/sh\nexit 0\n");
      fs.chmodSync(controlPath, 0o755);

      expect(
        createMacOsServiceManagementControllerFromEnv(
          { SCAN_HELPER_SM_PROBE_BIN: controlPath },
          "darwin",
        ),
      ).toBeInstanceOf(CommandMacOsServiceManagementController);

      expect(
        createMacOsServiceManagementControllerFromEnv(
          { SCAN_HELPER_SM_PROBE_BIN: controlPath },
          "linux",
        ),
      ).toBeNull();
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("falls back to the executable packaged probe binary in Electron resources on macOS", () => {
    const resourcesRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-sm-probe-resources-"),
    );
    const probePath = path.join(
      resourcesRoot,
      "bin",
      "service-management-probe-macos",
    );
    fs.mkdirSync(path.dirname(probePath), { recursive: true });
    fs.writeFileSync(probePath, "");

    try {
      expect(
        createMacOsServiceManagementProbeFromEnv(
          {},
          "darwin",
          resourcesRoot,
        ).constructor.name,
      ).toBe("NotImplementedMacOsServiceManagementProbe");
      expect(resolveMacOsServiceManagementProbeBinary({}, resourcesRoot)).toBeNull();

      fs.chmodSync(probePath, 0o755);

      expect(
        createMacOsServiceManagementProbeFromEnv(
          {},
          "darwin",
          resourcesRoot,
        ),
      ).toBeInstanceOf(CommandMacOsServiceManagementProbe);
      expect(resolveMacOsServiceManagementProbeBinary({}, resourcesRoot)).toBe(
        probePath,
      );
    } finally {
      fs.rmSync(resourcesRoot, { force: true, recursive: true });
    }
  });

  it("does not fall back to the packaged probe when an explicit probe path is invalid", () => {
    const resourcesRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-sm-probe-invalid-env-"),
    );
    const probePath = path.join(
      resourcesRoot,
      "bin",
      "service-management-probe-macos",
    );
    const invalidEnvPath = path.join(resourcesRoot, "missing-probe");

    try {
      fs.mkdirSync(path.dirname(probePath), { recursive: true });
      fs.writeFileSync(probePath, "#!/bin/sh\nexit 0\n");
      fs.chmodSync(probePath, 0o755);

      expect(resolveMacOsServiceManagementProbeBinary(
        { SCAN_HELPER_SM_PROBE_BIN: invalidEnvPath },
        resourcesRoot,
      )).toBeNull();
      expect(
        createMacOsServiceManagementProbeFromEnv(
          { SCAN_HELPER_SM_PROBE_BIN: invalidEnvPath },
          "darwin",
          resourcesRoot,
        ).constructor.name,
      ).toBe("NotImplementedMacOsServiceManagementProbe");
      expect(
        createMacOsServiceManagementControllerFromEnv(
          { SCAN_HELPER_SM_PROBE_BIN: invalidEnvPath },
          "darwin",
          resourcesRoot,
        ),
      ).toBeNull();
    } finally {
      fs.rmSync(resourcesRoot, { force: true, recursive: true });
    }
  });
});
