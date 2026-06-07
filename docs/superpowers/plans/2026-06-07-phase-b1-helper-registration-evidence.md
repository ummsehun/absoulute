# Phase B1 Helper Registration Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make privileged-helper identity, packaging, and ServiceManagement registration evidence explicit enough that Phase B helper IPC work can proceed without guessing.

**Architecture:** Keep helper execution disabled by default. Add evidence readers and audit output around the existing `helperRegistration`, `helperReadinessAudit`, and `macosServiceManagementProbe` boundaries; do not add helper lifecycle state to `DiskScanService`, renderer hooks, or `src/shared`. Production Team ID and designated requirement remain externally supplied evidence, never hard-coded guesses.

**Tech Stack:** Electron main process, TypeScript, Vitest, Bun scripts, Swift `SMAppService` probe, macOS helper bundle resources.

---

## File Structure

- Modify: `src/main/services/helper/helperRegistration.ts`
  - Owns app/helper registration contract, signing requirement construction, packaging evidence, listener requirement metadata, and FDA matrix evidence.
- Modify: `src/main/services/helper/helperReadinessAudit.ts`
  - Adds structured evidence details for each readiness blocker without changing `canEnableHelperByDefault`.
- Modify: `scripts/audit-helper-readiness.ts`
  - Prints the expanded evidence report and keeps exit code `1` while readiness is blocked.
- Modify: `test/main/helperRegistration.test.ts`
  - Covers identity metadata and packaging evidence edge cases.
- Modify: `test/main/helperReadinessAudit.test.ts`
  - Covers blocker-to-evidence mapping and default-disabled behavior.
- Modify: `docs/project-status-audit.md`
  - Records Phase B1 status, commands, and remaining external blockers.

## Non-Goals

- Do not enable helper execution by default.
- Do not invent a Team ID, production bundle identifier, signing identity, notarization result, or FDA result.
- Do not implement helper-backed scan enumeration in this mini phase.
- Do not change renderer UI.
- Do not add privileged write, delete, chmod, chown, or arbitrary command operations.

## Task 1: Expand Helper Readiness Evidence Details

**Files:**
- Modify: `test/main/helperReadinessAudit.test.ts`
- Modify: `src/main/services/helper/helperReadinessAudit.ts`
- Modify: `scripts/audit-helper-readiness.ts`

- [x] **Step 1: Write failing readiness evidence test**

Add a test proving the readiness report includes stable evidence entries for identity, packaging, FDA, and ServiceManagement blockers.

Run:

```bash
pnpm test test/main/helperReadinessAudit.test.ts
```

Expected RED:

```text
expected report.evidence to equal [...]
```

- [x] **Step 2: Implement evidence entries**

Extend `HelperReadinessReport` with:

```ts
evidence: Array<{
  key: string;
  status: "pass" | "fail" | "unknown";
  reason: string;
}>;
```

Rules:

- `team-id-missing` maps to `key: "team-id"`, `status: "fail"`.
- `designated-requirement-missing` maps to `key: "designated-requirement"`, `status: "fail"`.
- `packaging-entitlements-missing` maps to `key: "packaging-entitlements"`, `status: "fail"`.
- `privileged-helper-executable-missing` maps to `key: "privileged-helper-executable"`, `status: "fail"`.
- `privileged-helper-listener-requirement-missing` maps to `key: "listener-requirement"`, `status: "fail"`.
- `fda-validation-matrix-missing` maps to `key: "fda-validation-matrix"`, `status: "fail"`.
- non-registered ServiceManagement maps to `key: "service-management"`, `status: "fail"`.

- [x] **Step 3: Run GREEN**

Run:

```bash
pnpm test test/main/helperReadinessAudit.test.ts
```

Expected: all tests pass.

## Task 2: Make Registration Evidence Auditable Without Env Guessing

**Files:**
- Modify: `test/main/helperRegistration.test.ts`
- Modify: `src/main/services/helper/helperRegistration.ts`

- [x] **Step 1: Write failing metadata mismatch tests**

Add tests for these cases:

- requirement metadata has `ready: true` but Team ID does not match env Team ID.
- requirement metadata has matching Team ID but requirement string does not equal `buildHelperCodeSigningRequirement(teamId)`.
- helper executable exists and is executable, but `electron-builder.json` does not package both LaunchServices executable and LaunchDaemons plist.

Run:

```bash
pnpm test test/main/helperRegistration.test.ts
```

Expected RED only if the current code misses one of these cases. If all pass, record the existing coverage in the plan by checking this task and do not alter production code.

Current result: existing tests already cover these mismatch cases; `pnpm test test/main/helperRegistration.test.ts` passed with 13 tests.

- [x] **Step 2: Implement only missing checks**

If a test fails, add the minimal check inside the existing evidence reader. Do not add new environment variables.

- [x] **Step 3: Run GREEN**

Run:

```bash
pnpm test test/main/helperRegistration.test.ts
```

Expected: all tests pass.

## Task 3: Record Phase B1 Evidence in Project Audit

**Files:**
- Modify: `docs/project-status-audit.md`

- [x] **Step 1: Add Phase B1 subsection**

Add a section named `Phase B1 Helper Registration Evidence`.

It must distinguish:

- Facts proven by code/tests.
- External blockers still missing.
- Commands run.

- [x] **Step 2: Re-run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-readiness
```

Expected:

- `pnpm test`, `typecheck`, `lint`, `build`, and `cargo test` pass.
- `cargo test` may still emit the documented 6 Rust dead-code warnings.
- `pnpm audit:helper-readiness` exits `1` with `status: "blocked"` until real identity/FDA/ServiceManagement evidence exists.

## Task 4: Subagent Code Review and Commit

**Files:**
- Review all files changed in this mini phase.

- [x] **Step 1: Request subagent code review**

Ask the subagent to focus on:

- accidental helper default enablement.
- blocker evidence that can be spoofed by partial metadata.
- ServiceManagement status being treated as ready too early.
- documentation claiming external evidence that does not exist.

- [x] **Step 2: Address Critical and Important findings**

Add failing tests before production changes for any behavior issue.

- [x] **Step 3: Commit the mini phase**

Run:

```bash
git add src/main/services/helper/helperRegistration.ts src/main/services/helper/helperReadinessAudit.ts scripts/audit-helper-readiness.ts test/main/helperRegistration.test.ts test/main/helperReadinessAudit.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-07-phase-b1-helper-registration-evidence.md
git commit -m "feat: expand helper registration evidence"
```

Expected: one commit for Phase B1 registration evidence.
