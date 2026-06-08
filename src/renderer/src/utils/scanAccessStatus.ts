import type { ScanCoverage } from "../../../types/contracts";

export interface ScanAccessStatus {
  detail: string;
  title: string;
  tone: "warning";
}

export function getScanAccessStatus(coverage?: ScanCoverage | null): ScanAccessStatus | null {
  if (!coverage) {
    return null;
  }

  if (coverage.blockedByPermission > 0 || coverage.elevationRequired) {
    const blockedCount = coverage.blockedByPermission.toLocaleString();
    return {
      tone: "warning",
      title: "Full Disk Access 필요",
      detail: `권한 때문에 ${blockedCount}개 경로가 빠졌습니다. 시스템 설정에서 앱의 전체 디스크 접근 권한을 허용해야 합니다.`,
    };
  }

  if (coverage.estimated === true) {
    return {
      tone: "warning",
      title: "Preview estimate",
      detail: "빠른 스캔 추정치가 포함되어 있습니다. 정확한 용량 확인은 Exact Recheck를 실행하세요.",
    };
  }

  return null;
}
