# Shared Contracts

Date: 2026-06-07

## Purpose

`src/shared` is the contract layer between renderer, preload, main, tests, and
native-helper protocol adapters. It must not contain orchestration, UI state,
Electron APIs, helper lifecycle side effects, filesystem probing, or process
environment reads.

## Browser-Neutral Modules

- `src/shared/constants/ipcChannels.ts`
- `src/shared/schemas/common.ts`
- `src/shared/schemas/scan.ts`
- `src/shared/schemas/system.ts`
- `src/shared/schemas/window.ts`
- `src/shared/schemas/helperProtocol.ts`
- `src/shared/domain/scanIntent.ts`
- `src/shared/platform/protectedPaths.ts`

## Electron/Node-Compatible Domain Modules

These modules are shared contracts, but they import `node:path` and are not
strict browser-neutral:

- `src/shared/domain/pathPolicy.ts`
- `src/shared/domain/scanPolicyContract.ts`

They may be used in Electron/Vite code where Node-compatible bundling is
available. Do not use them in a strict browser-only runtime without replacing
`node:path` usage.

## Boundary Rules

Allowed:

- zod schemas
- literal constants
- pure domain normalization
- policy contract data
- helper protocol contract data

Disallowed:

- `electron`
- `node:fs`
- `node:child_process`
- `process.env`
- renderer hooks
- main services
- helper lifecycle side effects
- IPC handlers

`test/main/sharedBoundary.test.ts` enforces the highest-risk imports.
