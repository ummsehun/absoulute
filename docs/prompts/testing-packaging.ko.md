# Testing & Packaging Guide (한국어 v3)

이 문서는 renderer 테스트에서 `window.electronAPI`를 안전하게 mocking하고, 패키징/CI 최소 기준을 고정한다.

## 1) Vitest: Window 타입 선언 고정

파일: `src/renderer/src/types/global.d.ts`

```ts
export {};

declare global {
  interface Window {
    electronAPI: {
      scanStart: (input: unknown) => Promise<{ scanId: string }>;
      scanCancel: (scanId: string) => Promise<{ ok: boolean }>;
      onScanProgressBatch: (cb: (batch: unknown) => void) => () => void;
    };
  }
}
```

규칙:

- 테스트 코드에서 `window.electronAPI` 타입 에러가 나면 이 파일 존재/경로를 먼저 확인한다.

## 2) Vitest setup 템플릿 (`vi.stubGlobal`)

파일: `vitest.setup.ts`

```ts
import { vi } from "vitest";
import { z } from "zod";

const ScanStartResSchema = z.object({ scanId: z.string().min(1) });
const ScanCancelResSchema = z.object({ ok: z.boolean() });

const electronAPIMock = {
  scanStart: vi.fn(async () => {
    const data = { scanId: "scan-test-1" };
    return ScanStartResSchema.parse(data);
  }),
  scanCancel: vi.fn(async () => {
    const data = { ok: true };
    return ScanCancelResSchema.parse(data);
  }),
  onScanProgressBatch: vi.fn((cb: (batch: unknown) => void) => {
    cb({ progress: { scanId: "scan-test-1", phase: "walking", scannedCount: 1, totalBytes: 128 } });
    return () => undefined;
  }),
};

vi.stubGlobal("electronAPI", electronAPIMock);
Object.defineProperty(window, "electronAPI", {
  value: electronAPIMock,
  writable: true,
});
```

규칙:

- mock 반환값도 Zod 검증을 통과하도록 강제한다.
- 스키마 불일치 시 테스트가 실패해야 한다.

## 3) 대체 템플릿 (`Object.defineProperty`만 사용)

```ts
beforeEach(() => {
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: {
      scanStart: async () => ({ scanId: "scan-test-2" }),
      scanCancel: async () => ({ ok: true }),
      onScanProgressBatch: (cb: (batch: unknown) => void) => {
        cb({ progress: { scanId: "scan-test-2", phase: "walking", scannedCount: 0, totalBytes: 0 } });
        return () => undefined;
      },
    },
  });
});
```

## 4) 패키징 기준

- 패키저: `electron-builder`
- 타깃:
  - macOS: `dmg`
  - Windows: `nsis`
  - Linux: `AppImage`

점검 항목:

1. Vite 빌드 산출물 경로와 electron-builder 입력 경로가 일치하는지 확인.
2. preload 번들이 누락되지 않았는지 확인.
3. CSP/보안 설정이 패키지에서도 동일하게 적용되는지 확인.

## 5) CI 최소 명령

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

권장 스크립트 매핑:

- `typecheck`: `tsc --noEmit`
- `test`: `vitest run`
- `build`: `electron-vite build`

## 6) 테스트 시나리오 최소 세트

1. 타입 시나리오: `global.d.ts` 누락 시 타입 실패 감지.
2. 런타임 시나리오: mocking 없을 때 `electronAPI` undefined 실패 재현.
3. 계약 시나리오: mock 반환값이 Zod 스키마를 벗어나면 테스트 실패.
4. 보안 시나리오: 보호 경로 요청 오류 코드(`E_PROTECTED_PATH`/`E_OPTIN_REQUIRED`) 확인.

## 7) 참고 링크

- https://vitest.dev/config/setupfiles.html
- https://vitest.dev/guide/mocking/globals
- https://electron-vite.org/guide/dev
- https://www.electronjs.org/docs/latest/tutorial/security
