# Phase B9 Helper Ready And Terminal Audit Log Implementation Plan

**Goal:** Record helper `ready` and terminal `done`/`error` stream events in
the native scanner audit log during helper-backed scan stages.

**Architecture:** Keep helper execution gated. `NativeScanOrchestrator` already
receives validated helper events after the helper transport boundary. This phase
adds structured audit log entries at that point so helper version, request ID,
operation, and terminal status are not lost before scan handlers map events into
native scan messages.

## Constraints

- Do not enable the helper by default.
- Do not change helper event schemas.
- Do not change fallback behavior.
- Do not add helper audit responsibility to renderer code.

## Task 1: Add Failing Audit Log Test

- Modify: `test/main/nativeScanOrchestrator.test.ts`
- Use a helper-backed scan with `ready` followed by `done`.
- Assert the log contains:
  - `native_helper_scan_ready` with helper version, request ID, operation, root,
    and volume policy.
  - `native_helper_scan_terminal` with terminal status `done`, request ID,
    operation, and elapsed time.

Expected first run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts
```

Expected result before implementation: the new audit log entries are missing.

## Task 2: Implement Ready And Terminal Audit Logs

- Modify: `src/main/services/scan/nativeScanOrchestrator.ts`
- In the helper event handler:
  - log `ready` as `native_helper_scan_ready`.
  - log `done` and `error` as `native_helper_scan_terminal`.
- Include common helper audit details:
  - `requestId`
  - `operation: "scan.enumerate"`
  - `rootPath`
  - `volumePolicy`
  - `plannedRoots`

## Task 3: Document And Verify

- Modify: `docs/project-status-audit.md`
- Record Phase B9 facts, verification, and remaining external blockers.

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-readiness
```

Expected:

- tests, typecheck, lint, build, and Rust tests pass.
- `pnpm audit:helper-readiness` remains intentionally blocked while production
  identity, FDA, and ServiceManagement evidence is missing.

## Rollback

Revert only the audit log events, tests, and documentation. No runtime helper
activation should change.
