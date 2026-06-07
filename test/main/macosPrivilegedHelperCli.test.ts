/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISK_SCAN_HELPER_LABEL,
  DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
} from "../../src/main/services/helper/helperRegistration";

const sourcePath = path.join(
  process.cwd(),
  "native",
  "macos-helper",
  "privileged-helper",
  "main.swift",
);
const buildScriptPath = path.join(
  process.cwd(),
  "scripts",
  "build-macos-privileged-helper.ts",
);
const controlSourcePath = path.join(
  process.cwd(),
  "native",
  "macos-helper",
  "control",
  "main.swift",
);
const controlBuildScriptPath = path.join(
  process.cwd(),
  "scripts",
  "build-macos-helper-control.ts",
);
const enumerateBuildScriptPath = path.join(
  process.cwd(),
  "scripts",
  "build-macos-helper-enumerate.ts",
);
const xpcEnumerateSourcePath = path.join(
  process.cwd(),
  "native",
  "macos-helper",
  "xpc-enumerate",
  "main.swift",
);
const xpcEnumerateBuildScriptPath = path.join(
  process.cwd(),
  "scripts",
  "build-macos-helper-xpc-enumerate.ts",
);
const serviceManagementProbeBuildScriptPath = path.join(
  process.cwd(),
  "scripts",
  "build-macos-service-management-probe.ts",
);
const privilegedTraversalSourcePath = path.join(
  process.cwd(),
  "native",
  "macos-helper",
  "privileged-helper",
  "enumerateTraversal.swift",
);
const packageJsonPath = path.join(process.cwd(), "package.json");

function writeMinimalPrivilegedHelperSources(projectRoot: string): void {
  const helperSourcePath = path.join(
    projectRoot,
    "native",
    "macos-helper",
    "privileged-helper",
    "main.swift",
  );
  const traversalSourcePath = path.join(
    projectRoot,
    "native",
    "macos-helper",
    "privileged-helper",
    "enumerateTraversal.swift",
  );

  fs.mkdirSync(path.dirname(helperSourcePath), { recursive: true });
  fs.writeFileSync(
    helperSourcePath,
    'let expectedClientTeamId = "TEAMID_NOT_CONFIGURED"\n',
  );
  fs.writeFileSync(traversalSourcePath, "func enumeratePrivileged() {}\n");
}

function writeMinimalXpcEnumerateSource(projectRoot: string): void {
  const sourcePath = path.join(
    projectRoot,
    "native",
    "macos-helper",
    "xpc-enumerate",
    "main.swift",
  );

  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "print(\"xpc enumerate\")\n");
}

function writeMinimalEnumerateSource(projectRoot: string): void {
  const sourcePath = path.join(
    projectRoot,
    "native",
    "macos-helper",
    "enumerate",
    "main.swift",
  );

  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "print(\"enumerate\")\n");
}

function writeMinimalServiceManagementProbeSource(projectRoot: string): void {
  const sourcePath = path.join(
    projectRoot,
    "native",
    "macos-helper",
    "service-management-probe",
    "main.swift",
  );

  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "print(\"service management probe\")\n");
}

function writeMinimalHelperControlSource(projectRoot: string): void {
  const sourcePath = path.join(
    projectRoot,
    "native",
    "macos-helper",
    "control",
    "main.swift",
  );

  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "print(\"helper control\")\n");
}

function writeFakeSwiftCompiler(binDir: string): string {
  const swiftcPath = path.join(binDir, "swiftc");

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    swiftcPath,
    [
      "#!/bin/sh",
      "if [ -n \"$FAKE_SWIFTC_ARGS_LOG\" ]; then",
      "  printf '%s\\n' \"$@\" > \"$FAKE_SWIFTC_ARGS_LOG\"",
      "fi",
      "out=\"\"",
      "while [ \"$#\" -gt 0 ]; do",
      "  if [ \"$1\" = \"-o\" ]; then",
      "    shift",
      "    out=\"$1\"",
      "  fi",
      "  shift",
      "done",
      "mkdir -p \"$(dirname \"$out\")\"",
      "printf 'MOCK_HELPER' > \"$out\"",
      "chmod 755 \"$out\"",
      "exit 0",
      "",
    ].join("\n"),
  );
  fs.chmodSync(swiftcPath, 0o755);

  return swiftcPath;
}

describe("macOS privileged helper executable", () => {
  it("defines a launchd Mach service XPC listener guarded by caller signing requirement", () => {
    const source = fs.readFileSync(sourcePath, "utf8");

    expect(source).toContain(`let helperMachServiceName = "${DISK_SCAN_HELPER_LABEL}"`);
    expect(source).toContain("NSXPCListener(machServiceName: helperMachServiceName)");
    expect(source).toContain("setConnectionCodeSigningRequirement");
    expect(source).toContain(`identifier "${DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER}"`);
    expect(source).toContain("anchor apple generic");
    expect(source).toContain("certificate leaf[subject.OU]");
    expect(source).toContain("shouldAcceptNewConnection");
    expect(source).toContain("@objc(DiskVisualizerPrivilegedHelperProtocol)");
    expect(source).toContain("func healthCheck(_ reply:");
    expect(source).toContain("func getVersion(_ reply:");
    expect(source).toContain("func enumerate(_ requestJson:");
    expect(source).toContain("withReply reply:");
    expect(source).toContain("HelperEnumerateRequest");
    expect(source).toContain("operation == \"scan.enumerate\"");
    expect(source).toContain("validateEnumerateRequest");
    expect(source).toContain("isAbsoluteNormalizedPath");
    expect(source).toContain("rootOutsidePlannedRoots");
    expect(source).toContain("request.payload.plannedRoots.contains(request.payload.root)");
    expect(source).toContain("requestId.count >= 1 && requestId.count <= 128");
    expect(source).toContain('"type": "ready"');
    expect(source).toContain('"type": "error"');
    expect(source).toContain('"E_INVALID_REQUEST"');
    expect(source).toContain('"E_HELPER_INTERNAL"');
    expect(source).toContain("newConnection.exportedInterface");
    expect(source).toContain("newConnection.exportedObject");
    expect(source).toContain("newConnection.resume()");
    expect(source).toContain("return true");
    expect(source).toContain("expectedClientTeamId == \"TEAMID_NOT_CONFIGURED\"");
    expect(source).toContain("newConnection.invalidate()");
    expect(source).toContain("return false");
    expect(source).not.toContain("shell");
    expect(source).not.toContain("Process()");
    expect(source).not.toContain("removeItem");
    expect(source).not.toContain("chmod");
    expect(source).not.toContain("chown");
    expect(source).not.toContain("normalizePath(");
  });

  it("builds the privileged helper executable into the LaunchServices source path", () => {
    const source = fs.readFileSync(buildScriptPath, "utf8");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(source).toContain('"native"');
    expect(source).toContain('"macos-helper"');
    expect(source).toContain('"privileged-helper"');
    expect(source).toContain('"main.swift"');
    expect(source).toContain('"enumerateTraversal.swift"');
    expect(source).toContain('"resources"');
    expect(source).toContain('"helper"');
    expect(source).toContain('"LaunchServices"');
    expect(source).toContain(`"${DISK_SCAN_HELPER_LABEL}"`);
    expect(source).toContain("SCAN_HELPER_TEAM_ID");
    expect(source).toContain("TEAMID_NOT_CONFIGURED");
    expect(source).toContain("anchor apple generic");
    expect(source).toContain(".requirement.json");
    expect(packageJson.scripts).toMatchObject({
      "build:native:privileged-helper":
        "bun run scripts/build-macos-privileged-helper.ts",
    });
  });

  it("builds privileged helper artifacts under an explicit project root", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-build-cwd-"),
    );
    const artifactRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-build-artifacts-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-build-bin-"),
    );
    const artifactOutputPath = path.join(
      artifactRoot,
      "resources",
      "helper",
      "LaunchServices",
      DISK_SCAN_HELPER_LABEL,
    );
    const artifactGeneratedSourcePath = path.join(
      artifactRoot,
      ".tmp",
      "swift-generated",
      "privileged-helper-main.swift",
    );
    const artifactModuleCachePath = path.join(
      artifactRoot,
      ".tmp",
      "swift-module-cache",
    );
    const cwdGeneratedSourcePath = path.join(
      cwdRoot,
      ".tmp",
      "swift-generated",
      "privileged-helper-main.swift",
    );
    const argsLogPath = path.join(artifactRoot, "swiftc-args.log");
    const cwdOutputPath = path.join(
      cwdRoot,
      "resources",
      "helper",
      "LaunchServices",
      DISK_SCAN_HELPER_LABEL,
    );

    try {
      writeMinimalPrivilegedHelperSources(cwdRoot);
      writeMinimalPrivilegedHelperSources(artifactRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        [
          "run",
          buildScriptPath,
          "--project-root",
          artifactRoot,
        ],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            FAKE_SWIFTC_ARGS_LOG: argsLogPath,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
            SCAN_HELPER_TEAM_ID: "ABCDE12345",
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(fs.existsSync(artifactOutputPath)).toBe(true);
      expect(fs.existsSync(`${artifactOutputPath}.requirement.json`)).toBe(true);
      expect(fs.existsSync(artifactGeneratedSourcePath)).toBe(true);
      expect(fs.existsSync(artifactModuleCachePath)).toBe(true);
      expect(fs.existsSync(cwdOutputPath)).toBe(false);
      expect(fs.existsSync(cwdGeneratedSourcePath)).toBe(false);
      expect(fs.readFileSync(argsLogPath, "utf8")).toContain(
        artifactGeneratedSourcePath,
      );
      expect(
        JSON.parse(fs.readFileSync(`${artifactOutputPath}.requirement.json`, "utf8")),
      ).toEqual({
        ready: true,
        requirement:
          'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
        teamId: "ABCDE12345",
      });
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(artifactRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when privileged helper build project root is missing", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-build-missing-cwd-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-build-missing-bin-"),
    );

    try {
      writeMinimalPrivilegedHelperSources(cwdRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        ["run", buildScriptPath, "--project-root"],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --project-root");
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when privileged helper build project root is followed by another option", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-build-option-cwd-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-build-option-bin-"),
    );

    try {
      writeMinimalPrivilegedHelperSources(cwdRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        [
          "run",
          buildScriptPath,
          "--project-root",
          "--team-id",
        ],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --project-root");
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("generates a real Team ID source that can reach the exported XPC surface", () => {
    const source = fs.readFileSync(sourcePath, "utf8");
    const generatedSource = source.replace("TEAMID_NOT_CONFIGURED", "ABCDE12345");

    expect(generatedSource).toContain('let expectedClientTeamId = "ABCDE12345"');
    expect(generatedSource).toContain('expectedClientTeamId == "TEAMID_NOT_CONFIGURED"');
    expect(generatedSource).toContain("newConnection.exportedInterface");
    expect(generatedSource).toContain("newConnection.exportedObject");
    expect(generatedSource).toContain("newConnection.resume()");
    expect(generatedSource).toContain("return true");
  });

  it("implements privileged helper scan.enumerate as read-only traversal events", () => {
    const mainSource = fs.readFileSync(sourcePath, "utf8");
    const traversalSource = fs.readFileSync(privilegedTraversalSourcePath, "utf8");

    expect(mainSource).not.toContain("scan.enumerate traversal is not implemented");
    expect(mainSource).toContain("enumeratePrivileged(request)");
    expect(traversalSource).toContain("FileManager.default.enumerator");
    expect(traversalSource).toContain("entry_batch");
    expect(traversalSource).toContain("progress");
    expect(traversalSource).toContain("coverage");
    expect(traversalSource).toContain("warn");
    expect(traversalSource).toContain("done");
    expect(traversalSource).toContain("maxDepth");
    expect(traversalSource).toContain("sameDeviceOnly");
    expect(traversalSource).toContain("skipDescendants");
    expect(traversalSource).toContain("E_HELPER_PERMISSION");
    expect(traversalSource).toContain("E_IO");
    expect(traversalSource).toContain("E_SCOPE");
    expect(traversalSource).toContain("counters.ioFailures += 1");
    expect(traversalSource).toContain("if let modificationDate");
    expect(traversalSource).toContain("if let resourceIdentifier");
    expect(traversalSource).toContain("if let entryDeviceId");
    expect(traversalSource).not.toContain("removeItem");
    expect(traversalSource).not.toContain("write(");
    expect(traversalSource).not.toContain("Process()");
    expect(traversalSource).not.toContain("chmod");
    expect(traversalSource).not.toContain("chown");
    expect(traversalSource).not.toContain("as Any");
  });

  it("builds a helper control command that probes only the privileged helper XPC control surface", () => {
    const source = fs.readFileSync(controlSourcePath, "utf8");

    expect(source).toContain("@objc(DiskVisualizerPrivilegedHelperProtocol)");
    expect(source).toContain("func healthCheck(_ reply:");
    expect(source).toContain("func getVersion(_ reply:");
    expect(source).toContain("NSXPCConnection(");
    expect(source).toContain("machServiceName: helperMachServiceName");
    expect(source).toContain("remoteObjectInterface");
    expect(source).toContain("remoteObjectProxyWithErrorHandler");
    expect(source).toContain("helper.healthCheck");
    expect(source).toContain("helper.getVersion");
    expect(source).toContain("helperProtocolErrorCode");
    expect(source).toContain('"E_INVALID_REQUEST"');
    expect(source).toContain('"E_HELPER_INTERNAL"');
    expect(source).not.toContain("E_XPC_CONTROL_FAILED");
    expect(source).toContain('"type": "ready"');
    expect(source).toContain('"type": "done"');
    expect(source).toContain('"type": "error"');
    expect(source).not.toContain("scan.enumerate");
    expect(source).not.toContain("enumerate(");
  });

  it("builds helper control artifacts under an explicit project root", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-control-build-cwd-"),
    );
    const artifactRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-control-build-artifacts-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-control-build-bin-"),
    );
    const artifactOutputPath = path.join(
      artifactRoot,
      "resources",
      "bin",
      "helper-control-macos",
    );
    const cwdOutputPath = path.join(
      cwdRoot,
      "resources",
      "bin",
      "helper-control-macos",
    );
    const artifactModuleCachePath = path.join(
      artifactRoot,
      ".tmp",
      "swift-module-cache",
    );
    const argsLogPath = path.join(artifactRoot, "swiftc-args.log");

    try {
      writeMinimalHelperControlSource(cwdRoot);
      writeMinimalHelperControlSource(artifactRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        [
          "run",
          controlBuildScriptPath,
          "--project-root",
          artifactRoot,
        ],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            FAKE_SWIFTC_ARGS_LOG: argsLogPath,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(fs.existsSync(artifactOutputPath)).toBe(true);
      expect(fs.existsSync(artifactModuleCachePath)).toBe(true);
      expect(fs.existsSync(cwdOutputPath)).toBe(false);
      expect(fs.readFileSync(argsLogPath, "utf8")).toContain(
        path.join(
          artifactRoot,
          "native",
          "macos-helper",
          "control",
          "main.swift",
        ),
      );
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(artifactRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when helper control build project root is missing", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-control-build-missing-cwd-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-control-build-missing-bin-"),
    );

    try {
      writeMinimalHelperControlSource(cwdRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        ["run", controlBuildScriptPath, "--project-root"],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --project-root");
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when helper control build project root is followed by another option", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-control-build-option-cwd-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-control-build-option-bin-"),
    );

    try {
      writeMinimalHelperControlSource(cwdRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        [
          "run",
          controlBuildScriptPath,
          "--project-root",
          "--other",
        ],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --project-root");
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("builds helper enumerate artifacts under an explicit project root", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-enumerate-build-cwd-"),
    );
    const artifactRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-enumerate-build-artifacts-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-enumerate-build-bin-"),
    );
    const artifactOutputPath = path.join(
      artifactRoot,
      "resources",
      "bin",
      "helper-enumerate-macos",
    );
    const cwdOutputPath = path.join(
      cwdRoot,
      "resources",
      "bin",
      "helper-enumerate-macos",
    );
    const artifactModuleCachePath = path.join(
      artifactRoot,
      ".tmp",
      "swift-module-cache",
    );
    const argsLogPath = path.join(artifactRoot, "swiftc-args.log");

    try {
      writeMinimalEnumerateSource(cwdRoot);
      writeMinimalEnumerateSource(artifactRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        [
          "run",
          enumerateBuildScriptPath,
          "--project-root",
          artifactRoot,
        ],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            FAKE_SWIFTC_ARGS_LOG: argsLogPath,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(fs.existsSync(artifactOutputPath)).toBe(true);
      expect(fs.existsSync(artifactModuleCachePath)).toBe(true);
      expect(fs.existsSync(cwdOutputPath)).toBe(false);
      expect(fs.readFileSync(argsLogPath, "utf8")).toContain(
        path.join(
          artifactRoot,
          "native",
          "macos-helper",
          "enumerate",
          "main.swift",
        ),
      );
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(artifactRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when helper enumerate build project root is missing", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-enumerate-build-missing-cwd-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-enumerate-build-missing-bin-"),
    );

    try {
      writeMinimalEnumerateSource(cwdRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        ["run", enumerateBuildScriptPath, "--project-root"],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --project-root");
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when helper enumerate build project root is followed by another option", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-enumerate-build-option-cwd-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-enumerate-build-option-bin-"),
    );

    try {
      writeMinimalEnumerateSource(cwdRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        [
          "run",
          enumerateBuildScriptPath,
          "--project-root",
          "--other",
        ],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --project-root");
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("builds a helper xpc enumerate command that bridges to the privileged helper service", () => {
    const source = fs.readFileSync(xpcEnumerateSourcePath, "utf8");

    expect(source).toContain("@objc(DiskVisualizerPrivilegedHelperProtocol)");
    expect(source).toContain("func enumerate(_ requestJson:");
    expect(source).toContain("withReply reply:");
    expect(source).toContain("NSXPCConnection(");
    expect(source).toContain("machServiceName: helperMachServiceName");
    expect(source).toContain("remoteObjectInterface");
    expect(source).toContain("remoteObjectProxyWithErrorHandler");
    expect(source).toContain("helper.enumerate");
    expect(source).toContain("FileHandle.standardOutput.write");
    expect(source).toContain("boundedMessage");
    expect(source).toContain("prefix(2048)");
    expect(source).toContain('"E_INVALID_REQUEST"');
    expect(source).toContain('"E_HELPER_INTERNAL"');
    expect(source).not.toContain("FileManager.default.enumerator");
    expect(source).not.toContain("removeItem");
    expect(source).not.toContain("Process()");
  });

  it("builds helper xpc enumerate artifacts under an explicit project root", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-xpc-enumerate-build-cwd-"),
    );
    const artifactRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-xpc-enumerate-build-artifacts-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-xpc-enumerate-build-bin-"),
    );
    const artifactOutputPath = path.join(
      artifactRoot,
      "resources",
      "bin",
      "helper-xpc-enumerate-macos",
    );
    const cwdOutputPath = path.join(
      cwdRoot,
      "resources",
      "bin",
      "helper-xpc-enumerate-macos",
    );
    const artifactModuleCachePath = path.join(
      artifactRoot,
      ".tmp",
      "swift-module-cache",
    );
    const argsLogPath = path.join(artifactRoot, "swiftc-args.log");

    try {
      writeMinimalXpcEnumerateSource(cwdRoot);
      writeMinimalXpcEnumerateSource(artifactRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        [
          "run",
          xpcEnumerateBuildScriptPath,
          "--project-root",
          artifactRoot,
        ],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            FAKE_SWIFTC_ARGS_LOG: argsLogPath,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(fs.existsSync(artifactOutputPath)).toBe(true);
      expect(fs.existsSync(artifactModuleCachePath)).toBe(true);
      expect(fs.existsSync(cwdOutputPath)).toBe(false);
      expect(fs.readFileSync(argsLogPath, "utf8")).toContain(
        path.join(
          artifactRoot,
          "native",
          "macos-helper",
          "xpc-enumerate",
          "main.swift",
        ),
      );
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(artifactRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when helper xpc enumerate build project root is missing", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-xpc-enumerate-build-missing-cwd-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-xpc-enumerate-build-missing-bin-"),
    );

    try {
      writeMinimalXpcEnumerateSource(cwdRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        ["run", xpcEnumerateBuildScriptPath, "--project-root"],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --project-root");
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when helper xpc enumerate build project root is followed by another option", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-xpc-enumerate-build-option-cwd-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-xpc-enumerate-build-option-bin-"),
    );

    try {
      writeMinimalXpcEnumerateSource(cwdRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        [
          "run",
          xpcEnumerateBuildScriptPath,
          "--project-root",
          "--other",
        ],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --project-root");
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("builds ServiceManagement probe artifacts under an explicit project root", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-sm-probe-build-cwd-"),
    );
    const artifactRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-sm-probe-build-artifacts-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-sm-probe-build-bin-"),
    );
    const artifactOutputPath = path.join(
      artifactRoot,
      "resources",
      "bin",
      "service-management-probe-macos",
    );
    const cwdOutputPath = path.join(
      cwdRoot,
      "resources",
      "bin",
      "service-management-probe-macos",
    );
    const artifactModuleCachePath = path.join(
      artifactRoot,
      ".tmp",
      "swift-module-cache",
    );
    const argsLogPath = path.join(artifactRoot, "swiftc-args.log");

    try {
      writeMinimalServiceManagementProbeSource(cwdRoot);
      writeMinimalServiceManagementProbeSource(artifactRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        [
          "run",
          serviceManagementProbeBuildScriptPath,
          "--project-root",
          artifactRoot,
        ],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            FAKE_SWIFTC_ARGS_LOG: argsLogPath,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(fs.existsSync(artifactOutputPath)).toBe(true);
      expect(fs.existsSync(artifactModuleCachePath)).toBe(true);
      expect(fs.existsSync(cwdOutputPath)).toBe(false);
      expect(fs.readFileSync(argsLogPath, "utf8")).toContain(
        path.join(
          artifactRoot,
          "native",
          "macos-helper",
          "service-management-probe",
          "main.swift",
        ),
      );
      expect(fs.readFileSync(argsLogPath, "utf8")).toContain(
        "ServiceManagement",
      );
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(artifactRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when ServiceManagement probe build project root is missing", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-sm-probe-build-missing-cwd-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-sm-probe-build-missing-bin-"),
    );

    try {
      writeMinimalServiceManagementProbeSource(cwdRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        ["run", serviceManagementProbeBuildScriptPath, "--project-root"],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --project-root");
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when ServiceManagement probe build project root is followed by another option", () => {
    const cwdRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-sm-probe-build-option-cwd-"),
    );
    const fakeBinDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-sm-probe-build-option-bin-"),
    );

    try {
      writeMinimalServiceManagementProbeSource(cwdRoot);
      writeFakeSwiftCompiler(fakeBinDir);

      const result = spawnSync(
        "bun",
        [
          "run",
          serviceManagementProbeBuildScriptPath,
          "--project-root",
          "--other",
        ],
        {
          cwd: cwdRoot,
          env: {
            ...process.env,
            PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --project-root");
    } finally {
      fs.rmSync(cwdRoot, { force: true, recursive: true });
      fs.rmSync(fakeBinDir, { force: true, recursive: true });
    }
  });
});
