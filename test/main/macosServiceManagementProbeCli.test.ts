/* @vitest-environment node */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = path.join(
  process.cwd(),
  "native",
  "macos-helper",
  "service-management-probe",
  "main.swift",
);

describe("macOS ServiceManagement probe CLI", () => {
  it("uses SMAppService daemon status for the helper LaunchDaemon plist", () => {
    const source = fs.readFileSync(sourcePath, "utf8");

    expect(source).toContain("import ServiceManagement");
    expect(source).toContain(
      'SMAppService.daemon(plistName: "com.example.diskvisualizer.privileged-helper.plist")',
    );
    expect(source).toContain("service.status");
  });

  it("maps SMAppService statuses to the main process probe schema", () => {
    const source = fs.readFileSync(sourcePath, "utf8");

    expect(source).toContain('case .enabled: emit(state: "registered"');
    expect(source).toContain('case .requiresApproval: emit(state: "pending-approval"');
    expect(source).toContain('case .notRegistered: emit(state: "not-installed"');
    expect(source).toContain('case .notFound: emit(state: "not-installed"');
  });
});
