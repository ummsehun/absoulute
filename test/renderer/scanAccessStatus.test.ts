/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import type { ScanCoverage } from "../../src/types/contracts";
import { getScanAccessStatus } from "../../src/renderer/src/utils/scanAccessStatus";

describe("getScanAccessStatus", () => {
  it("reports Full Disk Access when permission-blocked paths are present", () => {
    const coverage: ScanCoverage = {
      scanned: 100,
      blockedByPolicy: 0,
      blockedByPermission: 3,
      skippedByScope: 0,
      nonRemovableVisible: 0,
      elevationRequired: true,
      completeness: "partial_permission",
    };

    expect(getScanAccessStatus(coverage)).toEqual({
      tone: "warning",
      title: "Full Disk Access 필요",
      detail: "권한 때문에 3개 경로가 빠졌습니다. 시스템 설정에서 앱의 전체 디스크 접근 권한을 허용해야 합니다.",
    });
  });

  it("returns null when coverage is exact and permission is available", () => {
    const coverage: ScanCoverage = {
      scanned: 100,
      blockedByPolicy: 0,
      blockedByPermission: 0,
      skippedByScope: 0,
      nonRemovableVisible: 0,
      elevationRequired: false,
      completeness: "exact",
    };

    expect(getScanAccessStatus(coverage)).toBeNull();
  });

  it("reports preview estimates when coverage is estimated without permission gaps", () => {
    const coverage: ScanCoverage = {
      scanned: 100,
      blockedByPolicy: 0,
      blockedByPermission: 0,
      skippedByScope: 0,
      nonRemovableVisible: 0,
      elevationRequired: false,
      completeness: "exact",
      estimated: true,
    };

    expect(getScanAccessStatus(coverage)).toEqual({
      tone: "warning",
      title: "Preview estimate",
      detail: "빠른 스캔 추정치가 포함되어 있습니다. 정확한 용량 확인은 Exact Recheck를 실행하세요.",
    });
  });
});
