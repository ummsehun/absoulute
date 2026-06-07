# Phase B52 Preflight CLI Evidence Options Implementation Plan

Date: 2026-06-08

## Goal

Allow `audit-helper-preflight` to accept explicit identity and artifact
confirmation options so install preflight can be rehearsed without manual env
setup.

## Scope

Add valued options:

- `--team-id <team-id>`
- `--designated-requirement <requirement>`

Add boolean flags:

- `--confirm-packaging-entitlements`
- `--confirm-privileged-helper-executable`
- `--confirm-helper-xpc-enumerate-bridge`
- `--confirm-fda-validation-matrix`

Do not change artifact checks, blocker names, ServiceManagement behavior, FDA
matrix semantics, or helper default activation.

## Task 1: RED Tests

- [x] Add failing tests proving identity options affect preflight env evidence.
- [x] Add failing tests proving confirmation flags affect preflight env
  evidence.
- [x] Run focused tests and confirm failure before implementation.

RED result:

- `pnpm test test/main/helperPreflightAuditScript.test.ts` failed as expected:
  1 file, 5 tests, 2 failed.
- Failing cases showed explicit identity options and artifact confirmation flags
  were ignored by the preflight audit CLI.

## Task 2: Implementation

- [x] Overlay identity options into the preflight audit env.
- [x] Overlay confirmation flags into the preflight audit env.
- [x] Preserve existing env behavior and option value parsing.

## Task 3: Verification

- [x] Run focused preflight script tests.
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

- `pnpm test test/main/helperPreflightAuditScript.test.ts` passed, 1 file and
  7 tests.
- `pnpm test test/main/helperPreflightAuditScript.test.ts test/main/helperPreflightAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperReadinessAudit.test.ts test/main/helperReadinessBundle.test.ts test/main/helperServiceManagementControlScript.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperRegistration.test.ts`
  passed, 10 files and 80 tests.
- `pnpm test` passed, 55 files and 307 tests.
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

- [x] Request sub-agent review for B52.
- [x] Address Critical and Important findings.
- [x] Commit B52 as one mini phase.

Review result:

- Sub-agent review reported no Critical or Important findings.
- Minor suggestions were addressed by asserting the new option tests remain
  `blocked` and adding missing-value coverage for `--team-id` and
  `--designated-requirement`.
- The review was static and did not rerun tests.
