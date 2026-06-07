# Phase B11 Helper Request Correlation Implementation Plan

**Goal:** Make helper-backed scan request correlation explicit by generating
the helper request ID and traversal policy plan ID in `NativeScanOrchestrator`
and recording those same values in helper audit logs.

**Architecture:** `helperClient` can still build default request IDs for direct
callers, but helper-backed scan stages should not rely on hidden defaults when
audit logs must correlate request, stage, policy plan, and terminal status.

## Constraints

- Do not enable the helper by default.
- Do not change helper request schema names.
- Do not change scan policy ownership.
- Keep helper fallback behavior unchanged.

## Task 1: Add Failing Correlation Test

- Modify: `test/main/nativeScanOrchestrator.test.ts`
- Capture the input passed to `helperClient.enumerate()`.
- Emit helper events using the captured request ID.
- Assert the helper start, ready, and terminal audit logs all include:
  - `requestId`
  - `operation: "scan.enumerate"`
  - `traversalPolicyPlanId`
- Assert the values match the request input.

Expected first run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts
```

Expected result before implementation: request ID and traversal policy plan ID
are missing from the helper start log and request input.

## Task 2: Generate Correlation Values In Orchestrator

- Modify: `src/main/services/scan/nativeScanOrchestrator.ts`
- Generate a helper request ID before calling `helperClient.enumerate()`.
- Derive the traversal policy plan ID from scan ID, stage ID, and deep policy
  preset.
- Pass both values to `helperClient.enumerate()`.
- Include both values in helper start, ready, and terminal audit logs.

## Task 3: Document And Verify

- Modify: `docs/project-status-audit.md`
- Record Phase B11 facts, verification, and remaining external blockers.
- Run sub-agent code review after the mini phase implementation.
- Addressed review feedback by extending the helper terminal error test to
  assert the generated request ID and traversal policy plan ID.

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

Revert only the orchestrator-generated helper correlation values, tests, and
documentation. No runtime helper activation should change.
