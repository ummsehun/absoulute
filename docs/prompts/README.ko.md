# 디스크 시각화 도구 프롬프트 패키지 (한국어 v3)

이 패키지는 Electron 기반 디스크 시각화 도구를 실무 방식으로 개발하기 위한 지시문 세트다.

## 1) 핵심 원칙

- 보안 최우선
- main/preload/renderer 분리
- 점진 개발(phase 게이트)
- 근거 표기 분리(확정 사실 vs 추정/권장 설계)
- 계약 단일 원본 유지

## 2) 포함 문서

- `system.ko.md`: 최상위 규칙 + `PromptInputV3`/`AgentOutputV3` 원문 정의
- `developer.ko.md`: electron-vite 구조, 구현 사이클, 파이프라인 계약
- `user-template.ko.md`: 사용자 요청 템플릿
- `examples.ko.md`: 요청/거절/재유도 예시
- `acceptance-checklist.ko.md`: 수용 기준
- `evidence-matrix.ko.md`: 근거 매트릭스(확정/추정 분리)
- `implementation-flow.ko.md`: Shared -> Preload -> Main -> Renderer 실행 흐름
- `testing-packaging.ko.md`: Vitest mocking + 패키징 + CI 명령
- `ci-workflow-template.ko.md`: GitHub Actions 워크플로 초안

## 3) 사용 순서

1. `system.ko.md`를 최상위 지시문으로 주입한다.
2. `developer.ko.md`를 구현 정책 레이어로 추가한다.
3. `user-template.ko.md`로 작업 요청을 작성한다.
4. 필요 시 `examples.ko.md`로 요청 문장을 교정한다.
5. 출력을 `acceptance-checklist.ko.md`로 검증한다.

## 4) 계약 단일 원본 규칙

- `PromptInputV3`/`AgentOutputV3` 원문 정의는 `system.ko.md`에만 둔다.
- 다른 문서는 계약을 복제하지 않고 `system.ko.md`를 참조만 한다.

## 5) 기본 개발 흐름

```text
shared -> preload -> main -> renderer
```

이 순서를 기본으로 기능을 추가한다.

## 6) 기본값

- `evidence_mode`: `official_plus_inference`
- `scan_mode`: `portable`
- `layout_mode`: `circle_pack`
- `flow_mode`: `shared_preload_main_renderer`

## 7) 빠른 시작 입력 예시

```yaml
phase: "scanner"
task_goal: "Portable 스캐너 이벤트 계약과 Bubble UI용 패치 스트림 구조를 설계한다."
constraints:
  - "renderer는 preload 브리지 외 Node 접근 금지"
  - "보호 경로 3등급 정책 강제"
  - "모든 IPC payload는 Zod 검증"
done_definition:
  - "WalkEntry/StatRecord/AggDelta/CompressedTreePatch/ScanProgressBatch 정의"
  - "절대 차단은 E_PROTECTED_PATH, 옵트인 필요는 E_OPTIN_REQUIRED"
out_of_scope:
  - "Windows USN 저수준 가속 구현"
  - "macOS FSEvents 증분 구현"
evidence_mode: "official_plus_inference"
scan_mode: "portable"
layout_mode: "circle_pack"
flow_mode: "shared_preload_main_renderer"
assumptions:
  - "MVP는 symlink를 기본 미추적"
acceptance_tests:
  - "절대 차단 경로 요청 시 E_PROTECTED_PATH"
  - "옵트인 경로 요청 시 E_OPTIN_REQUIRED"
```
