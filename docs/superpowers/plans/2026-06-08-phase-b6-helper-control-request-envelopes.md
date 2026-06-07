# Phase B6 Helper Control Request Envelopes Implementation Plan

**Goal:** Add explicit main-process builders for `health.check` and `version.get`
helper request envelopes before wiring real helper IPC.

**Architecture:** Keep helper default activation disabled. The shared helper
protocol already defines `health.check` and `version.get`; this phase only adds
typed request construction at the existing `helperClient.ts` boundary so future
transport work does not invent envelope fields ad hoc.

## Constraints

- Do not enable the helper by default.
- Do not claim production helper readiness.
- Keep `scanId` and `stageId` explicit because the current shared envelope
  schema requires them for every helper operation.
- Validate generated requests with `HelperRequestEnvelopeSchema`.

## Task 1: Add Failing Builder Tests

- Modify: `test/main/helperClient.test.ts`
- Assert `buildHelperHealthCheckRequest()` creates a strict `health.check`
  envelope with an empty payload.
- Assert `buildHelperVersionGetRequest()` creates a strict `version.get`
  envelope with an empty payload.
- Assert invalid common envelope fields still fail through the shared schema.

Expected first run:

```bash
pnpm test test/main/helperClient.test.ts
```

Expected result before implementation: import/build failures because the new
builders do not exist.

## Task 2: Implement Control Request Builders

- Modify: `src/main/services/helper/helperClient.ts`
- Add `HelperControlRequestInput` for common envelope fields:
  - `scanId`
  - `stageId`
  - optional `requestId`
  - optional `issuedAtMs`
  - optional `nonce`
- Add:
  - `buildHelperHealthCheckRequest(input)`
  - `buildHelperVersionGetRequest(input)`
- Keep random UUID and nonce generation behavior aligned with
  `buildHelperEnumerateRequest()`.

## Task 3: Verification

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

Revert only the new builder exports, tests, and documentation. No runtime helper
activation should be changed by this phase.
