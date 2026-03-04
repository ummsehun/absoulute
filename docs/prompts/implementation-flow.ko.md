# Implementation Flow (한국어 v3)

이 문서는 기능 추가 시 `shared -> preload -> main -> renderer` 순서를 코드 레벨로 고정한다.

## 1) 단계 1: Shared 계약 정의

필수 산출물:

- `src/shared/constants/ipcChannels.ts`
- `src/shared/schemas/scan.ts`
- `src/types/scan.ts`

완료 조건:

- IPC 채널 상수 정의 완료
- WalkEntry/StatRecord/AggDelta/CompressedTreePatch/ScanProgressBatch 타입 정의 완료
- Zod 스키마와 TS 타입 명칭이 일치

차단 규칙:

- Shared 계약 없이 preload/main 구현 시작 금지

## 2) 단계 2: Preload Bridge 작성

필수 산출물:

- `src/preload/index.mjs`
- `src/renderer/src/types/global.d.ts` (window API 선언)

완료 조건:

- `window.electronAPI`에 최소 API 노출
- renderer에서 직접 `ipcRenderer` 접근 금지
- 노출 API 시그니처가 `src/types/*`와 일치

차단 규칙:

- 권한이 넓은 범용 브리지(`any` 기반 pass-through) 금지

## 3) 단계 3: Main Handler/Service 연결

필수 산출물:

- `src/main/handler/*`
- `src/main/services/*`
- `src/main/core/securityPolicy.ts`

완료 조건:

- 요청 payload Zod 검증
- 보호 경로 3등급 정책 적용
- 오류 코드(`E_PROTECTED_PATH`, `E_OPTIN_REQUIRED`, `E_PHASE_GATE` 포함) 반환
- progress-batch 이벤트 전송

차단 규칙:

- 보안 정책 우회 로직 금지
- 보호 경로 차단 생략 금지

## 4) 단계 4: Renderer 소비 및 상태 반영

필수 산출물:

- `src/renderer/src/main.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/store/*` (선택)

완료 조건:

- `window.electronAPI` 호출로만 데이터 소비
- ScanProgressBatch를 UI 상태에 반영
- layout_mode(`circle_pack`/`treemap`)에 맞는 렌더링 분기 구현

차단 규칙:

- renderer 내부 Node/FS 직접 접근 금지

## 5) 실패 패턴과 대응

1. 실패 패턴: renderer가 타입은 맞는데 런타임에서 `electronAPI` undefined.
   대응: `global.d.ts` + `preload expose` + Vitest setup mocking 동시 점검.
2. 실패 패턴: 옵트인 경로를 절대 차단으로 처리.
   대응: 경로 등급 테이블과 오류 코드 매핑 재검증.
3. 실패 패턴: progress 이벤트 과다로 UI 끊김.
   대응: progress-batch 주기 스로틀링(100~500ms).
4. 실패 패턴: 단계 건너뛰기.
   대응: `E_PHASE_GATE`와 선행 단계 재정렬.

## 6) 완료 정의 (Flow 레벨)

아래 4개를 모두 만족하면 기능 구현 흐름 완료로 판정한다.

1. Shared 계약과 Main/Preload/Renderer 구현이 1:1로 연결됨
2. 보안 정책 위반 요청에 명시적 오류 코드 반환
3. 테스트에서 `window.electronAPI` mocking 기반 UI 테스트 통과
4. 배치 progress가 UI에서 안정적으로 갱신됨
