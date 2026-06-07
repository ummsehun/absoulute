# Phase B54 Production Bundle Identifier Gate Implementation Plan

Date: 2026-06-08

## Goal

Make helper registration/readiness block explicitly while the app bundle
identifier is still a development placeholder.

## Scope

Add a production bundle identifier gate to helper registration evidence.

Files:

- Modify `src/main/services/helper/helperRegistration.ts`.
- Modify `src/main/services/helper/helperReadinessAudit.ts`.
- Modify `src/shared/schemas/scan.ts`.
- Modify focused helper registration/readiness tests.
- Update `docs/project-status-audit.md`.

Do not change real app identity values, ServiceManagement registration,
privileged helper executable contents, FDA matrix semantics, or helper default
activation.

## Task 1: RED Tests

- [x] Add a focused helper registration test showing the default
  `com.example.diskvisualizer` contract remains blocked by
  `production-bundle-identifier-missing` even when the other helper gates are
  present.
- [x] Add an env parsing test showing `SCAN_HELPER_APP_BUNDLE_ID` can provide a
  non-placeholder bundle identifier for synthetic readiness/preflight evidence.
- [x] Add helper readiness evidence assertions for the new blocker and pass
  reason.
- [x] Run focused tests and confirm failure before implementation.

RED result:

- `pnpm test test/main/helperRegistration.test.ts
  test/main/helperReadinessAudit.test.ts` failed as expected: 2 files, 25
  tests, 6 failed.
- Failing cases showed the production bundle identifier blocker, explicit app
  bundle id env parsing, configurable designated requirement, listener
  requirement matching, and readiness evidence mapping were missing.

## Task 2: Implementation

- [x] Add `production-bundle-identifier-missing` to the registration blocker
  type and shared scan schema.
- [x] Add `SCAN_HELPER_APP_BUNDLE_ID` parsing to helper registration evidence.
- [x] Treat missing, `com.example`, and `*.example.*` bundle identifiers as not
  production-ready.
- [x] Validate designated requirements against the effective bundle identifier.
- [x] Add readiness evidence guidance for the production bundle identifier gate.
- [x] Keep `canEnableHelperByDefault` false.

Implementation notes:

- `audit-helper-identity`, `audit-helper-preflight`,
  `audit-helper-readiness`, `audit-helper-readiness-bundle`, and
  `control-helper-service-management` now accept `--app-bundle-id`.
- Identity audit, preflight audit, readiness audit, readiness bundle, and shared
  scan schema now carry `production-bundle-identifier-missing`.

## Task 3: Verification

- [x] Run focused helper registration/readiness tests.
- [x] Run related helper audit, readiness bundle, planner, and client tests.
- [x] Run full verification:
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`
  - `cargo test --manifest-path native/scanner/Cargo.toml`
  - `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  - `pnpm audit:helper-readiness-bundle`

Expected: tests and build checks pass; readiness audits remain intentionally
blocked in the current repo because `com.example.diskvisualizer` is still a
development identifier and external identity/FDA/ServiceManagement evidence is
missing.

Verification result:

- `pnpm test test/main/helperRegistration.test.ts
  test/main/helperReadinessAudit.test.ts` passed, 2 files and 25 tests.
- `pnpm test test/main/helperIdentityAudit.test.ts
  test/main/helperIdentityAuditScript.test.ts test/main/helperRegistration.test.ts
  test/main/helperPreflightAudit.test.ts test/main/helperPreflightAuditScript.test.ts
  test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts
  test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts
  test/main/helperServiceManagementControlScript.test.ts test/main/helperClient.test.ts
  test/main/helperScanPlanner.test.ts test/main/nativeScanOrchestrator.test.ts
  test/main/sharedBoundary.test.ts test/main/scanPolicyContract.test.ts` passed,
  15 files and 148 tests.
- `pnpm test` passed, 55 files and 316 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  reported `status: "blocked"`, `canEnableHelperByDefault: false`, and
  included `production-bundle-identifier-missing`, exiting 1 as expected.
- `pnpm audit:helper-readiness-bundle` reported `status: "blocked"`,
  `canEnableHelperByDefault: false`, and included
  `production-bundle-identifier-missing`, exiting 1 as expected.

## Task 4: Review And Commit

- [x] Document B54 facts and verification in `docs/project-status-audit.md`.
- [x] Request sub-agent review for B54.
- [x] Address Critical and Important findings.
- [x] Commit B54 as one mini phase.

Review result:

- Sub-agent review reported no Critical or Important findings. The review was
  static and did not rerun tests.
- Minor findings were addressed:
  - `helperReadinessBundle.ts` now uses `HELPER_APP_BUNDLE_ID_ENV` instead of a
    direct env key string.
  - The helper identity, preflight, readiness, readiness bundle, and
    ServiceManagement control script tests now cover option-looking
    `--app-bundle-id` missing values.
- After the review follow-up, `pnpm test
  test/main/helperIdentityAuditScript.test.ts
  test/main/helperPreflightAuditScript.test.ts
  test/main/helperReadinessAuditScript.test.ts
  test/main/helperReadinessBundleScript.test.ts
  test/main/helperServiceManagementControlScript.test.ts` passed, 5 files and
  46 tests.
- Current-state verification after the review follow-up:
  - `pnpm test` passed, 55 files and 316 tests.
  - `pnpm typecheck` passed.
  - `pnpm lint` passed.
  - `pnpm build` passed.
  - `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing
    Rust dead-code warnings remain.
  - `pnpm audit:helper-readiness --platform darwin --resources-path resources`
    and `pnpm audit:helper-readiness-bundle` reported blocked and exited 1 as
    expected.
