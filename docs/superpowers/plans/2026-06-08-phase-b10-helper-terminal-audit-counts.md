# Phase B10 Helper Terminal Audit Counts Implementation Plan

**Goal:** Include helper event-derived count summaries in
`native_helper_scan_terminal` audit logs.

**Architecture:** `NativeScanOrchestrator` already receives validated helper
events and records helper ready/terminal audit entries. This phase keeps the
counter state local to the helper-backed stage and derives counts only from
helper stream events before terminal logging.

## Constraints

- Do not enable the helper by default.
- Do not change helper event schemas.
- Do not change scan aggregation semantics.
- Do not add renderer responsibility for helper audit counts.

## Task 1: Add Failing Audit Count Test

- Modify: `test/main/nativeScanOrchestrator.test.ts`
- In a helper-backed scan, emit:
  - `ready`
  - `entry_batch`
  - `coverage`
  - `warn` with `E_TCC_PERMISSION`
  - `warn` with `E_CANCELLED`
  - `done`
- Assert `native_helper_scan_terminal` includes:
  - `entryCount`
  - `permissionFailureCount`
  - `tccFailureCount`
  - `ioFailureCount`
  - `scopeRejectionCount`
  - `cancellationCount`

Expected first run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts
```

Expected result before implementation: the terminal count fields are missing.

## Task 2: Implement Helper Audit Counters

- Modify: `src/main/services/scan/nativeScanOrchestrator.ts`
- Track helper event counts inside `runHelperStage()`.
- Update counters before terminal logging.
- Include count fields in `native_helper_scan_terminal` for both `done` and
  `error` terminal events.

## Task 3: Document And Verify

- Modify: `docs/project-status-audit.md`
- Record Phase B10 facts, verification, and remaining external blockers.

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

Revert only the helper audit counters, tests, and documentation. No runtime
helper activation should change.
