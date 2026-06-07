import { buildHelperIdentityAudit } from "../src/main/services/helper/helperIdentityAudit";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

const rawArgs = process.argv.slice(2);
const outputPath = resolveAuditOutputPath(rawArgs);
const audit = buildHelperIdentityAudit({
  appBundleIdentifier: resolveOptionalArg(rawArgs, "--app-bundle-id"),
  designatedRequirement: resolveOptionalArg(rawArgs, "--designated-requirement"),
  projectRoot: resolveOptionalArg(rawArgs, "--project-root"),
  teamId: resolveOptionalArg(rawArgs, "--team-id"),
});
const auditJson = JSON.stringify(audit, null, 2);

console.log(auditJson);
writeAuditOutputFile(outputPath, auditJson);

if (audit.status !== "ready") {
  process.exitCode = 1;
}

function resolveOptionalArg(
  rawArgs: string[],
  name: string,
): string | undefined {
  const index = rawArgs.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  const value = rawArgs[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    throw new Error(`missing value for ${name}`);
  }

  return value;
}
