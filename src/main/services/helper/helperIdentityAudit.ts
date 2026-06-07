import fs from "node:fs";
import path from "node:path";
import {
  DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
  HELPER_APP_BUNDLE_ID_ENV,
  HELPER_DESIGNATED_REQUIREMENT_ENV,
  HELPER_TEAM_ID_ENV,
  isProductionAppBundleIdentifier,
  isValidAppleTeamId,
  isValidDesignatedRequirement,
  resolvePrivilegedHelperListenerRequirementEvidence,
  type HelperRegistrationBlocker,
} from "./helperRegistration";

export interface HelperIdentityAudit {
  appBundleIdentifier: string | null;
  appBundleIdentifierReady: boolean;
  blockers: HelperRegistrationBlocker[];
  designatedRequirement: string | null;
  designatedRequirementReady: boolean;
  listenerRequirement: string | null;
  listenerRequirementMetadataFound: boolean;
  listenerRequirementReady: boolean;
  listenerRequirementTeamId: string | null;
  status: "blocked" | "ready";
  teamId: string | null;
  teamIdReady: boolean;
}

export interface BuildHelperIdentityAuditOptions {
  appBundleIdentifier?: string | null;
  designatedRequirement?: string | null;
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
  teamId?: string | null;
}

export function buildHelperIdentityAudit(
  options: BuildHelperIdentityAuditOptions = {},
): HelperIdentityAudit {
  const env = options.env ?? process.env;
  const projectRoot = options.projectRoot ?? process.cwd();
  const appBundleIdentifier = readIdentityValue(
    options.appBundleIdentifier ?? env[HELPER_APP_BUNDLE_ID_ENV],
  );
  const teamId = readIdentityValue(options.teamId ?? env[HELPER_TEAM_ID_ENV]);
  const designatedRequirement = readIdentityValue(
    options.designatedRequirement ?? env[HELPER_DESIGNATED_REQUIREMENT_ENV],
  );
  const appBundleIdentifierReady = isProductionAppBundleIdentifier(
    appBundleIdentifier,
  );
  const teamIdReady = isValidAppleTeamId(teamId);
  const designatedRequirementReady = isValidDesignatedRequirement(
    designatedRequirement,
    teamId,
    appBundleIdentifier,
  );
  const listenerMetadata = readListenerRequirementMetadata(projectRoot);
  const listenerRequirementReady = resolvePrivilegedHelperListenerRequirementEvidence(
    projectRoot,
    teamId,
    appBundleIdentifier,
  );
  const blockers = buildBlockers({
    appBundleIdentifierReady,
    designatedRequirementReady,
    listenerRequirementReady,
    teamIdReady,
  });

  return {
    appBundleIdentifier,
    appBundleIdentifierReady,
    blockers,
    designatedRequirement,
    designatedRequirementReady,
    listenerRequirement: listenerMetadata.requirement,
    listenerRequirementMetadataFound: listenerMetadata.found,
    listenerRequirementReady,
    listenerRequirementTeamId: listenerMetadata.teamId,
    status: blockers.length === 0 ? "ready" : "blocked",
    teamId,
    teamIdReady,
  };
}

function buildBlockers(input: {
  appBundleIdentifierReady: boolean;
  designatedRequirementReady: boolean;
  listenerRequirementReady: boolean;
  teamIdReady: boolean;
}): HelperRegistrationBlocker[] {
  const blockers: HelperRegistrationBlocker[] = [];

  if (!input.teamIdReady) {
    blockers.push("team-id-missing");
  }
  if (!input.appBundleIdentifierReady) {
    blockers.push("production-bundle-identifier-missing");
  }
  if (!input.designatedRequirementReady) {
    blockers.push("designated-requirement-missing");
  }
  if (!input.listenerRequirementReady) {
    blockers.push("privileged-helper-listener-requirement-missing");
  }

  return blockers;
}

function readIdentityValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readListenerRequirementMetadata(projectRoot: string): {
  found: boolean;
  requirement: string | null;
  teamId: string | null;
} {
  try {
    const metadata = JSON.parse(fs.readFileSync(
      path.join(
        projectRoot,
        DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
      ),
      "utf8",
    )) as {
      requirement?: string;
      teamId?: string;
    };

    return {
      found: true,
      requirement: typeof metadata.requirement === "string"
        ? metadata.requirement
        : null,
      teamId: typeof metadata.teamId === "string" ? metadata.teamId : null,
    };
  } catch {
    return {
      found: false,
      requirement: null,
      teamId: null,
    };
  }
}
