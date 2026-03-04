# 프롬프트 수용 체크리스트 (한국어 v3)

이 체크리스트는 문서 품질, 보안 실행성, 계약 일관성, 테스트/CI 준비 상태를 검증한다.

## A. 계약/문서 일관성

- [ ] `PromptInputV3`/`AgentOutputV3` 원문 정의가 `system.ko.md`에만 있다.
- [ ] 다른 문서는 계약을 복제하지 않고 참조만 한다.
- [ ] 용어(`main/preload/renderer/shared/types`)가 문서 전반에서 동일하다.
- [ ] 한국어 지시문이 일관된다.

## B. 보안 실행 게이트

- [ ] Renderer 보안 고정값이 문서화됐다.
  - [ ] `contextIsolation: true`
  - [ ] `sandbox: true` (불가 시 사유 기록 규칙 포함)
  - [ ] `nodeIntegration: false`
  - [ ] `webSecurity: true`
  - [ ] `allowRunningInsecureContent: false`
- [ ] `eval`, remote module, renderer 직접 Node 접근 금지 규칙이 있다.
- [ ] `setWindowOpenHandler` allowlist 외 차단 규칙이 있다.
- [ ] `will-navigate` allowlist 외 차단 규칙이 있다.
- [ ] `setPermissionRequestHandler` 기본 deny 규칙이 있다.
- [ ] CSP 개발/프로덕션 분리 규칙이 있다.

## C. 보호 경로 정책 게이트

- [ ] 절대 차단/옵트인 필요/기본 허용 3등급 분류가 있다.
- [ ] 절대 차단 오류 코드 `E_PROTECTED_PATH`가 정의됐다.
- [ ] 옵트인 필요 오류 코드 `E_OPTIN_REQUIRED`가 정의됐다.
- [ ] 경로 판정 전에 `normalize + realpath` 규칙이 있다.
- [ ] symlink 해석 결과 기준 판정 규칙이 있다.

## D. 개발 흐름 게이트

- [ ] `shared -> preload -> main -> renderer` 구현 사이클이 명시됐다.
- [ ] electron-vite 최소 엔트리 5개가 고정됐다.
  - [ ] `src/main/index.ts`
  - [ ] `src/preload/index.ts`
  - [ ] `src/renderer/index.html`
  - [ ] `src/renderer/src/main.tsx`
  - [ ] `src/renderer/src/App.tsx`
- [ ] `main.tsx`/`App.tsx` 역할 분리가 명시됐다.

## E. 스캔 파이프라인 계약 게이트

- [ ] 단계 용어가 고정됐다: Walker -> Stat -> Aggregator -> Compressor -> UI Stream.
- [ ] 이벤트 타입이 정의됐다:
  - [ ] `WalkEntry`
  - [ ] `StatRecord`
  - [ ] `AggDelta`
  - [ ] `CompressedTreePatch`
  - [ ] `ScanProgressBatch`
- [ ] `shared/schemas/*`와 `types/*` 저장 위치 규칙이 있다.

## F. 단계 게이트/오류 게이트

- [ ] 점진 개발 단계(bootstrap -> security -> ipc -> scanner -> ui -> optimization -> packaging)가 명시됐다.
- [ ] 선행 단계 위반 시 `E_PHASE_GATE` 규칙이 있다.
- [ ] 표준 오류 코드 집합이 완전하다:
  - [ ] `E_VALIDATION`
  - [ ] `E_PROTECTED_PATH`
  - [ ] `E_OPTIN_REQUIRED`
  - [ ] `E_PERMISSION`
  - [ ] `E_IO`
  - [ ] `E_CANCELLED`
  - [ ] `E_PHASE_GATE`

## G. 테스트/패키징/CI 게이트

- [ ] `global.d.ts`의 `Window.electronAPI` 선언 규칙이 있다.
- [ ] `vitest.setup.ts` mocking 템플릿(`vi.stubGlobal` 또는 `Object.defineProperty`)이 있다.
- [ ] mock 반환값이 Zod 스키마를 만족해야 한다는 규칙이 있다.
- [ ] 패키징 타깃(`dmg`, `nsis`, `AppImage`)이 명시됐다.
- [ ] CI 최소 명령이 명시됐다:
  - [ ] `lint`
  - [ ] `typecheck` (`tsc --noEmit`)
  - [ ] `test` (`vitest`)
  - [ ] `build` (`electron-vite build`)

## H. 오탈자 재발 방지 게이트

- [ ] 금지 토큰이 문서에 없다: `mamanger`, `tpyes`, `applictation surpoprt`, `pllatfom`.
