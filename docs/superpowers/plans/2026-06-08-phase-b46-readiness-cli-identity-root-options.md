# Phase B46 Readiness CLI Identity Root Options Implementation Plan

Date: 2026-06-08

## Goal

Let `audit-helper-readiness` rehearse readiness against an explicit project root
and explicit production identity inputs, matching the readiness bundle script.

## Scope

Add `--project-root`, `--team-id`, and `--designated-requirement` support to
`scripts/audit-helper-readiness.ts`.

Do not change readiness semantics, ServiceManagement probing semantics,
`canEnableHelperByDefault`, or helper default activation.

## Task 1: RED Tests

- [x] Add a failing test proving explicit project root and identity options are
  used by `audit-helper-readiness`.
- [x] Add missing/option-looking value tests for new valued options.
- [x] Run focused test and confirm failure before implementation.

RED result:

- `pnpm test test/main/helperReadinessAuditScript.test.ts` failed as expected.
- Explicit identity/root options were ignored, and `--project-root` missing
  values did not produce a missing-value error.
- The test was adjusted to match B45 semantics: identity/root usage is proven by
  removing identity/listener blockers while other blockers remain.

## Task 2: Implementation

- [x] Pass explicit project root to preflight and registration input builders.
- [x] Overlay explicit team ID and designated requirement into the audit env.
- [x] Reject missing and option-looking values consistently.

## Task 3: Verification

- [x] Run focused readiness CLI tests.

Result:

- `pnpm test test/main/helperReadinessAuditScript.test.ts` passed, 1 file and
  9 tests.
- [x] Run related identity/bundle/preflight tests.

Result:

- `pnpm test test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperReadinessAudit.test.ts test/main/helperReadinessBundle.test.ts test/main/helperRegistration.test.ts`
  passed, 7 files and 44 tests.
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

Result:

- `pnpm test` passed, 55 files and 289 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  remained intentionally blocked.
- `pnpm audit:helper-readiness-bundle` remained intentionally blocked.

## Task 4: Review And Commit

- [x] Request sub-agent review for B46.
- [x] Address Critical and Important findings.
- [x] Commit B46 as one mini phase.

Review result:

- Sub-agent review reported no Critical, Important, or Minor findings. The
  review was static and did not rerun tests.
