# Phase B36 Helper FDA Recorder CLI Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:test-driven-development for code changes and request sub-agent
> review before committing this mini phase.

**Goal:** Make `record-helper-fda-scenario` usable against an explicit project
root and able to write its JSON result to an explicit output file.

**Architecture:** Reuse the existing FDA matrix recorder service. Add only CLI
plumbing for `--project-root` and `--out`, matching the audit scripts so FDA
evidence can be rehearsed in temporary project roots before touching the real
repository matrix.

**Non-goals:**

- Do not mark current FDA readiness complete.
- Do not fabricate FDA scenario evidence.
- Do not modify the real `docs/helper-fda-validation-matrix.json` in tests.
- Do not change FDA matrix validation semantics.

---

### Task 1: Add RED Recorder Script Tests

**Files:**

- Add: `test/main/helperFdaScenarioRecorderScript.test.ts`

- [x] **Step 1: Record into explicit project root**

Add a test proving:

```bash
bun run scripts/record-helper-fda-scenario.ts --project-root <tmp> ...
```

writes `docs/helper-fda-validation-matrix.json` under `<tmp>`, not the real
repo.

- [x] **Step 2: Write recorder output to `--out`**

Add a test proving `--out <file>` writes the same JSON result that appears on
stdout.

- [x] **Step 3: List scenarios from explicit project root**

Add a test proving `--list --project-root <tmp>` reads the selected matrix.

Expected RED:

- Tests fail because the recorder script currently ignores `--project-root` and
  has no `--out` support.

Result:

- RED confirmed: `pnpm test test/main/helperFdaScenarioRecorderScript.test.ts`
  failed because `--project-root` was ignored, `--out` was not written, and
  `--list` read the real repo matrix instead of the selected project root.
- The RED run briefly modified the real `docs/helper-fda-validation-matrix.json`
  because the old script ignored `--project-root`; the matrix was restored to
  the original pending state before commit.

### Task 2: Implement CLI Options

**Files:**

- Modify: `scripts/record-helper-fda-scenario.ts`

- [x] **Step 1: Parse `--project-root`**

Pass the selected root into `listHelperFdaScenarios()` and
`recordHelperFdaScenario()`.

- [x] **Step 2: Parse and write `--out`**

Use shared helper audit output handling for output file writing.

- [x] **Step 3: Preserve existing CLI behavior**

Keep `--list`, required argument validation, default status, and default
`validated-at` behavior unchanged.

### Task 3: Verify And Document

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b36-helper-fda-recorder-cli-options.md`

- [x] **Step 1: Run focused tests**

```bash
pnpm test test/main/helperFdaScenarioRecorderScript.test.ts test/main/helperFdaValidationMatrix.test.ts test/main/helperFdaMatrixAuditScript.test.ts
```

- [x] **Step 2: Run FDA audits**

```bash
pnpm audit:helper-fda-matrix
pnpm audit:helper-readiness --platform darwin --resources-path resources
```

Expected:

- Tests pass.
- Audits remain intentionally blocked for the current repo.

Result:

- `pnpm test test/main/helperFdaScenarioRecorderScript.test.ts` passed, 1 file
  and 3 tests.
- `pnpm test test/main/helperFdaScenarioRecorderScript.test.ts test/main/helperFdaValidationMatrix.test.ts test/main/helperFdaMatrixAuditScript.test.ts`
  passed, 3 files and 14 tests.
- `pnpm audit:helper-fda-matrix` remained intentionally blocked with
  `targetMacOS: "pending"` and zero passed scenarios.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  remained intentionally blocked.

- [x] **Step 3: Run full verification**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
```

Result:

- Initial `pnpm test` surfaced recurring ServiceManagement probe timeout
  failures unrelated to this FDA recorder change. The related
  ServiceManagement tests passed when rerun in a focused set.
- Rerunning `pnpm test` passed, 54 files and 261 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.

### Task 4: Review And Commit

- [x] **Step 1: Request sub-agent review**

Ask the reviewer to check CLI option parsing, real matrix isolation in tests,
output file behavior, unchanged FDA validation semantics, and readiness gates.

- [x] **Step 2: Address Critical and Important findings**

- [x] **Step 3: Commit**

```bash
git add scripts/record-helper-fda-scenario.ts test/main/helperFdaScenarioRecorderScript.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b36-helper-fda-recorder-cli-options.md
git commit -m "feat: add helper fda recorder options"
```

Result:

- Sub-agent `019ea2d3-1d6c-7493-ab61-c05eb15e73ce` reviewed B36.
- Critical: none.
- Important: none.
- Minor: none.
- Reviewer confirmed `--project-root` is passed to list and record paths,
  `--out` writes stdout-equivalent JSON, tests isolate temporary matrices, and
  FDA validation/readiness/default helper gates are unchanged.
- Reviewer did not run tests; verification was performed locally in Task 3.
- Committed as `c470930 feat: add helper fda recorder options`.

## Rollback

Revert only B36 recorder CLI options, tests, and documentation.
