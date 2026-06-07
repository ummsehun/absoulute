# Phase B49 ServiceManagement Audit Option Values Implementation Plan

Date: 2026-06-08

## Goal

Make `audit-helper-service-management` reject option-looking values for all
valued CLI options, matching the stricter readiness, identity, preflight, and
control scripts.

## Scope

Update `scripts/audit-helper-service-management.ts` option parsing for:

- `--resources-path`
- `--probe-bin`
- `--platform`

Do not change ServiceManagement probe semantics, readiness evidence, FDA
evidence, identity evidence, or helper default activation.

## Task 1: RED Tests

- [x] Add failing tests for option-looking values after ServiceManagement audit
  valued options.
- [x] Run focused test and confirm failure before implementation.

RED result:

- `pnpm test test/main/helperServiceManagementAuditScript.test.ts` failed as
  expected: 1 file, 7 tests, 3 failed.
- Failing cases showed option-looking values after `--resources-path`,
  `--probe-bin`, and `--platform` were not rejected at the option boundary.

## Task 2: Implementation

- [x] Reject option-looking values in the ServiceManagement audit script
  `resolveOptionalArg`.
- [x] Preserve existing valid-value behavior and default paths.

## Task 3: Verification

- [x] Run focused ServiceManagement audit CLI tests.
- [x] Run related readiness/service-management tests.
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

Verification result:

- `pnpm test test/main/helperServiceManagementAuditScript.test.ts` passed, 1
  file and 7 tests.
- `pnpm test test/main/helperServiceManagementAuditScript.test.ts test/main/macosServiceManagementProbe.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperReadinessAudit.test.ts test/main/helperReadinessBundle.test.ts test/main/helperRegistration.test.ts`
  passed, 9 files and 73 tests.
- `pnpm test` passed, 55 files and 299 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  reported `status: "blocked"` and `canEnableHelperByDefault: false`, exiting
  1 as expected.
- `pnpm audit:helper-readiness-bundle` reported `status: "blocked"` and
  `canEnableHelperByDefault: false`, exiting 1 as expected.

## Task 4: Review And Commit

- [x] Request sub-agent review for B49.
- [x] Address Critical and Important findings.
- [x] Commit B49 as one mini phase.

Review result:

- Sub-agent review reported no Critical, Important, or Minor findings.
- The review was static and did not rerun tests.
