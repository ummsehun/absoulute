import os from "node:os";
import {
  createPathPolicyClassifier,
  resolveEffectivePathAccess,
  type EffectivePathAccess,
} from "../../core/securityPolicy";
import { pathIntersectsPolicyPath } from "../../../shared/domain/pathPolicy";
import type { ScanJob } from "./scanSessionTypes";

export interface ScanPathAccessRefreshResult {
  removedDeniedRoots: string[];
}

export async function refreshScanJobPathAccess(
  job: ScanJob,
  platform: NodeJS.Platform = os.platform(),
  homeDirectory: string = os.homedir(),
): Promise<ScanPathAccessRefreshResult> {
  const effectiveAccess = await resolveEffectivePathAccess(
    job.rootPath,
    platform,
    homeDirectory,
  );
  return applyEffectivePathAccess(job, effectiveAccess, platform, homeDirectory);
}

export function applyEffectivePathAccess(
  job: ScanJob,
  effectiveAccess: EffectivePathAccess,
  platform: NodeJS.Platform = os.platform(),
  homeDirectory: string = os.homedir(),
): ScanPathAccessRefreshResult {
  const nextDeniedRoots = new Set(effectiveAccess.deniedPermissionRoots);
  const removedDeniedRoots = job.deniedPermissionRoots.filter(
    (deniedRoot) => !nextDeniedRoots.has(deniedRoot),
  );

  job.deniedPermissionRoots = effectiveAccess.deniedPermissionRoots;
  job.nonRemovableRoots = effectiveAccess.nonRemovableRoots;
  job.pathClassifier = createPathPolicyClassifier(
    platform,
    homeDirectory,
    effectiveAccess,
  );

  for (const removedRoot of removedDeniedRoots) {
    if (pathIntersectsPolicyPath(job.rootPath, removedRoot)) {
      job.pendingPermissionRescanRoots.add(removedRoot);
    }
  }

  if (job.deniedPermissionRoots.length === 0 && removedDeniedRoots.length > 0) {
    job.elevationRequired = false;
    job.blockedByPermissionCount = 0;
    job.permissionErrorCount = 0;
  }

  return { removedDeniedRoots };
}
