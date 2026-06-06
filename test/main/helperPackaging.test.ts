/* @vitest-environment node */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getHelperRegistrationContract } from "../../src/main/services/helper/helperRegistration";

const projectRoot = process.cwd();
const electronBuilderConfigPath = path.join(projectRoot, "electron-builder.json");
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
    expect(plist).toContain(
      `<string>/Library/PrivilegedHelperTools/${contract.helperLabel}</string>`,
    );
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
});
