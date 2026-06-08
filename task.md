# Task: Helper-Backed Exact Scan Baseline

## Problem Statement

현재 프로젝트는 macOS privileged helper 연동 단계에 있지만, 사용자가 누르는 기본 SCAN 경로는 helper-backed exact scan을 검증하지 않는다.

사용자가 관찰한 `/Users` 같은 중요한 폴더 스캔과 비정상적으로 커 보이는 GB 값은 별개의 문제가 아니라, 현재 기본 스캔 정책과 추정치 표시 방식이 함께 만든 결과일 가능성이 높다.

## Facts

- 프로젝트는 Electron, React, TypeScript, Rust native scanner 기반의 디스크 시각화 앱이다.
- `package.json` 기준 패키지 매니저는 `pnpm@11.5.1`이다.
- macOS 기본 scan root는 `/Users`다.
  - 근거: `src/main/handler/registerIpcHandlers.ts`
- renderer hook의 초기 기본 root도 `/Users`다.
  - 근거: `src/renderer/src/hooks/useScanLogic.ts`
- 기본 SCAN 요청은 `buildDefaultScanRequest`를 사용하며 `preview-first`, `preview`, `responsive` 모드다.
  - 근거: `src/renderer/src/hooks/scanRequestFactory.ts`
  - 검증: `test/renderer/scanRequestFactory.test.ts`
- exact 요청 생성 함수는 이미 존재한다.
  - 근거: `buildExactScanRequest`
- helper scan planner는 macOS `deep + full + exact` 조건에서만 helper를 선택한다.
  - 근거: `src/main/services/helper/helperScanPlanner.ts`
  - 검증: `test/main/helperScanPlanner.test.ts`
- quick stage는 helper가 아니라 native scanner로 유지된다.
  - fallback reason: `quick-stage`
- preview/responsive deep stage는 helper가 아니라 native scanner로 유지된다.
  - fallback reason: `non-exact-scan`
- native orchestrator는 macOS exact deep stage에서만 helper health를 probe한다.
  - 근거: `src/main/services/scan/nativeScanOrchestrator.ts`
  - 검증: `test/main/nativeScanOrchestrator.test.ts`
- Rust quick scan은 기본적으로 estimated result다.
  - 근거: `native/scanner/src/scan/quick.rs`
- Rust responsive policy soft skip과 bulk estimate는 estimated aggregate item을 만들 수 있다.
  - 근거: `native/scanner/src/scan/aggregate/walker.rs`
- 최근 native scanner 로그에서도 기본 스캔은 helper가 아니라 native fallback 경로로 기록되었다.
  - quick: `fallbackReason: quick-stage`
  - deep: `fallbackReason: non-exact-scan`
  - done: `estimated: true`

## Unconfirmed

- CleanMyMac Space Lens의 내부 디렉터리 traversal 알고리즘은 확인되지 않았다.
- MacPaw 공개 문서로 확인 가능한 것은 사용자가 볼륨이나 폴더를 선택하고, 크기 비례 시각화로 drill down할 수 있다는 수준이다.
- 현재 앱의 GB 값이 실제 파일 시스템 용량보다 얼마나 다른지는 아직 재현 케이스로 계측하지 않았다.

## Working Hypotheses

이건 확인된 사실이 아니라 추정입니다.

- 비정상적으로 커 보이는 GB 값은 preview cache, quick estimate, responsive soft-skip estimate, deep result 갱신이 UI에서 충분히 구분되지 않아 발생했을 수 있다.
- `/Users` 스캔은 버그라기보다 현재 기본 root 정책의 직접 결과일 수 있다.
- helper 연동 상태를 검증하려면 기본 SCAN이 아니라 명시적인 exact recheck 경로가 필요하다.

## Goal

- helper-backed exact scan을 사용자가 명시적으로 실행할 수 있게 만든다.
- 기본 preview scan과 exact scan의 차이를 UI, 로그, 테스트에서 관찰 가능하게 만든다.
- estimated size와 exact size를 혼동하지 않도록 표시와 상태 전이를 정리한다.
- `/Users` 기본 root 정책을 유지할지 바꿀지 근거 기반으로 결정한다.

## Non-Goals

- Phase 0에서는 production code를 변경하지 않는다.
- helper가 production-ready라고 주장하지 않는다.
- CleanMyMac의 비공개 내부 구현을 단정하지 않는다.
- `/Users` 기본 root를 즉시 변경하지 않는다.
- GB 차이를 추정만으로 수정하지 않는다.

## Phases

### Phase 0: Evidence Baseline

Status: completed

목표:

- 현재 기본 SCAN이 helper-backed exact scan이 아니라는 사실을 코드, 테스트, 로그로 고정한다.
- `/Users` 스캔과 estimated result의 원인을 분리한다.
- 다음 phase에서 바꿀 대상과 바꾸지 않을 대상을 명확히 한다.

완료 기준:

- 관련 소스 지점 확인 완료.
- 기존 characterization tests 실행 완료.
- runtime log에서 `quick-stage`, `non-exact-scan`, `estimated:true` 근거 확인 완료.
- 이 문서에 사실, 추정, 미확인을 분리해 기록 완료.

검증:

```bash
pnpm test test/renderer/scanRequestFactory.test.ts test/main/helperScanPlanner.test.ts test/main/nativeScanOrchestrator.test.ts
```

결과:

- Test Files: 3 passed
- Tests: 30 passed

### Phase 1: Exact Scan Entry Point

Status: completed

목표:

- UI에서 명시적인 exact recheck를 실행할 수 있게 한다.
- `buildExactScanRequest`가 실제 renderer flow에 연결되는지 테스트한다.
- 기본 SCAN은 preview/responsive로 유지하되, exact recheck는 full/exact로 분리한다.

검증 후보:

- `App` 또는 scan logic 테스트에서 exact action이 `accuracyMode: "full"`과 `deepPolicyPreset: "exact"` 요청을 보낸다.
- `VisualizationFooter`의 exact recheck 버튼이 실제 app flow에 연결된다.

구현:

- `useScanLogic`에 `scanExactRoot` action을 추가했다.
- 기본 `oneClickScan`은 기존 `buildDefaultScanRequest` 경로를 유지한다.
- `scanExactRoot`는 `buildExactScanRequest`를 사용해 `accuracyMode: "full"`, `deepPolicyPreset: "exact"` 요청을 보낸다.
- `App`이 completed visualization view에 `onExactRecheck={scanExactRoot}`를 전달한다.

검증:

```bash
pnpm test test/renderer/appExactRecheck.test.tsx test/renderer/useScanLogic.test.tsx test/renderer/visualizationFooter.test.tsx test/renderer/scanRequestFactory.test.ts
pnpm test test/main/helperScanPlanner.test.ts test/main/nativeScanOrchestrator.test.ts
pnpm test test/renderer/appExactRecheck.test.tsx test/renderer/useScanLogic.test.tsx test/renderer/visualizationFooter.test.tsx test/renderer/scanRequestFactory.test.ts test/main/helperScanPlanner.test.ts test/main/nativeScanOrchestrator.test.ts
pnpm typecheck
```

결과:

- Renderer focused tests: 4 files, 11 tests passed
- Main helper/orchestrator tests: 2 files, 27 tests passed
- Combined focused tests: 6 files, 38 tests passed
- Typecheck passed

### Phase 2: Helper Candidate Diagnostics

Status: completed

목표:

- exact deep scan에서 helper 선택 여부, fallback reason, helper lifecycle을 UI 또는 diagnostics에서 확인 가능하게 한다.
- helper가 선택되지 않은 경우 원인을 사용자가 볼 수 있게 한다.

검증 후보:

- exact deep scan은 helper health probe를 수행한다.
- helper unavailable, registration preflight blocked, non-exact-scan이 서로 다른 diagnostics로 남는다.

구현:

- `ScanHelperPlan` diagnostics schema에 scan `stage`를 추가했다.
- `NativeScanOrchestrator`가 helper plan message에 `quick` 또는 `deep` stage를 포함하도록 했다.
- renderer helper plan label이 stage를 표시하도록 했다.
- 이로써 exact scan 중 quick-stage fallback과 deep helper/fallback 판단을 UI 텍스트에서 구분할 수 있다.

검증:

```bash
pnpm test test/renderer/helperPlan.test.ts test/main/scanDiagnostics.test.ts
pnpm test test/main/nativeScanOrchestrator.test.ts test/main/nativeStageHandlers.test.ts test/main/scanEventBus.test.ts test/renderer/helperPlan.test.ts test/main/scanDiagnostics.test.ts
pnpm test test/main/helperPrototypeAuditSummary.test.ts test/renderer/helperPlan.test.ts test/main/scanDiagnostics.test.ts test/main/nativeScanOrchestrator.test.ts
pnpm typecheck
```

결과:

- Helper plan/diagnostics RED-GREEN tests: 2 files, 8 tests passed
- Native diagnostics focused tests: 5 files, 33 tests passed
- Helper prototype/type focused tests: 4 files, 30 tests passed
- Typecheck passed

### Phase 3: Estimate vs Exact Size Semantics

목표:

- estimated aggregate와 exact aggregate를 UI/상태에서 구분한다.
- quick/preview 결과가 exact 결과처럼 보이지 않게 한다.
- exact recheck 완료 후 stale estimate가 남는지 검증한다.

검증 후보:

- estimated result가 true인 동안 UI가 preview/estimate 상태를 표시한다.
- exact result가 false로 완료되면 해당 scope의 estimate 표시가 제거된다.

### Phase 4: Root Scope Decision

목표:

- macOS 기본 root를 `/Users`로 유지할지, user home으로 좁힐지 결정한다.
- Space Lens처럼 사용자가 직접 volume/folder를 선택하는 흐름과 비교해 현재 정책을 평가한다.

결정 기준:

- 첫 실행에서 민감 폴더를 광범위하게 스캔하는 UX 위험.
- helper/FDA가 준비되지 않은 상태에서 `/Users` 전체 preview를 시작하는 성능 및 신뢰도 위험.
- 사용자가 기대하는 "내 디스크"와 실제 root scope의 차이.

### Phase 5: Verification

목표:

- focused unit tests, renderer tests, native scanner tests를 실행한다.
- 가능하면 macOS app flow에서 preview scan과 exact recheck 로그를 비교한다.
- helper-backed exact scan이 실제로 helper path를 타는지 최종 확인한다.

완료 기준:

- default preview scan과 exact recheck가 로그에서 명확히 구분된다.
- exact recheck가 helper unavailable일 때도 fallback reason을 명확히 표시한다.
- estimated GB와 exact GB가 UI에서 혼동되지 않는다.
