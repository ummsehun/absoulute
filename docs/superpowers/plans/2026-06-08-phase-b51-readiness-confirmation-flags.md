# Phase B51 Readiness Confirmation Flags Implementation Plan

Date: 2026-06-08

## Goal

Allow helper readiness audit CLIs to accept explicit artifact confirmation flags
without requiring callers to set environment variables manually.

## Scope

Add boolean CLI flags to:

- `scripts/audit-helper-readiness.ts`
- `scripts/audit-helper-readiness-bundle.ts`

Flags:

- `--confirm-packaging-entitlements`
- `--confirm-privileged-helper-executable`
- `--confirm-helper-xpc-enumerate-bridge`
- `--confirm-fda-validation-matrix`

Do not change artifact evidence checks, blocker names, ServiceManagement
semantics, FDA semantics, identity semantics, or helper default activation.

## Task 1: RED Tests

- [x] Add failing tests proving confirmation flags affect readiness CLI env
  evidence.
- [x] Run focused tests and confirm failure before implementation.

RED result:

- `pnpm test test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts`
  failed as expected: 2 files, 18 tests, 2 failed.
- Failing cases showed confirmation flags were ignored and artifact-backed
  blockers remained in readiness output.

## Task 2: Implementation

- [x] Overlay confirmation flag values into the audit env for readiness CLI.
- [x] Overlay confirmation flag values into the audit env for readiness bundle
  CLI.
- [x] Preserve existing env behavior and option value parsing.

## Task 3: Verification

- [x] Run focused readiness script tests.
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
blocked in the current repo unless all external evidence is supplied.

Verification result:

- `pnpm test test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts`
  passed, 2 files and 18 tests.
- `pnpm test test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperReadinessAudit.test.ts test/main/helperReadinessBundle.test.ts test/main/helperPreflightAudit.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperRegistration.test.ts`
  passed, 9 files and 70 tests.
- `pnpm test` passed, 55 files and 303 tests.
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

- [x] Request sub-agent review for B51.
- [x] Address Critical and Important findings.
- [x] Commit B51 as one mini phase.

Review result:

- Sub-agent review reported no Critical or Important findings.
- One Minor suggestion requested direct coverage for
  `--confirm-fda-validation-matrix`; the bundle script test now asserts the FDA
  confirmation flag reaches `preflight.confirmations.fdaValidationMatrix`.
- The review was static and did not rerun tests.
