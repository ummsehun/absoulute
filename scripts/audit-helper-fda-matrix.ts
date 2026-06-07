import { buildHelperFdaMatrixAudit } from "../src/main/services/helper/helperFdaValidationMatrix";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

const outputPath = resolveAuditOutputPath(process.argv.slice(2));
const audit = buildHelperFdaMatrixAudit({
  projectRoot: resolveProjectRoot(process.argv.slice(2)),
});
const auditJson = JSON.stringify(audit, null, 2);

console.log(auditJson);
writeAuditOutputFile(outputPath, auditJson);

if (audit.status !== "ready") {
  process.exitCode = 1;
}

function resolveProjectRoot(rawArgs: string[]): string | undefined {
  const projectRootIndex = rawArgs.indexOf("--project-root");
  if (projectRootIndex < 0) {
    return undefined;
  }

  const projectRoot = rawArgs[projectRootIndex + 1]?.trim();
  if (!projectRoot) {
    throw new Error("missing value for --project-root");
  }

  return projectRoot;
}
