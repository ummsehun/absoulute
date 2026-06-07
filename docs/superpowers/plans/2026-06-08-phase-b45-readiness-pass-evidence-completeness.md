# Phase B45 Readiness Pass Evidence Completeness Implementation Plan

Date: 2026-06-08

## Goal

Make helper readiness audits explain why a fully evidenced helper is ready, not
only why a blocked helper is blocked.

## Scope

Update `buildHelperReadinessReport` so ready evidence includes pass entries for
all readiness gates:

- team ID
- designated requirement
- packaging entitlements
- privileged helper executable
- listener requirement metadata
- FDA validation matrix
- XPC enumerate bridge
- ServiceManagement registration

Do not change blocker calculation, `canEnableHelperByDefault`, default helper
activation, or ServiceManagement semantics.

## Task 1: RED Tests

- [x] Add a readiness audit test proving ready reports include pass evidence for
  all gates.
- [x] Run focused test and confirm failure before implementation.

RED result:

- `pnpm test test/main/helperReadinessAudit.test.ts` failed as expected.
- The ready report emitted only `service-management` pass evidence instead of
  pass evidence for all preflight/FDA/identity gates.
- The first implementation was narrowed after it added pass evidence to blocked
  reports too. Pass evidence is now emitted only when no blockers remain.

## Task 2: Implementation

- [x] Add pass evidence for non-blocked preflight gates.
- [x] Keep failed evidence for blockers unchanged.
- [x] Keep ServiceManagement pass/fail evidence unchanged.
- [x] Keep `canEnableHelperByDefault: false`.

## Task 3: Verification

- [x] Run focused readiness audit tests.

Result:

- `pnpm test test/main/helperReadinessAudit.test.ts` passed, 1 file and 8
  tests.
- [x] Run related helper readiness/preflight/bundle tests.

Result:

- `pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessBundle.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperPreflightAudit.test.ts test/main/helperRegistration.test.ts`
  passed, 6 files and 40 tests.
- [x] Run full verification:
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`
  - `cargo test --manifest-path native/scanner/Cargo.toml`
  - `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  - `pnpm audit:helper-readiness-bundle`

Expected: tests and build checks pass; readiness audits remain intentionally
blocked in the current repo.

Partial result:

- Initial `pnpm test` run failed with multiple timeout/resource symptoms across
  unrelated files.
- Failed files passed when rerun in focused groups.
- A second `pnpm test` run passed, 55 files and 284 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  remained intentionally blocked.
- `pnpm audit:helper-readiness-bundle` remained intentionally blocked.

## Task 4: Review And Commit

- [x] Request sub-agent review for B45.
- [x] Address Critical and Important findings.
- [x] Commit B45 as one mini phase.

Review result:

- Sub-agent review reported no Critical, Important, or Minor findings. The
  review was static and did not rerun tests.
