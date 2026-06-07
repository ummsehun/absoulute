# Phase B14 Helper Preflight Remediation Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add blocker-specific remediation actions to `audit:helper-preflight`
so install/eumerate readiness work can proceed without guessing commands or
evidence inputs.

**Architecture:** Keep `helperPreflightAudit.ts` as the preflight reporting
boundary. Add diagnostic remediation metadata derived from the existing blocker
list. Remediation actions are advisory only; they do not change blocker
calculation, `installReady`, `enumerateReady`, strict exit code, or helper
activation.

**Tech Stack:** TypeScript, Vitest, Bun script execution.

---

### Task 1: Add Remediation Actions To Preflight Audit

**Files:**
- Modify: `src/main/services/helper/helperPreflightAudit.ts`
- Modify: `test/main/helperPreflightAudit.test.ts`

- [ ] **Step 1: Write failing tests**

Add assertions that blocked preflight audits include a `remediation` array with
one item per blocker. Each item should include:

- `blocker`
- `description`
- `commands` when a local command can produce evidence
- `requiredInputs` when env evidence is required
- `requiredArtifacts` when a file/path must exist

Required blocker mappings:

- `team-id-missing`: `SCAN_HELPER_TEAM_ID`
- `designated-requirement-missing`: `SCAN_HELPER_DESIGNATED_REQUIREMENT`
- `packaging-entitlements-missing`: `SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY`,
  `electron-builder.json`, entitlement plist paths
- `privileged-helper-executable-missing`:
  `SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY`,
  `pnpm build:native:privileged-helper`,
  helper executable path
- `privileged-helper-listener-requirement-missing`:
  `pnpm build:native:privileged-helper`,
  requirement metadata path
- `fda-validation-matrix-missing`:
  `SCAN_HELPER_FDA_VALIDATION_MATRIX_READY`,
  `pnpm record:helper-fda-scenario`,
  FDA matrix path

Run:

```bash
pnpm test test/main/helperPreflightAudit.test.ts
```

Expected RED: preflight audit currently has no `remediation` property.

- [ ] **Step 2: Implement minimal remediation metadata**

Extend `HelperPreflightAudit` with `remediation`. Build actions from the current
blocker list using existing exported constants wherever available.

- [ ] **Step 3: Verify tests pass**

Run:

```bash
pnpm test test/main/helperPreflightAudit.test.ts
```

Expected GREEN: preflight audit tests pass.

### Task 2: Document B14 State

**Files:**
- Modify: `docs/project-status-audit.md`
- Modify: `docs/superpowers/plans/2026-06-08-phase-b14-helper-preflight-remediation-actions.md`

- [ ] **Step 1: Document facts and limits**

Add a Phase B14 section stating:

- preflight audit now includes remediation actions for each blocker.
- remediation actions are diagnostic only.
- helper default activation and readiness semantics remain unchanged.
- external production evidence is still required.

- [ ] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperPreflightAudit.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-preflight
pnpm audit:helper-readiness
```

Expected:

- tests, typecheck, lint, build, and Rust tests pass.
- `pnpm audit:helper-preflight` prints remediation actions.
- `pnpm audit:helper-readiness` remains intentionally blocked.

### Task 3: Review And Commit

**Files:**
- All files changed by Tasks 1-2.

- [ ] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B14 for:

- readiness overclaiming
- incorrect commands/env/path guidance
- strict mode exit-code regressions
- helper default activation regressions

- [ ] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Review feedback addressed:

- FDA remediation now includes `pnpm record:helper-fda-scenario --list` and a
  placeholder-filled recording command instead of a bare command that would fail
  without required arguments.

- [ ] **Step 3: Commit**

```bash
git add src/main/services/helper/helperPreflightAudit.ts test/main/helperPreflightAudit.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b14-helper-preflight-remediation-actions.md
git commit -m "feat: add helper preflight remediation actions"
```

## Rollback

Remove only remediation metadata, tests, and documentation. Do not alter
readiness pass/fail semantics, strict mode exit codes, or helper defaults.
