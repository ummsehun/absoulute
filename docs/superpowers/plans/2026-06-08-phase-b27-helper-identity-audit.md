# Phase B27 Helper Identity Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent helper identity audit command so Phase B can retain
durable evidence for Team ID, designated requirement, and listener requirement
metadata blockers.

**Architecture:** Keep `helperRegistration.ts` under the 500 LOC boundary by
placing the audit builder in a small adjacent service. Reuse existing
registration validators and listener requirement evidence checks. The audit
should report `ready` only when Team ID, designated requirement, and listener
requirement metadata all match.

**Non-goals:**

- Do not invent or record a production Team ID.
- Do not make helper readiness pass.
- Do not change helper readiness gates.
- Do not rebuild helper artifacts.
- Do not enable helper-backed scans by default.
- Do not commit generated audit JSON.
- Prefer repo-external output paths such as `/tmp/...` for generated audit JSON.

---

### Task 1: Add RED Tests

**Files:**

- Add: `test/main/helperIdentityAudit.test.ts`
- Add: `test/main/helperIdentityAuditScript.test.ts`

- [x] **Step 1: Assert blocked identity audit**

Add a unit test proving the audit reports:

- `status: "blocked"` with missing Team ID and designated requirement
- listener metadata is detected when present
- listener metadata does not count as ready without matching production Team ID

- [x] **Step 2: Assert identity audit script output and exit status**

Add a script-level test proving `bun run scripts/audit-helper-identity.ts
--project-root <temp> --out <file>` writes the same JSON report to the file and
exits 1 while identity evidence is blocked.

Run:

```bash
pnpm test test/main/helperIdentityAudit.test.ts test/main/helperIdentityAuditScript.test.ts
```

Expected RED: the identity audit builder and script do not exist yet.

Result:

- `pnpm test test/main/helperIdentityAudit.test.ts
  test/main/helperIdentityAuditScript.test.ts` failed before implementation
  because the identity audit builder and script did not exist.

### Task 2: Implement Identity Audit

**Files:**

- Add: `src/main/services/helper/helperIdentityAudit.ts`
- Add: `scripts/audit-helper-identity.ts`
- Modify: `package.json`

- [x] **Step 1: Add audit report builder**

Expose a small builder that returns:

- `status`
- `teamId`
- `teamIdReady`
- `designatedRequirement`
- `designatedRequirementReady`
- `listenerRequirementMetadataFound`
- `listenerRequirementReady`
- `listenerRequirementTeamId`
- `listenerRequirement`
- `blockers`

- [x] **Step 2: Add script and package command**

Add `scripts/audit-helper-identity.ts` with:

- optional `--project-root <path>`
- optional `--team-id <team-id>`
- optional `--designated-requirement <requirement>`
- optional `--out <path>`
- stdout JSON unchanged by file writing
- exit 1 when blocked, exit 0 when ready

Add `audit:helper-identity` to `package.json`.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify: `docs/superpowers/plans/2026-06-08-phase-b27-helper-identity-audit.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B27 section stating:

- helper identity is now independently auditable and file-retainable.
- current repo identity remains blocked with placeholder listener metadata.
- helper readiness remains blocked.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperIdentityAudit.test.ts test/main/helperIdentityAuditScript.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-identity
pnpm audit:helper-service-management
pnpm audit:helper-fda-matrix
pnpm audit:helper-preflight
pnpm audit:helper-readiness
```

Expected:

- tests, typecheck, lint, build, and Rust tests pass.
- identity audit and helper readiness remain intentionally blocked.

Result:

- `pnpm test test/main/helperIdentityAudit.test.ts
  test/main/helperIdentityAuditScript.test.ts` passed after implementation:
  2 files, 6 tests.
- `pnpm test` passed: 50 files, 238 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-identity` printed `status: "blocked"`,
  `teamIdReady: false`, `designatedRequirementReady: false`,
  `listenerRequirementReady: false`, and exited 1 as intended.
- `pnpm audit:helper-service-management` printed `status: "blocked"` and
  exited 1 as intended.
- `pnpm audit:helper-fda-matrix` printed `status: "blocked"` and exited 1 as
  intended.
- `pnpm audit:helper-preflight` printed `status: "blocked"` and exited 0.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.
- Direct `--out` check wrote `/tmp/luie-helper-audit-b27/identity.json`; the
  file parsed as JSON and retained `status: "blocked"` with
  `team-id-missing`, `designated-requirement-missing`, and
  `privileged-helper-listener-requirement-missing`.

### Task 4: Review And Commit

**Files:**

- All files changed by Tasks 1-3.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B27 for:

- false-positive identity readiness.
- changed helper readiness/preflight semantics.
- accidental hard-coded production identity.
- generated artifact commit risk.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Result:

- Sub-agent review found no Critical, Important, or Minor issues.
- Review confirmed no false-positive identity readiness path was visible.
- Review confirmed `ABCDE12345` is confined to tests and no production identity
  was hard-coded.
- Review confirmed `helperRegistration.ts` remains below 500 LOC.

- [x] **Step 3: Commit**

```bash
git add src/main/services/helper/helperIdentityAudit.ts scripts/audit-helper-identity.ts package.json test/main/helperIdentityAudit.test.ts test/main/helperIdentityAuditScript.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b27-helper-identity-audit.md
git commit -m "feat: audit helper identity readiness"
```

Result:

- Committed with message `feat: audit helper identity readiness`.

## Rollback

Remove only the identity audit builder, script, package command, tests, and B27
documentation. Do not change helper readiness or preflight audit semantics.
