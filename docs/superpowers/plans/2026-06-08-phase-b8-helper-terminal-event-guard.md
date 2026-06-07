# Phase B8 Helper Terminal Event Guard Implementation Plan

**Goal:** Reject helper stream events that arrive after a terminal `done` or
`error` event at the main-process command enumerate boundary.

**Architecture:** `CommandMacOsHelperEnumerator` already validates helper event
schema and request binding before dispatch. This phase adds terminal stream
state to that same boundary so the main app does not accept extra helper output
after terminal status.

## Constraints

- Do not enable the helper by default.
- Do not change shared helper event schema names.
- Do not suppress the first terminal event.
- Keep the existing operation allowlist, replay guard, and request-id binding.

## Task 1: Add Failing Terminal Guard Tests

- Modify: `test/main/helperClient.test.ts`
- Emit `done` followed by another valid event from an injected enumerate runner.
- Emit `error` followed by another valid event from an injected enumerate runner.
- Assert both reject with `helper-enumerate-event-after-terminal`.
- Assert the late event is not delivered to scan handlers.

Expected first run:

```bash
pnpm test test/main/helperClient.test.ts
```

Expected result before implementation: the late event is accepted and the test
fails.

## Task 2: Enforce Terminal Stream State

- Modify: `src/main/services/helper/macosHelperEnumerateCommand.ts`
- Track whether `done` or `error` has already been received in
  `bindHandlersToRequest()`.
- Reject any later event with `helper-enumerate-event-after-terminal`.

## Task 3: Document and Verify

- Modify: `docs/project-status-audit.md`
- Record Phase B8 facts, verification, and remaining external blockers.

Run:

```bash
pnpm test test/main/helperClient.test.ts
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

Revert only the terminal guard, tests, and documentation. No runtime helper
activation should change.
