# Phase B43 Helper Enumerate Build Project Root Implementation Plan

Date: 2026-06-08

## Goal

Let the standalone helper enumerate build script generate artifacts under an
explicit project root so build rehearsals can use isolated roots without
writing into the live repository.

## Scope

Add `--project-root <path>` parsing to
`scripts/build-macos-helper-enumerate.ts` and use that root for the Swift
source, packaged binary output, and Swift module cache paths.

Do not change helper enumerate protocol, traversal behavior, readiness gates,
or helper default activation.

## Task 1: Characterize Current Gap

- [x] Confirm `scripts/build-macos-helper-enumerate.ts` still uses
  `process.cwd()` directly for source, output, and module cache paths.
- [x] Confirm related build scripts already support `--project-root`.

## Task 2: RED Tests

- [x] Add failing tests for:
  - artifact output and module cache under explicit `--project-root`;
  - missing `--project-root` value;
  - option-looking `--project-root` value.
- [x] Run focused test and confirm failure before implementation.

RED result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` failed as expected.
- New helper enumerate build tests failed because:
  - the script did not write `helper-enumerate-macos` under the explicit
    artifact root;
  - missing `--project-root` value exited `0`;
  - option-looking `--project-root` value exited `0`.

## Task 3: Implementation

- [x] Parse `--project-root <path>` with the same validation as adjacent build
  scripts.
- [x] Resolve `sourcePath`, `outputPath`, and `moduleCachePath` from the
  selected root.
- [x] Preserve `process.cwd()` behavior when `--project-root` is absent.

## Task 4: Verification

- [x] Run focused helper build tests.

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` passed, 1 file and
  21 tests.
- [x] Run related helper tests.

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperPackaging.test.ts test/main/macosHelperEnumerateCli.test.ts test/main/helperClient.test.ts`
  passed, 4 files and 73 tests.
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

- `pnpm test` passed, 55 files and 280 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  remained intentionally blocked.
- `pnpm audit:helper-readiness-bundle` remained intentionally blocked.

## Task 5: Review And Commit

- [x] Request sub-agent review for B43.
- [x] Address Critical and Important findings.
- [x] Commit B43 as one mini phase.

Sub-agent review result: no Critical, Important, or Minor findings. The review
was static and did not rerun tests. No review findings required code changes.
