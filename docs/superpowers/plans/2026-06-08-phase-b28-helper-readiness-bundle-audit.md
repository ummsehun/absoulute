# Phase B28 Helper Readiness Bundle Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a combined helper readiness evidence bundle so Phase B can retain
one JSON artifact containing identity, FDA, ServiceManagement, preflight, and
readiness evidence.

**Architecture:** Reuse existing audit builders. The bundle should not invent
new readiness rules; it should summarize the existing component audit statuses
and include the existing readiness report. The bundle is `ready` only when the
existing readiness report is ready.

**Non-goals:**

- Do not make helper readiness pass.
- Do not change helper readiness gates.
- Do not record production identity, FDA, or registration evidence.
- Do not enable helper-backed scans by default.
- Do not commit generated audit JSON.
- Prefer repo-external output paths such as `/tmp/...` for generated audit JSON.

---

### Task 1: Add RED Tests

**Files:**

- Add: `test/main/helperReadinessBundle.test.ts`
- Add: `test/main/helperReadinessBundleScript.test.ts`

- [x] **Step 1: Assert blocked bundle report**

Add a unit test proving the bundle reports:

- top-level `status: "blocked"`
- `canEnableHelperByDefault: false`
- component statuses for identity, FDA, ServiceManagement, preflight, and
  readiness
- readiness blockers are preserved

- [x] **Step 2: Assert bundle script output and exit status**

Add a script-level test proving `bun run scripts/audit-helper-readiness-bundle.ts
--project-root <temp> --out <file>` writes the same JSON report to the file and
exits 1 while readiness is blocked.

Run:

```bash
pnpm test test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts
```

Expected RED: the readiness bundle builder and script do not exist yet.

Result:

- RED confirmed before implementation: the focused test command failed because
  the readiness bundle builder and script did not exist yet.
- GREEN after implementation: `pnpm test test/main/helperReadinessBundle.test.ts
  test/main/helperReadinessBundleScript.test.ts` passed, 2 files and 5 tests
  after review feedback added explicit CLI option coverage.

### Task 2: Implement Readiness Bundle

**Files:**

- Add: `src/main/services/helper/helperReadinessBundle.ts`
- Add: `scripts/audit-helper-readiness-bundle.ts`
- Modify: `package.json`

- [x] **Step 1: Add bundle builder**

Expose an async builder that returns:

- `status`
- `canEnableHelperByDefault`
- `componentStatus`
- `blockers`
- `identity`
- `fdaMatrix`
- `serviceManagement`
- `preflight`
- `readiness`

- [x] **Step 2: Add script and package command**

Add `scripts/audit-helper-readiness-bundle.ts` with:

- optional `--project-root <path>`
- optional `--team-id <team-id>`
- optional `--designated-requirement <requirement>`
- optional `--probe-bin <path>`
- optional `--resources-path <path>`
- optional `--platform <platform>`
- optional `--out <path>`
- stdout JSON unchanged by file writing
- exit 1 when blocked, exit 0 when ready

Add `audit:helper-readiness-bundle` to `package.json`.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b28-helper-readiness-bundle-audit.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B28 section stating:

- component audits are now retainable as one bundle.
- current bundle remains blocked.
- helper readiness remains blocked.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-readiness-bundle
pnpm audit:helper-identity
pnpm audit:helper-service-management
pnpm audit:helper-fda-matrix
pnpm audit:helper-preflight
pnpm audit:helper-readiness
```

Expected:

- tests, typecheck, lint, build, and Rust tests pass.
- bundle and helper readiness remain intentionally blocked.

Result:

- Focused tests passed: 2 files, 5 tests.
- Direct `bun run scripts/audit-helper-readiness-bundle.ts --out
  /tmp/luie-helper-audit-b28/readiness-bundle.json` wrote parseable JSON and
  exited 1 as intended because the bundle remained blocked.
- `pnpm test` passed: 52 files, 243 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed with the
  existing Rust dead-code warnings.
- `pnpm audit:helper-readiness-bundle` printed blocked bundle readiness and
  exited 1 as intended.
- `pnpm audit:helper-identity` printed blocked identity readiness and exited 1
  as intended.
- `pnpm audit:helper-service-management` printed blocked ServiceManagement
  readiness and exited 1 as intended.
- `pnpm audit:helper-fda-matrix` printed blocked FDA matrix readiness and
  exited 1 as intended.
- `pnpm audit:helper-preflight` printed blocked preflight status and exited 0.
- `pnpm audit:helper-readiness` printed blocked readiness and exited 1 as
  intended.

### Task 4: Review And Commit

**Files:**

- All files changed by Tasks 1-3.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B28 for:

- changed readiness semantics.
- false-positive bundle readiness.
- accidental hard-coded production evidence.
- generated artifact commit risk.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Result:

- Sub-agent review reported no Critical or Important findings.
- Minor finding: script-level coverage did not pin explicit
  `--team-id`, `--designated-requirement`, and `--probe-bin` forwarding.
- Addressed by adding a bundle script test that passes explicit identity and
  ServiceManagement probe options while keeping top-level readiness blocked.
- Re-run focused test passed: 2 files, 5 tests.
- Re-run `pnpm test`, `pnpm typecheck`, and `pnpm lint` passed.
- Sub-agent re-review reported no Critical, Important, or Minor findings and
  said the change is ready to commit.

- [x] **Step 3: Commit**

```bash
git add src/main/services/helper/helperReadinessBundle.ts scripts/audit-helper-readiness-bundle.ts package.json test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b28-helper-readiness-bundle-audit.md
git commit -m "feat: bundle helper readiness evidence"
```

## Rollback

Remove only the readiness bundle builder, script, package command, tests, and
B28 documentation. Do not change helper readiness or preflight audit semantics.
