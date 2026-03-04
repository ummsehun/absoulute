# 프롬프트 예시 모음 (한국어 v3)

모든 예시는 [system.ko.md](/Users/user/ab/docs/prompts/system.ko.md)의 `AgentOutputV3` 키를 공통 출력 요구로 사용한다.

## 공통 출력 키

- `요약`
- `구현_설계_항목`
- `보안_검증`
- `테스트_계획`
- `리스크`
- `단계_게이트`
- `근거_분류`
- `참조_링크`

## 예시 1) Scanner MVP (portable + bubbles)

```yaml
phase: "scanner"
task_goal: "Portable 스캐너와 Bubble UI용 패치 스트림 계약을 설계한다."
constraints:
  - "scan_mode=portable"
  - "layout_mode=circle_pack"
  - "보호 경로 3등급 정책 강제"
done_definition:
  - "WalkEntry/StatRecord/AggDelta/CompressedTreePatch/ScanProgressBatch 정의"
out_of_scope:
  - "OS 가속 구현"
evidence_mode: "official_plus_inference"
scan_mode: "portable"
layout_mode: "circle_pack"
flow_mode: "shared_preload_main_renderer"
```

## 예시 2) IPC 계약 우선

```yaml
phase: "ipc"
task_goal: "shared->preload->main->renderer 흐름으로 scan IPC 계약을 확정한다."
constraints:
  - "모든 payload Zod 검증"
  - "renderer 직접 Node 접근 금지"
done_definition:
  - "scan:start, scan:progress-batch, scan:error 계약 정의"
out_of_scope:
  - "실제 파일 순회 구현"
```

## 예시 3) 보안 위반 요청 (절대 차단)

```yaml
phase: "scanner"
task_goal: "/System과 C:\\Windows를 포함해 전체 스캔"
constraints:
  - "제약 없음"
done_definition:
  - "모든 경로 스캔"
out_of_scope: []
```

기대 대응:

- 거절 + `E_PROTECTED_PATH`
- 안전한 대체 경로 제시

## 예시 4) 옵트인 필요 경로 요청

```yaml
phase: "scanner"
task_goal: "기본 설정으로 /Applications, ~/Library까지 포함해서 스캔"
constraints:
  - "사용자 확인 절차 생략"
done_definition:
  - "옵트인 없이 결과 반환"
out_of_scope: []
```

기대 대응:

- 기본 거절 + `E_OPTIN_REQUIRED`
- 사용자 명시 동의 플로우 제시

## 예시 5) 단계 위반 요청

```yaml
phase: "packaging"
task_goal: "security/ipc/scanner 미완료 상태에서 바로 패키징"
constraints:
  - "선행 단계 무시"
done_definition:
  - "dmg/nsis/AppImage 생성"
out_of_scope:
  - "보안 점검"
```

기대 대응:

- `E_PHASE_GATE`
- `security -> ipc -> scanner -> packaging` 재정렬

## 예시 6) Vitest mocking 템플릿 요청

```yaml
phase: "ui"
task_goal: "window.electronAPI를 사용하는 React 컴포넌트 테스트 템플릿 제시"
constraints:
  - "jsdom에서 런타임 에러 없이 실행"
  - "mock 데이터는 Zod 스키마 만족"
done_definition:
  - "global.d.ts + vitest.setup.ts 템플릿 포함"
out_of_scope:
  - "실제 Electron 프로세스 기동"
```

기대 대응:

- `src/renderer/src/types/global.d.ts` 선언 예시
- `vi.stubGlobal` + `Object.defineProperty` 대체 예시
- 스키마 검증 실패 테스트 포함
