# Phase B50 Readiness Evidence Reasons Implementation Plan

Date: 2026-06-08

## Goal

Make helper readiness evidence distinguish missing artifacts from missing
explicit confirmations when the blocker name is shared.

## Scope

Update readiness `evidence.reason` for preflight-backed evidence:

- artifact missing: keep the existing blocker reason;
- artifact present but confirmation missing: report `<key>-confirmation-missing`;
- artifact and confirmation present but still not effective: report
  `<key>-effective-evidence-missing`.

Do not change blocker names, preflight semantics, ServiceManagement semantics,
FDA semantics, identity semantics, or helper default activation.

## Task 1: RED Tests

- [x] Add failing tests for confirmation-missing readiness evidence reasons.
- [x] Run focused test and confirm failure before implementation.

RED result:

- `pnpm test test/main/helperReadinessAudit.test.ts` failed as expected: 1
  file, 9 tests, 2 failed.
- Failing cases showed readiness evidence still used the broad blocker reason
  even when `artifactReady: true`, `confirmationReady: false`, and
  `effectiveReady: false`.

## Task 2: Implementation

- [x] Derive readiness evidence reasons from artifact/confirmation/effective
  state.
- [x] Preserve blocker list and default helper enablement semantics.

## Task 3: Verification

- [x] Run focused readiness tests.
- [x] Run related helper audit tests.
- [x] Run full verification:
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`
  - `cargo test --manifest-path native/scanner/Cargo.toml`
  - `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  - `pnpm audit:helper-readiness-bundle`

Expected: tests and build checks pass; readiness audits remain intentionally
blocked in the current repo, but evidence reasons better explain why.

Verification result:

- `pnpm test test/main/helperReadinessAudit.test.ts` passed, 1 file and 10
  tests.
- `pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessBundle.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperPreflightAudit.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperRegistration.test.ts`
  passed, 9 files and 68 tests.
- `pnpm test` passed, 55 files and 301 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  reported `status: "blocked"` and `canEnableHelperByDefault: false`, exiting
  1 as expected. Artifact-present confirmation gaps now report
  `*-confirmation-missing` evidence reasons.
- `pnpm audit:helper-readiness-bundle` reported `status: "blocked"` and
  `canEnableHelperByDefault: false`, exiting 1 as expected.

## Task 4: Review And Commit

- [x] Request sub-agent review for B50.
- [x] Address Critical and Important findings.
- [x] Commit B50 as one mini phase.

Review result:

- Sub-agent review reported no Critical or Important findings.
- One Minor suggestion requested direct coverage for
  `<key>-effective-evidence-missing`; the focused test was added and rerun.
- The review was static and did not rerun tests.
