# Evidence Matrix (한국어 v3)

이 문서는 주장(Claim)을 `확정 사실`과 `추정/권장 설계`로 분리해 관리한다.

## 분류 규칙

- `확정 사실`: 공식 문서로 직접 확인 가능한 내용.
- `추정/권장 설계`: 업계 표준/실무 경험을 근거로 한 권장안.

## 매트릭스

| Claim | Classification | Source URL | Design Impact |
|---|---|---|---|
| Space Lens는 파일/폴더를 버블 형태로 시각화한다. | 확정 사실 | https://macpaw.com/support/cleanmymac-x/knowledgebase/space-lens | 기본 레이아웃 모드를 `circle_pack`으로 둔다. |
| Space Lens는 드라이브/외장/특정 디렉터리 분석을 지원한다. | 확정 사실 | https://macpaw.com/support/cleanmymac-x/knowledgebase/space-lens | 스캐너 입력을 다중 대상 가능 구조로 설계한다. |
| Space Lens 결과 화면은 큰 항목 중심 리스트를 제공한다. | 확정 사실 | https://macpaw.com/support/cleanmymac/knowledgebase/space-lens-results | Aggregator/Compressor에서 top-N 집계를 요구한다. |
| Electron 앱은 보안 체크리스트를 준수해야 한다. | 확정 사실 | https://www.electronjs.org/docs/latest/tutorial/security | system 보안 고정 규칙(웹보안/네비게이션/권한/CSP)을 강제한다. |
| BrowserWindow 보안 옵션(`webSecurity`, `allowRunningInsecureContent`)을 제어할 수 있다. | 확정 사실 | https://www.electronjs.org/docs/latest/api/browser-window | window 생성 시 보안 옵션을 기본 강제한다. |
| 내비게이션 제어(`will-navigate`)는 webContents에서 처리한다. | 확정 사실 | https://www.electronjs.org/docs/latest/api/web-contents | allowlist 외 이동을 차단한다. |
| 새 창 열기 정책은 `setWindowOpenHandler`로 통제한다. | 확정 사실 | https://www.electronjs.org/docs/latest/api/window-open | 외부 URL 팝업을 기본 deny로 둔다. |
| 권한 요청 제어는 session permission handler에서 처리한다. | 확정 사실 | https://www.electronjs.org/docs/latest/api/session | 권한 요청 기본 deny 정책을 고정한다. |
| electron-vite는 main/preload/renderer 분리 개발 흐름을 제공한다. | 확정 사실 | https://electron-vite.org/guide/dev | 엔트리 경로와 구현 사이클을 표준화한다. |
| Vitest는 setupFiles와 글로벌 mocking을 지원한다. | 확정 사실 | https://vitest.dev/config/setupfiles.html | renderer 테스트 시작 전에 전역 mock을 주입한다. |
| Vitest 글로벌 mocking(`vi.stubGlobal`)을 사용할 수 있다. | 확정 사실 | https://vitest.dev/guide/mocking/globals | `window.electronAPI` 런타임 undefined를 방지한다. |
| Bubble UI는 Circle Packing으로 구현하는 것이 실무적으로 적합하다. | 추정/권장 설계 | https://d3js.org/d3-hierarchy/pack | MVP 레이아웃 기본값을 `circle_pack`으로 설정한다. |
| macOS 변경 추적은 FSEvents를 증분 모드에 활용하는 편이 유리하다. | 추정/권장 설계 | https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/FSEvents_ProgGuide/UsingtheFSEventsFramework/UsingtheFSEventsFramework.html | `portable_plus_os_accel`에서 macOS 옵션으로 분리한다. |
| Windows 대용량 스캔은 USN 기반 접근이 빠를 수 있다. | 추정/권장 설계 | https://learn.microsoft.com/en-us/windows/win32/fileio/walking-a-buffer-of-change-journal-records | Windows 전용 가속 기능을 옵션으로 격리한다. |

## 운영 규칙

1. 새 Claim을 추가할 때 반드시 분류를 먼저 결정한다.
2. `확정 사실`에는 공식 URL을 필수로 넣는다.
3. `추정/권장 설계`에는 채택 이유와 영향 범위를 함께 기록한다.
