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
      title: "추정치 포함",
      detail: "일부 용량은 추정값입니다. 스캔 모드, 권한 상태, helper 상태를 확인하세요.",
    };
  }

  return null;
}
