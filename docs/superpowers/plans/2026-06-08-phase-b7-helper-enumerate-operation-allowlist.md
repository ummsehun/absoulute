# Phase B7 Helper Enumerate Operation Allowlist Implementation Plan

**Goal:** Reject non-`scan.enumerate` helper request envelopes at the
main-process command enumerate boundary before invoking the helper command.

**Architecture:** The shared helper protocol allows multiple operations, but
`CommandMacOsHelperEnumerator` is an enumerate-only adapter. It should fail
closed for `health.check` and `version.get` envelopes before spawning or calling
the injected runner. The Swift enumerate prototype also validates operation,
but the main-process boundary should not rely on that later check.

## Constraints

- Do not enable the helper by default.
- Do not implement real XPC health/version calls in this phase.
- Do not change shared helper protocol operation names.
- Keep the existing replay and request-id guards.

## Task 1: Add Failing Operation Allowlist Test

- Modify: `test/main/helperClient.test.ts`
- Build a valid `health.check` envelope.
- Pass it directly to `CommandMacOsHelperEnumerator.enumerate()`.
- Assert it rejects with `helper-enumerate-unsupported-operation:health.check`.
- Assert the injected runner is not called.

Expected first run:

```bash
pnpm test test/main/helperClient.test.ts
```

Expected result before implementation: the runner is called or the request is
not rejected at the main-process enumerate boundary.

## Task 2: Enforce Enumerate Operation Boundary

- Modify: `src/main/services/helper/macosHelperEnumerateCommand.ts`
- Check `request.operation` before replay-key registration and runner dispatch.
- Throw `helper-enumerate-unsupported-operation:<operation>` for anything other
  than `scan.enumerate`.

## Task 3: Document and Verify

- Modify: `docs/project-status-audit.md`
- Record Phase B7 facts, verification, and remaining external blockers.

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

Revert only the new allowlist check, test, and documentation. No runtime helper
activation should change.
