# CI Workflow Template (한국어 v3)

이 문서는 GitHub Actions 기준 최소 CI 파이프라인 초안이다.

## 1) 목적

- PR/Push에서 기본 품질 게이트를 자동으로 강제한다.
- 실패 시 머지를 차단한다.

## 2) 최소 Job 구성

1. `install`
2. `lint`
3. `typecheck`
4. `test`
5. `build`

## 3) 워크플로 초안

파일 예시: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: ["main", "develop"]
  pull_request:

jobs:
  install:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile

  lint:
    runs-on: ubuntu-latest
    needs: [install]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    runs-on: ubuntu-latest
    needs: [install]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    needs: [typecheck]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  build:
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

## 4) 실패 차단 정책

- `lint/typecheck/test/build` 중 하나라도 실패하면 파이프라인 실패로 처리한다.
- 보호 브랜치에서 CI 성공을 머지 조건으로 강제한다.

## 5) 캐시/속도 정책

- Node + pnpm 캐시를 사용한다.
- 워크플로 재사용 또는 composite action 도입은 후속 최적화로 분리한다.

## 6) 명령 표준

- `pnpm lint`
- `pnpm typecheck` (`tsc --noEmit`)
- `pnpm test` (`vitest run`)
- `pnpm build` (`electron-vite build`)
