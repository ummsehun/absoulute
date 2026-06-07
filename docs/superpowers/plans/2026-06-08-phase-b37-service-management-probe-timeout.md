# Phase B37 ServiceManagement Probe Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:test-driven-development for code changes and request sub-agent
> review before committing this mini phase.

**Goal:** Reduce recurring full-suite flakiness where ServiceManagement probe
shell commands can exceed the current 2 second timeout under parallel test load.

**Architecture:** Keep probe semantics unchanged. Increase only the default
command timeout for ServiceManagement probe/controller invocations. Explicit
`timeoutMs` options must continue to override the default.

**Non-goals:**

- Do not change ServiceManagement readiness semantics.
- Do not mark helper readiness ready.
- Do not enable helper defaults.
- Do not hide command failures or invalid output.

---

### Task 1: Add RED Timeout Tests

**Files:**

- Modify: `test/main/macosServiceManagementProbe.test.ts`

- [x] **Step 1: Raise default probe timeout expectation**

Update the default command request expectation from 2 seconds to 10 seconds.

- [x] **Step 2: Prove explicit timeout still wins**

Add or update a test proving a caller-provided `timeoutMs` is still passed
through unchanged.

Expected RED:

- Focused tests fail because the production default is still 2 seconds.

Result:

- RED confirmed: `pnpm test test/main/macosServiceManagementProbe.test.ts`
  failed because default probe/controller requests still used `timeoutMs: 2000`
  instead of `timeoutMs: 10000`.
- Explicit `timeoutMs` override test passed during RED, proving override
  behavior already existed.

### Task 2: Implement Timeout Change

**Files:**

- Modify: `src/main/services/helper/macosServiceManagementProbe.ts`

- [x] **Step 1: Add named default timeout constant**

Add `MACOS_SERVICE_MANAGEMENT_PROBE_TIMEOUT_MS = 10_000`.

- [x] **Step 2: Use the named default**

Use the constant for `CommandMacOsServiceManagementProbe` when `timeoutMs` is
not provided.

- [x] **Step 3: Preserve explicit timeout override**

No behavior change for callers that pass `timeoutMs`.

### Task 3: Verify And Document

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b37-service-management-probe-timeout.md`

- [x] **Step 1: Run focused tests**

```bash
pnpm test test/main/macosServiceManagementProbe.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperClient.test.ts
```

- [x] **Step 2: Run full verification**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-readiness --platform darwin --resources-path resources
pnpm audit:helper-readiness-bundle
```

Expected:

- Tests, typecheck, lint, build, and Rust tests pass.
- Readiness audits remain intentionally blocked.

Result:

- `pnpm test test/main/macosServiceManagementProbe.test.ts` passed, 1 file and
  15 tests.
- `pnpm test test/main/macosServiceManagementProbe.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperClient.test.ts`
  passed, 4 files and 60 tests.
- `pnpm test` passed, 54 files and 262 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  remained intentionally blocked.
- `pnpm audit:helper-readiness-bundle` remained intentionally blocked.

### Task 4: Review And Commit

- [x] **Step 1: Request sub-agent review**

Ask the reviewer to check default timeout change, explicit override behavior,
unchanged readiness semantics, and helper default activation.

- [x] **Step 2: Address Critical and Important findings**

- [x] **Step 3: Commit**

```bash
git add src/main/services/helper/macosServiceManagementProbe.ts test/main/macosServiceManagementProbe.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b37-service-management-probe-timeout.md
git commit -m "fix: stabilize service management probe timeout"
```

Result:

- Sub-agent `019ea2d3-1d6c-7493-ab61-c05eb15e73ce` reviewed B37.
- Critical: none.
- Important: none.
- Minor: none.
- Reviewer confirmed the default timeout is raised to `10_000`, probe and
  controller paths share the default, explicit `timeoutMs` overrides still work,
  readiness semantics are unchanged, and helper default activation is unchanged.
- Reviewer did not run tests; verification was performed locally in Task 3.
- Committed as `cf4d4bd fix: stabilize service management probe timeout`.

## Rollback

Revert only B37 timeout constant, test expectation changes, and documentation.
