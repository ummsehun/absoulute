# Phase B47 Readiness Bundle Option Values Implementation Plan

Date: 2026-06-08

## Goal

Make `audit-helper-readiness-bundle` reject option-looking values for all
valued CLI options, matching the stricter readiness CLI and helper build
scripts.

## Scope

Update `scripts/audit-helper-readiness-bundle.ts` option parsing for:

- `--project-root`
- `--team-id`
- `--designated-requirement`
- `--probe-bin`

Do not change readiness bundle semantics, ServiceManagement probing semantics,
`canEnableHelperByDefault`, or helper default activation.

## Task 1: RED Tests

- [x] Add failing tests for option-looking values after bundle valued options.
- [x] Run focused test and confirm failure before implementation.

RED result:

- `pnpm test test/main/helperReadinessBundleScript.test.ts` failed as expected.
- Bundle valued options accepted option-looking values or reported the later
  option as missing because the parser did not reject values starting with
  `--`.

## Task 2: Implementation

- [x] Reject option-looking values in the bundle script `resolveOptionalArg`.
- [x] Preserve existing valid-value behavior and default paths.

## Task 3: Verification

- [x] Run focused readiness bundle CLI tests.

Result:

- `pnpm test test/main/helperReadinessBundleScript.test.ts` passed, 1 file and
  7 tests.
- [x] Run related readiness/identity/preflight tests.

Result:

- `pnpm test test/main/helperReadinessBundleScript.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperReadinessAudit.test.ts test/main/helperReadinessBundle.test.ts test/main/helperRegistration.test.ts`
  passed, 7 files and 48 tests.
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

- `pnpm test` passed, 55 files and 293 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  remained intentionally blocked.
- `pnpm audit:helper-readiness-bundle` remained intentionally blocked.

## Task 4: Review And Commit

- [x] Request sub-agent review for B47.
- [x] Address Critical and Important findings.
- [x] Commit B47 as one mini phase.

Review result:

- Sub-agent review reported no Critical, Important, or Minor findings. The
  review was static and did not rerun tests.
