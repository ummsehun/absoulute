/* @vitest-environment node */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
  getHelperRegistrationContract,
} from "../../src/main/services/helper/helperRegistration";

const projectRoot = process.cwd();
const electronBuilderConfigPath = path.join(projectRoot, "electron-builder.json");
const packageJsonPath = path.join(projectRoot, "package.json");
const launchDaemonSourcePath = path.join(
  projectRoot,
  "resources",
  "helper",
  "LaunchDaemons",
  "com.example.diskvisualizer.privileged-helper.plist",
);

describe("helper packaging", () => {
  it("keeps the LaunchDaemon plist aligned with the helper registration contract", () => {
    const contract = getHelperRegistrationContract();
    const plist = fs.readFileSync(launchDaemonSourcePath, "utf8");

    expect(plist).toContain(`<string>${contract.helperLabel}</string>`);
    expect(plist).toContain("<key>BundleProgram</key>");
    expect(plist).toContain(
      `<string>${contract.helperExecutableBundleRelativePath}</string>`,
    );
    expect(plist).not.toContain("/Library/PrivilegedHelperTools/");
    expect(plist).not.toContain("<key>ProgramArguments</key>");
  });

  it("copies the helper LaunchDaemon plist into the macOS app bundle content directory", () => {
    const contract = getHelperRegistrationContract();
    const config = JSON.parse(
      fs.readFileSync(electronBuilderConfigPath, "utf8"),
    ) as {
      mac?: {
        extraFiles?: Array<{
          filter?: string[];
          from?: string;
          to?: string;
        }>;
      };
    };

    expect(config.mac?.extraFiles).toContainEqual({
      from: "resources/helper/LaunchDaemons",
      to: "Library/LaunchDaemons",
      filter: [contract.launchDaemonPlistName],
    });
  });

  it("keeps the Electron app id aligned with the helper registration contract", () => {
    const contract = getHelperRegistrationContract();
    const config = JSON.parse(
      fs.readFileSync(electronBuilderConfigPath, "utf8"),
    ) as {
      appId?: string;
    };

    expect(config.appId).toBe(contract.appBundleIdentifier);
  });

  it("copies the privileged helper executable into the macOS app bundle content directory", () => {
    const contract = getHelperRegistrationContract();
    const config = JSON.parse(
      fs.readFileSync(electronBuilderConfigPath, "utf8"),
    ) as {
      mac?: {
        extraFiles?: Array<{
          filter?: string[];
          from?: string;
          to?: string;
        }>;
      };
    };

    expect(config.mac?.extraFiles).toContainEqual({
      from: path.dirname(DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH),
      to: "MacOS",
      filter: [
        contract.helperLabel,
        `${contract.helperLabel}.requirement.json`,
      ],
    });
  });

  it("defines macOS hardened runtime and entitlements before packaging evidence is accepted", () => {
    const config = JSON.parse(
      fs.readFileSync(electronBuilderConfigPath, "utf8"),
    ) as {
      mac?: {
        entitlements?: string;
        entitlementsInherit?: string;
        hardenedRuntime?: boolean;
      };
    };

    expect(config.mac).toMatchObject({
      hardenedRuntime: true,
      entitlements: "resources/entitlements/mac.plist",
      entitlementsInherit: "resources/entitlements/mac.inherit.plist",
    });
    expect(
      fs.existsSync(path.join(projectRoot, "resources", "entitlements", "mac.plist")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(projectRoot, "resources", "entitlements", "mac.inherit.plist")),
    ).toBe(true);
  });

  it("packages the ServiceManagement probe binary as a native resource", () => {
    const config = JSON.parse(
      fs.readFileSync(electronBuilderConfigPath, "utf8"),
    ) as {
      extraResources?: Array<{
        filter?: string[];
        from?: string;
        to?: string;
      }>;
    };

    expect(config.extraResources).toContainEqual({
      from: "resources/bin",
      to: "bin",
      filter: expect.arrayContaining(["service-management-probe-macos"]),
    });
  });

  it("packages the macOS helper enumerate binary as a native resource", () => {
    const config = JSON.parse(
      fs.readFileSync(electronBuilderConfigPath, "utf8"),
    ) as {
      extraResources?: Array<{
        filter?: string[];
        from?: string;
        to?: string;
      }>;
    };

    expect(config.extraResources).toContainEqual({
      from: "resources/bin",
      to: "bin",
      filter: expect.arrayContaining(["helper-enumerate-macos"]),
    });
  });

  it("packages the macOS helper control binary as a native resource", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const config = JSON.parse(
      fs.readFileSync(electronBuilderConfigPath, "utf8"),
    ) as {
      extraResources?: Array<{
        filter?: string[];
        from?: string;
        to?: string;
      }>;
    };

    expect(packageJson.scripts).toMatchObject({
      "build:native:helper-control":
        "bun run scripts/build-macos-helper-control.ts",
    });
    expect(
      fs.existsSync(
        path.join(projectRoot, "native", "macos-helper", "control", "main.swift"),
      ),
    ).toBe(true);
    expect(config.extraResources).toContainEqual({
      from: "resources/bin",
      to: "bin",
      filter: expect.arrayContaining(["helper-control-macos"]),
    });
  });

  it("packages the macOS helper xpc enumerate bridge as a native resource", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const config = JSON.parse(
      fs.readFileSync(electronBuilderConfigPath, "utf8"),
    ) as {
      extraResources?: Array<{
        filter?: string[];
        from?: string;
        to?: string;
      }>;
    };

    expect(packageJson.scripts).toMatchObject({
      "build:native:helper-xpc-enumerate":
        "bun run scripts/build-macos-helper-xpc-enumerate.ts",
    });
    expect(
      fs.existsSync(
        path.join(projectRoot, "native", "macos-helper", "xpc-enumerate", "main.swift"),
      ),
    ).toBe(true);
    expect(config.extraResources).toContainEqual({
      from: "resources/bin",
      to: "bin",
      filter: expect.arrayContaining(["helper-xpc-enumerate-macos"]),
    });
  });

  it("verifies macOS code signatures after building the packaged app", () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["verify:mac-signing"]).toBe(
      "bun run scripts/verify-mac-codesign.ts",
    );
    expect(packageJson.scripts?.["build:mac"]).toContain("pnpm verify:mac-signing");
  });
});
