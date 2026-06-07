# Phase B21 ServiceManagement Probe Binary Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden ServiceManagement probe/control binary resolution so helper
install/probe paths do not treat missing or non-executable files as usable
evidence.

**Architecture:** Keep ServiceManagement execution isolated in
`macosServiceManagementProbe.ts`. The env override and packaged resource
fallback should resolve only to files that exist and are executable. This keeps
script-based test probes possible while preventing an empty packaged placeholder
from being selected as a production probe/control command.

**Non-goals:**

- Do not run real `SMAppService.register()` in tests.
- Do not claim ServiceManagement registration is ready.
- Do not require the env override to be Mach-O; executable fixture scripts
  remain valid for audits and tests.
- Do not enable helper-backed scans by default.

---

### Task 1: Add RED Tests

**Files:**

- Modify: `test/main/macosServiceManagementProbe.test.ts`

- [x] **Step 1: Assert explicit env path evidence**

Add assertions that:

- missing `SCAN_HELPER_SM_PROBE_BIN` paths are ignored.
- existing but non-executable env paths are ignored.
- executable env paths still resolve, including script fixtures.

- [x] **Step 2: Assert packaged fallback evidence**

Add assertions that:

- a non-executable packaged `service-management-probe-macos` file is ignored.
- an executable packaged file is selected.

Run:

```bash
pnpm test test/main/macosServiceManagementProbe.test.ts
```

Expected RED: `resolveMacOsServiceManagementProbeBinary` currently accepts
explicit env paths without checking the filesystem and accepts an empty packaged
fallback file.

Result:

- `pnpm test test/main/macosServiceManagementProbe.test.ts` failed before
  implementation because explicit env paths and an empty packaged fallback file
  were selected without executable file evidence.

### Task 2: Implement Binary Evidence Guard

**Files:**

- Modify: `src/main/services/helper/macosServiceManagementProbe.ts`

- [x] **Step 1: Guard binary path resolution**

Add a small resolver helper that returns a path only when it is a file and has
at least one executable bit.

- [x] **Step 2: Apply guard to env and packaged fallback**

Use the helper for:

- `SCAN_HELPER_SM_PROBE_BIN`
- `<resourcesPath>/bin/service-management-probe-macos`

Expected behavior:

- missing/non-executable paths return `null`.
- `createMacOsServiceManagementProbeFromEnv` falls back to
  `NotImplementedMacOsServiceManagementProbe`.
- `createMacOsServiceManagementControllerFromEnv` falls back to `null`.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b21-service-management-probe-binary-evidence.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B21 section stating:

- ServiceManagement probe/control binary resolution now requires executable
  file evidence.
- env script fixtures remain supported.
- readiness remains blocked without real ServiceManagement registration,
  identity, and FDA evidence.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/macosServiceManagementProbe.test.ts
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
- helper readiness remains intentionally blocked.

Result:

- `pnpm test test/main/macosServiceManagementProbe.test.ts`: passed, 1 file,
  11 tests before review, then 12 tests after addressing review feedback.
- `pnpm test test/main/helperReadinessAuditScript.test.ts
  test/main/helperClient.test.ts test/main/macosServiceManagementProbe.test.ts`:
  passed, 3 files, 46 tests.
- `pnpm test`: passed, 45 files, 211 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight while production
  identity/FDA confirmations remain missing.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.

### Task 4: Review And Commit

**Files:**

- All files changed by Tasks 1-3.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B21 for:

- ServiceManagement readiness overclaiming.
- breaking executable script probe fixtures.
- accidentally running real ServiceManagement commands in tests.
- helper default activation regressions.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Review result:

- Critical: none.
- Important: explicit invalid `SCAN_HELPER_SM_PROBE_BIN` fell through to the
  packaged fallback when one existed.
- Minor: missing regression coverage for invalid env path plus executable
  packaged fallback.

Fix:

- Added regression coverage for invalid explicit env path with an executable
  packaged fallback.
- Changed resolver behavior so an explicit but invalid env override returns
  `null` immediately.
- Re-ran `pnpm test test/main/macosServiceManagementProbe.test.ts`: passed, 1
  file, 12 tests.

- [x] **Step 3: Commit**

```bash
git add src/main/services/helper/macosServiceManagementProbe.ts test/main/macosServiceManagementProbe.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b21-service-management-probe-binary-evidence.md
git commit -m "fix: require executable service management probe evidence"
```

Result:

- Commit created with message
  `fix: require executable service management probe evidence`.

## Rollback

Revert only the ServiceManagement binary resolution guard, tests, and B21
documentation. Do not alter the ServiceManagement Swift probe or helper
registration gates.
