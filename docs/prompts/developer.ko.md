# Developer Prompt (한국어 v3)

이 문서는 구현 단계 엔지니어링 규칙이다. 보안/계약 원문은 [system.ko.md](/Users/user/ab/docs/prompts/system.ko.md)를 단일 기준으로 따른다.

## 1) electron-vite 최소 엔트리 규격 (고정)

아래 5개 경로를 최소 필수 엔트리로 유지한다.

1. `src/main/index.ts`
2. `src/preload/index.mjs`
3. `src/renderer/index.html`
4. `src/renderer/src/main.tsx`
5. `src/renderer/src/App.tsx`

역할 고정:

- `main.tsx`: React mount 엔트리.
- `App.tsx`: UI 루트 컴포넌트.

## 2) 프로세스별 디렉터리 정책

```text
src/
 ├ main/
 │  ├ services/
 │  ├ manager/
 │  ├ database/
 │  ├ handler/
 │  ├ core/
 │  ├ utils/
 │  └ lifecycle/
 ├ preload/
 ├ renderer/
 ├ shared/
 │  ├ constants/
 │  ├ platform/
 │  ├ schemas/
 │  └ utils/
 └ types/
```

원칙:

- main 비즈니스 로직을 renderer로 올리지 않는다.
- 공용 계약은 `shared/schemas/*` + `types/*`에 둔다.
- 한쪽 전용 코드는 해당 레이어 내부에 둔다.

## 3) 기능 구현 사이클 (템플릿 고정)

1. Shared 계약 정의
2. Preload API 노출
3. Main handler/service 구현
4. Renderer 소비

실행 규칙:

- Shared 계약 없이 preload/main/renderer를 먼저 구현하지 않는다.
- Renderer는 `window.electronAPI`만 호출한다.

## 4) 스캔 파이프라인 표준

```text
Walker -> Stat -> Aggregator -> Compressor -> UI Stream
```

각 단계 I/O 계약을 타입 + 스키마로 함께 관리한다.

### 4.1 표준 이벤트 타입

```ts
type NodeKind = "file" | "dir" | "symlink";

type WalkEntry = {
  path: string;
  kind: NodeKind;
  parentPath: string;
  depth: number;
};

type StatRecord = {
  path: string;
  size: number;
  mtime: number;
  isSymlink: boolean;
  inode?: string;
};

type AggDelta = {
  nodePath: string;
  sizeDelta: number;
  countDelta: number;
};

type CompressedTreePatch = {
  nodesAdded: string[];
  nodesUpdated: string[];
  nodesPruned: string[];
};

type ScanProgress = {
  scanId: string;
  phase: "walking" | "aggregating" | "compressing" | "finalizing";
  scannedCount: number;
  totalBytes: number;
  currentPath?: string;
};

type ScanProgressBatch = {
  progress: ScanProgress;
  deltas: AggDelta[];
  patches: CompressedTreePatch[];
};
```

### 4.2 저장 위치 규칙

- Zod 스키마: `shared/schemas/scan.ts`
- TS 타입 alias: `types/scan.ts`
- IPC 채널 상수: `shared/constants/ipcChannels.ts`

## 5) 스캔 모드 원칙

- 기본: `portable` (크로스플랫폼 공통 구현)
- 옵션: `portable_plus_os_accel`

옵션 가속 분리:

- Windows: `windows.usn_journal`
- macOS: `macos.fsevents_incremental`

주의:

- OS 가속은 기본 비활성.
- 옵션 모드는 보안/권한/호환성 리스크를 별도 표기.

## 6) IPC/오류 처리 실행 규칙

- 요청/응답/이벤트 payload는 Zod 검증 필수.
- 절대 차단 경로: `E_PROTECTED_PATH`.
- 옵트인 필요 경로: `E_OPTIN_REQUIRED`.
- 선행 단계 위반: `E_PHASE_GATE`.

권장 이벤트:

- `scan:start`
- `scan:pause`
- `scan:resume`
- `scan:cancel`
- `scan:progress-batch`
- `scan:complete`
- `scan:error`

## 7) 성능/메모리 규칙

- BFS + 비동기 순회 + 증분 집계.
- 진행률 이벤트는 배치/스로틀링(예: 100~500ms).
- 대규모 트리에서 top-N + `__other__` 압축 전략 권장.
- cancel/pause/resume 상태 전이 필수.

## 8) 단계 게이트

- `packaging`은 최소 `security -> ipc -> scanner` 완료 후 진행.
- 게이트 위반 시 구현 강행 금지, 재정렬안과 `E_PHASE_GATE` 먼저 제시.

## 9) 응답 작성 규칙

각 응답에 포함:

1. 현재 phase
2. 변경 대상 경로
3. 보안 검증
4. 테스트 계획
5. 단계 게이트 결과
6. 근거 분류(확정/추정)
