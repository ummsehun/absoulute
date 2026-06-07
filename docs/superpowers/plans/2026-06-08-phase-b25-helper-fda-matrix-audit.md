# Phase B25 Helper FDA Matrix Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent helper FDA validation matrix audit command so
Phase B can retain durable evidence about which FDA scenarios still block
helper readiness.

**Architecture:** Reuse the existing FDA matrix reader and helper audit output
writer. The new audit should summarize target macOS readiness, scenario counts,
failed scenarios, missing passed scenarios, and scenarios missing evidence. It
must not mark FDA evidence ready unless every required scenario is passed with
validated evidence on a concrete target macOS version.

**Non-goals:**

- Do not record real FDA evidence in this phase.
- Do not make helper readiness pass.
- Do not change helper readiness gates.
- Do not enable helper-backed scans by default.
- Do not commit generated audit JSON.
- Prefer repo-external output paths such as `/tmp/...` for generated audit JSON.

---

### Task 1: Add RED Tests

**Files:**

- Modify: `test/main/helperFdaValidationMatrix.test.ts`
- Add: `test/main/helperFdaMatrixAuditScript.test.ts`

- [x] **Step 1: Assert FDA audit summary for blocked matrix**

Add a unit test proving the FDA audit reports:

- `status: "blocked"`
- `targetMacOSReady: false` for `pending`
- all required scenarios in `missingPassedScenarios`
- all pending scenarios in `scenariosMissingEvidence`

- [x] **Step 2: Assert FDA audit script output and exit status**

Add a script-level test proving `bun run scripts/audit-helper-fda-matrix.ts
--project-root <temp> --out <file>` writes the same JSON report to the file and
exits 1 while the matrix is blocked.

Run:

```bash
pnpm test test/main/helperFdaValidationMatrix.test.ts test/main/helperFdaMatrixAuditScript.test.ts
```

Expected RED: the FDA audit builder and script do not exist yet.

Result:

- `pnpm test test/main/helperFdaValidationMatrix.test.ts
  test/main/helperFdaMatrixAuditScript.test.ts` failed before implementation
  because the FDA audit builder and script did not exist.

### Task 2: Implement FDA Matrix Audit

**Files:**

- Modify: `src/main/services/helper/helperFdaValidationMatrix.ts`
- Add: `scripts/audit-helper-fda-matrix.ts`
- Modify: `package.json`

- [x] **Step 1: Add audit report builder**

Expose a small builder that reads the current matrix and returns a stable JSON
report containing:

- `status`
- `targetMacOS`
- `targetMacOSReady`
- `scenarioCount`
- `passedScenarioCount`
- `failedScenarios`
- `missingPassedScenarios`
- `scenariosMissingEvidence`

- [x] **Step 2: Add script and package command**

Add `scripts/audit-helper-fda-matrix.ts` with:

- optional `--project-root <path>`
- optional `--out <path>`
- stdout JSON unchanged by file writing
- exit 1 when blocked, exit 0 when ready

Add `audit:helper-fda-matrix` to `package.json`.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b25-helper-fda-matrix-audit.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B25 section stating:

- FDA matrix audit is now independent and file-retainable.
- Current repo matrix remains blocked with `targetMacOS: "pending"`.
- Helper readiness remains blocked.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperFdaValidationMatrix.test.ts test/main/helperFdaMatrixAuditScript.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-fda-matrix
pnpm audit:helper-preflight
pnpm audit:helper-readiness
```

Expected:

- tests, typecheck, lint, build, and Rust tests pass.
- FDA audit and helper readiness remain intentionally blocked.

Result:

- `pnpm test test/main/helperFdaValidationMatrix.test.ts
  test/main/helperFdaMatrixAuditScript.test.ts` passed after implementation:
  2 files, 11 tests.
- `pnpm test` passed: 47 files, 226 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-fda-matrix` printed `status: "blocked"`,
  `targetMacOS: "pending"`, `passedScenarioCount: 0`, and exited 1 as
  intended.
- `pnpm audit:helper-preflight` printed `status: "blocked"` and exited 0.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.
- Direct `--out` check wrote `/tmp/luie-helper-audit-b25/fda-matrix.json`;
  the file parsed as JSON and retained `status: "blocked"`,
  `targetMacOSReady: false`, six missing passed scenarios, and six scenarios
  missing evidence.
- `bun run scripts/audit-helper-fda-matrix.ts --out` failed explicitly with
  `--out requires an output file path`.

### Task 4: Review And Commit

**Files:**

- All files changed by Tasks 1-3.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B25 for:

- FDA audit report shape stability.
- false-positive FDA readiness.
- changed helper readiness/preflight semantics.
- generated artifact commit risk.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Result:

- Sub-agent review found no Critical or Important issues.
- Minor feedback about shared `--out` missing-path error consistency was
  addressed.
- Minor feedback about CLI ready and missing-argument coverage was addressed
  with additional script tests.
- Follow-up sub-agent review found no Critical, Important, or Minor issues.

- [x] **Step 3: Commit**

```bash
git add src/main/services/helper/helperFdaValidationMatrix.ts scripts/audit-helper-fda-matrix.ts package.json test/main/helperFdaValidationMatrix.test.ts test/main/helperFdaMatrixAuditScript.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b25-helper-fda-matrix-audit.md
git commit -m "feat: audit helper fda matrix readiness"
```

Result:

- Committed with message `feat: audit helper fda matrix readiness`.

## Rollback

Remove only the FDA matrix audit builder, script, package command, tests, and
B25 documentation. Do not change helper readiness or preflight audit semantics.
