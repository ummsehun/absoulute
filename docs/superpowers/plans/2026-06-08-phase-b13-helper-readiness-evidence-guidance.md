# Phase B13 Helper Readiness Evidence Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `audit:helper-readiness` explain exactly which external evidence
inputs are required for each blocker without treating missing evidence as ready.

**Architecture:** Keep readiness decisions in `helperReadinessAudit.ts`. Add
non-authoritative guidance metadata to each evidence item so the audit output
lists the env vars, files, packaged resources, and probe state needed to resolve
the blocker. Guidance is diagnostic only; `status`, `blockers`, and
`canEnableHelperByDefault` semantics do not change.

**Tech Stack:** TypeScript, Vitest, Bun script execution.

---

### Task 1: Add Evidence Guidance To Readiness Report

**Files:**
- Modify: `src/main/services/helper/helperReadinessAudit.ts`
- Modify: `test/main/helperReadinessAudit.test.ts`

- [ ] **Step 1: Write failing tests**

Add assertions that every failed readiness evidence item includes a `guidance`
object with:

- `requiredInputs`: stable env vars or probe inputs.
- `requiredArtifacts`: stable file/resource paths when applicable.
- `description`: a short human-readable explanation.

Required mappings:

- `team-id`: `SCAN_HELPER_TEAM_ID`
- `designated-requirement`: `SCAN_HELPER_DESIGNATED_REQUIREMENT`
- `packaging-entitlements`: `SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY`,
  `electron-builder.json`, `resources/entitlements/mac.plist`,
  `resources/entitlements/mac.inherit.plist`
- `privileged-helper-executable`: `SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY`,
  `resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper`
- `listener-requirement`:
  `resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper.requirement.json`
- `fda-validation-matrix`: `SCAN_HELPER_FDA_VALIDATION_MATRIX_READY`,
  `docs/helper-fda-validation-matrix.json`
- `service-management`: `SCAN_HELPER_SM_PROBE_BIN` or packaged
  `service-management-probe-macos`

Run:

```bash
pnpm test test/main/helperReadinessAudit.test.ts
```

Expected RED: evidence items currently have no `guidance` property.

- [ ] **Step 2: Implement minimal guidance metadata**

Extend `HelperReadinessEvidence` with optional `guidance`. Add a helper that
maps evidence keys to stable guidance. Attach guidance to both blocker evidence
and the service-management evidence entry.

- [ ] **Step 3: Verify tests pass**

Run:

```bash
pnpm test test/main/helperReadinessAudit.test.ts
```

Expected GREEN: readiness audit unit tests pass.

### Task 2: Document B13 State

**Files:**
- Modify: `docs/project-status-audit.md`
- Modify: `docs/superpowers/plans/2026-06-08-phase-b13-helper-readiness-evidence-guidance.md`

- [ ] **Step 1: Document facts and limits**

Add a Phase B13 section stating:

- readiness evidence now includes diagnostic guidance.
- guidance does not make evidence pass.
- helper remains disabled by default.
- external production identity, FDA, and ServiceManagement evidence are still
  required.

- [ ] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperReadinessAudit.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-readiness
```

Expected:

- tests, typecheck, lint, build, and Rust tests pass.
- `pnpm audit:helper-readiness` remains intentionally blocked, but failed
  evidence entries include guidance metadata.

### Task 3: Review And Commit

**Files:**
- All files changed by Tasks 1-2.

- [ ] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B13 for:

- overclaiming readiness
- unstable paths or env names
- evidence ordering or API compatibility regressions
- helper default activation regressions

- [ ] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Review feedback addressed:

- guidance metadata now references existing exported constants for helper Team
  ID, designated requirement, FDA matrix, privileged helper executable,
  listener requirement, and ServiceManagement probe inputs/artifacts where
  constants already exist.

- [ ] **Step 3: Commit**

```bash
git add src/main/services/helper/helperReadinessAudit.ts test/main/helperReadinessAudit.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b13-helper-readiness-evidence-guidance.md
git commit -m "feat: add helper readiness evidence guidance"
```

## Rollback

Remove only the guidance metadata, tests, and documentation. Do not alter
readiness pass/fail semantics or helper transport defaults.
