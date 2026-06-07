/* @vitest-environment node */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildHelperIdentityAudit } from "../../src/main/services/helper/helperIdentityAudit";
import { DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH } from "../../src/main/services/helper/helperRegistration";

describe("helperIdentityAudit", () => {
  it("reports blocked identity evidence while placeholder listener metadata exists", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-identity-audit-"),
    );
    const metadataPath = path.join(
      projectRoot,
      DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
    );

    try {
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
      fs.writeFileSync(
        metadataPath,
        JSON.stringify({
          ready: false,
          requirement:
            'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "TEAMID_NOT_CONFIGURED"',
          teamId: "TEAMID_NOT_CONFIGURED",
        }),
      );

      expect(buildHelperIdentityAudit({ env: {}, projectRoot })).toEqual({
        appBundleIdentifier: null,
        appBundleIdentifierReady: false,
        blockers: [
          "team-id-missing",
          "production-bundle-identifier-missing",
          "designated-requirement-missing",
          "privileged-helper-listener-requirement-missing",
        ],
        designatedRequirement: null,
        designatedRequirementReady: false,
        listenerRequirement:
          'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "TEAMID_NOT_CONFIGURED"',
        listenerRequirementMetadataFound: true,
        listenerRequirementReady: false,
        listenerRequirementTeamId: "TEAMID_NOT_CONFIGURED",
        status: "blocked",
        teamId: null,
        teamIdReady: false,
      });
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("reports ready only when identity and listener metadata match", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-identity-audit-ready-"),
    );
    const metadataPath = path.join(
      projectRoot,
      DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
    );
    const appBundleIdentifier = "com.acme.diskvisualizer";
    const requirement =
      'identifier "com.acme.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"';

    try {
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
      fs.writeFileSync(
        metadataPath,
        JSON.stringify({
          ready: true,
          requirement,
          teamId: "ABCDE12345",
        }),
      );

      expect(buildHelperIdentityAudit({
        appBundleIdentifier,
        designatedRequirement: requirement,
        projectRoot,
        teamId: "ABCDE12345",
      })).toEqual({
        appBundleIdentifier,
        appBundleIdentifierReady: true,
        blockers: [],
        designatedRequirement: requirement,
        designatedRequirementReady: true,
        listenerRequirement: requirement,
        listenerRequirementMetadataFound: true,
        listenerRequirementReady: true,
        listenerRequirementTeamId: "ABCDE12345",
        status: "ready",
        teamId: "ABCDE12345",
        teamIdReady: true,
      });
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });
});
