# Phase B26 Helper ServiceManagement Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent helper ServiceManagement audit command so Phase B
can retain durable evidence about whether the privileged helper is registered,
missing, pending approval, or unavailable.

**Architecture:** Reuse the existing ServiceManagement probe binary resolver and
probe abstraction. The audit should report platform, resolved probe binary
evidence, probe state, probe reason, and a stable `status` of `ready` only when
the probe reports `registered`.

**Non-goals:**

- Do not register or unregister the helper in this phase.
- Do not make helper readiness pass.
- Do not change helper readiness gates.
- Do not enable helper-backed scans by default.
- Do not commit generated audit JSON.
- Prefer repo-external output paths such as `/tmp/...` for generated audit JSON.

---

### Task 1: Add RED Tests

**Files:**

- Modify: `test/main/macosServiceManagementProbe.test.ts`
- Add: `test/main/helperServiceManagementAuditScript.test.ts`

- [x] **Step 1: Assert ServiceManagement audit report builder**

Add a unit test proving the audit report includes:

- `status: "blocked"` when the probe state is not `registered`
- `platform`
- `probeBinaryPath`
- `probeBinaryReady`
- `serviceManagementStatus`
- `serviceManagementReason`

- [x] **Step 2: Assert ServiceManagement audit script output and exit status**

Add a script-level test proving `bun run
scripts/audit-helper-service-management.ts --probe-bin <stub> --out <file>`
writes the same JSON report to the file and exits 1 for an unregistered helper.

Run:

```bash
pnpm test test/main/macosServiceManagementProbe.test.ts test/main/helperServiceManagementAuditScript.test.ts
```

Expected RED: the ServiceManagement audit builder and script do not exist yet.

Result:

- `pnpm test test/main/macosServiceManagementProbe.test.ts
  test/main/helperServiceManagementAuditScript.test.ts` failed before
  implementation because the ServiceManagement audit builder and script did not
  exist.

### Task 2: Implement ServiceManagement Audit

**Files:**

- Modify: `src/main/services/helper/macosServiceManagementProbe.ts`
- Add: `scripts/audit-helper-service-management.ts`
- Modify: `package.json`

- [x] **Step 1: Add audit report builder**

Expose a small async builder that returns:

- `status`
- `platform`
- `probeBinaryPath`
- `probeBinaryReady`
- `serviceManagementStatus`
- `serviceManagementReason`

- [x] **Step 2: Add script and package command**

Add `scripts/audit-helper-service-management.ts` with:

- optional `--probe-bin <path>` mapped to `SCAN_HELPER_SM_PROBE_BIN`
- optional `--resources-path <path>`
- optional `--platform <platform>` for testability
- optional `--out <path>`
- stdout JSON unchanged by file writing
- exit 1 when blocked, exit 0 when ready

Add `audit:helper-service-management` to `package.json`.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b26-helper-service-management-audit.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B26 section stating:

- ServiceManagement status is now independently auditable and file-retainable.
- Current readiness remains blocked without registered ServiceManagement
  evidence.
- The audit does not register/unregister the helper.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/macosServiceManagementProbe.test.ts test/main/helperServiceManagementAuditScript.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-service-management
pnpm audit:helper-fda-matrix
pnpm audit:helper-preflight
pnpm audit:helper-readiness
```

Expected:

- tests, typecheck, lint, build, and Rust tests pass.
- ServiceManagement audit and helper readiness remain intentionally blocked.

Result:

- `pnpm test test/main/macosServiceManagementProbe.test.ts
  test/main/helperServiceManagementAuditScript.test.ts` passed after
  implementation: 2 files, 18 tests.
- `pnpm test` passed: 48 files, 232 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-service-management` printed `status: "blocked"`,
  `probeBinaryReady: false`, `serviceManagementStatus: "not-implemented"`, and
  exited 1 as intended.
- `pnpm audit:helper-fda-matrix` printed `status: "blocked"` and exited 1 as
  intended.
- `pnpm audit:helper-preflight` printed `status: "blocked"` and exited 0.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.
- Direct `--resources-path resources --out` check wrote
  `/tmp/luie-helper-audit-b26/service-management.json`; the file parsed as JSON
  and retained `status: "blocked"`, `probeBinaryReady: true`,
  `serviceManagementStatus: "not-installed"`, and reason `not-found`.
- Sub-agent review found no Critical or Important issues. Minor feedback about
  injected probe path evidence was addressed by requiring executable file
  evidence before reporting `probeBinaryReady: true`.

### Task 4: Review And Commit

**Files:**

- All files changed by Tasks 1-3.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B26 for:

- false-positive ServiceManagement readiness.
- changed helper readiness/preflight semantics.
- probe binary path handling.
- generated artifact commit risk.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Result:

- Initial sub-agent review found no Critical or Important issues.
- Minor feedback about injected probe path evidence was addressed by requiring
  executable file evidence before reporting `probeBinaryReady: true`.
- Follow-up sub-agent review found no Critical, Important, or Minor issues.

- [x] **Step 3: Commit**

```bash
git add src/main/services/helper/macosServiceManagementProbe.ts scripts/audit-helper-service-management.ts package.json test/main/macosServiceManagementProbe.test.ts test/main/helperServiceManagementAuditScript.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b26-helper-service-management-audit.md
git commit -m "feat: audit helper service management readiness"
```

Result:

- Committed with message `feat: audit helper service management readiness`.

## Rollback

Remove only the ServiceManagement audit builder, script, package command,
tests, and B26 documentation. Do not change helper readiness or preflight audit
semantics.
