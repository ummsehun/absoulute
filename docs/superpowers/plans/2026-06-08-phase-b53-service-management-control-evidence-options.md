# Phase B53 ServiceManagement Control Evidence Options Implementation Plan

Date: 2026-06-08

## Goal

Allow `control-helper-service-management register` to reuse the same explicit
identity and artifact confirmation options as the preflight/readiness audit
CLIs.

## Scope

Add valued options to `scripts/control-helper-service-management.ts`:

- `--team-id <team-id>`
- `--designated-requirement <requirement>`

Add boolean flags:

- `--confirm-packaging-entitlements`
- `--confirm-privileged-helper-executable`
- `--confirm-helper-xpc-enumerate-bridge`
- `--confirm-fda-validation-matrix`

Do not change the required `--confirm` safety gate, ServiceManagement controller
result validation, preflight semantics, artifact checks, or helper default
activation.

## Task 1: RED Tests

- [x] Add failing test proving explicit evidence options allow confirmed
  register to pass install preflight and invoke the controller.
- [x] Add valued option missing-value coverage for new options.
- [x] Run focused tests and confirm failure before implementation.

RED result:

- `pnpm test test/main/helperServiceManagementControlScript.test.ts` failed as
  expected: 1 file, 9 tests, 3 failed.
- Failing cases showed explicit evidence options did not reach the register
  preflight env and new valued options were not parsed.

## Task 2: Implementation

- [x] Overlay identity options into the ServiceManagement control env.
- [x] Overlay confirmation flags into the ServiceManagement control env.
- [x] Preserve existing probe env behavior, `--confirm` gate, and option value
  parsing.

## Task 3: Verification

- [x] Run focused ServiceManagement control tests.
- [x] Run related helper audit/control tests.
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

- `pnpm test test/main/helperServiceManagementControlScript.test.ts` passed, 1
  file and 9 tests.
- `pnpm test test/main/helperServiceManagementControlScript.test.ts test/main/macosServiceManagementProbe.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperPreflightAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperReadinessAudit.test.ts test/main/helperReadinessBundle.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperRegistration.test.ts`
  passed, 11 files and 98 tests.
- `pnpm test` passed, 55 files and 310 tests.
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

- [x] Request sub-agent review for B53.
- [x] Address Critical and Important findings.
- [x] Commit B53 as one mini phase.

Review result:

- Sub-agent review reported no Critical or Important findings. The review was
  static and did not rerun tests.
- One Minor test coverage suggestion was addressed by exercising
  `--confirm-helper-xpc-enumerate-bridge` and
  `--confirm-fda-validation-matrix` in the confirmed register preflight test.
- After the review follow-up, `pnpm test
  test/main/helperServiceManagementControlScript.test.ts` passed, 1 file and 9
  tests.
- Current-state verification after the review follow-up:
  - `pnpm test` passed, 55 files and 310 tests.
  - `pnpm typecheck` passed.
  - `pnpm lint` passed.
  - `pnpm build` passed.
  - `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing
    Rust dead-code warnings remain.
  - `pnpm audit:helper-readiness --platform darwin --resources-path resources`
    and `pnpm audit:helper-readiness-bundle` reported blocked and exited 1 as
    expected.
