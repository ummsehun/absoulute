# Phase B44 ServiceManagement Control Option Values Implementation Plan

Date: 2026-06-08

## Goal

Make `control-helper-service-management` reject option-looking values for CLI
options that require a value, matching the stricter helper audit/build scripts.

## Scope

Update `scripts/control-helper-service-management.ts` option parsing so
`--project-root --probe-bin` and `--probe-bin --project-root` fail as missing
values instead of treating the next option as a path.

Do not change ServiceManagement register/unregister semantics, confirmation
requirements, preflight gates, or helper default activation.

## Task 1: Characterize Current Gap

- [x] Confirm the script uses a local `resolveOptionalArg`.
- [x] Confirm the parser rejects empty/missing values but not option-looking
  values.

## Task 2: RED Tests

- [x] Add failing tests for option-looking values after:
  - `--project-root`;
  - `--probe-bin`.
- [x] Run focused test and confirm failure before implementation.

RED result:

- `pnpm test test/main/helperServiceManagementControlScript.test.ts` failed as
  expected.
- The script returned blocked output with empty stderr instead of rejecting
  option-looking values as missing values.
- Sub-agent review identified one Important finding: shared `--out` parsing
  also accepted option-looking values. Added RED coverage for shared output
  parsing and the control script before fixing it.

## Task 3: Implementation

- [x] Reject option-looking values in `resolveOptionalArg`.
- [x] Preserve existing behavior for valid values and default paths.

## Task 4: Verification

- [x] Run focused ServiceManagement control tests.

Result:

- `pnpm test test/main/helperServiceManagementControlScript.test.ts` passed, 1
  file and 5 tests.
- After the review fix,
  `pnpm test test/main/helperAuditOutput.test.ts test/main/helperServiceManagementControlScript.test.ts`
  passed, 2 files and 11 tests.
- [x] Run related helper ServiceManagement/readiness tests.

Result:

- `pnpm test test/main/helperServiceManagementControlScript.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/macosServiceManagementProbe.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts`
  passed, 5 files and 31 tests.
- After the shared `--out` parser fix,
  `pnpm test test/main/helperAuditOutput.test.ts test/main/helperServiceManagementControlScript.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperFdaMatrixAuditScript.test.ts`
  passed, 8 files and 33 tests.
- [x] Run full verification:
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`
  - `cargo test --manifest-path native/scanner/Cargo.toml`
  - `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  - `pnpm audit:helper-readiness-bundle`

Expected: tests and build checks pass; readiness audits remain intentionally
blocked.

Result:

- `pnpm test` passed, 55 files and 284 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  remained intentionally blocked.
- `pnpm audit:helper-readiness-bundle` remained intentionally blocked.

## Task 5: Review And Commit

- [x] Request sub-agent review for B44.
- [x] Address Critical and Important findings.
- [x] Commit B44 as one mini phase.

Review result:

- Initial sub-agent review found one Important issue: shared `--out` parsing
  accepted option-looking values.
- Follow-up sub-agent review reported no Critical, Important, or Minor
  findings after the shared `--out` parser fix.
