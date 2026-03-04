# User Prompt Template (한국어 v3)

이 템플릿은 [system.ko.md](/Users/user/ab/docs/prompts/system.ko.md)의 `PromptInputV3`를 채우기 위한 입력 양식이다.

## 템플릿

```yaml
phase: "bootstrap | security | ipc | scanner | ui | optimization | packaging"
task_goal: ""
constraints:
  - ""
done_definition:
  - ""
out_of_scope:
  - ""

# 선택 필드
assumptions:
  - ""
context_files:
  - ""
target_artifacts:
  - ""
acceptance_tests:
  - ""

# v3 필드
# 기본값: official_plus_inference
# 기본값: portable
# 기본값: circle_pack
# 기본값: shared_preload_main_renderer
evidence_mode: "official_facts_only | official_plus_inference"
scan_mode: "portable | portable_plus_os_accel"
layout_mode: "circle_pack | treemap"
flow_mode: "shared_preload_main_renderer"
```

## 기본값 권장

- `evidence_mode: official_plus_inference`
- `scan_mode: portable`
- `layout_mode: circle_pack`
- `flow_mode: shared_preload_main_renderer`

## 작성 가이드

1. `phase`: 한 요청에 하나만 선택.
2. `task_goal`: 한 문장으로 완료 목표를 명확히 작성.
3. `constraints`: 보안/호환성/아키텍처 제약을 강제 문장으로 작성.
4. `done_definition`: 검증 가능한 종료 조건을 작성.
5. `out_of_scope`: 이번 턴에서 하지 않을 내용을 명시.

## 권장 입력 예시

```yaml
phase: "ipc"
task_goal: "scan progress 배치 이벤트 계약과 preload bridge 호출 규격을 확정한다."
constraints:
  - "renderer는 preload 외 경로 접근 금지"
  - "payload는 Zod 검증 필수"
  - "절대 차단 경로는 E_PROTECTED_PATH"
  - "옵트인 경로는 E_OPTIN_REQUIRED"
done_definition:
  - "WalkEntry/StatRecord/AggDelta/CompressedTreePatch/ScanProgressBatch 타입 정의"
  - "shared/schemas와 types 동기화 규칙 명시"
out_of_scope:
  - "실제 OS 가속 구현"
assumptions:
  - "MVP는 symlink를 기본 미추적"
context_files:
  - "src/shared/schemas/scan.ts"
  - "src/types/scan.ts"
target_artifacts:
  - "src/preload/index.mjs"
  - "src/main/handler/scanProgressHandler.ts"
acceptance_tests:
  - "잘못된 payload는 E_VALIDATION"
  - "옵트인 경로 요청은 E_OPTIN_REQUIRED"
evidence_mode: "official_plus_inference"
scan_mode: "portable"
layout_mode: "circle_pack"
flow_mode: "shared_preload_main_renderer"
```

## 기대 출력 키 (AgentOutputV3 참조)

- `요약`
- `구현_설계_항목`
- `보안_검증`
- `테스트_계획`
- `리스크`
- `단계_게이트`
- `근거_분류`
- `참조_링크`
- `미해결_질문`(필요 시)
