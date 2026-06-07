# Phase B23 Helper Prototype Audit Registration Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include helper registration blocker evidence in helper prototype audit
summaries.

**Architecture:** Phase B22 carries registration preflight blocker codes through
`NativeHelperPlanMessage`. Phase B23 consumes that metadata in
`summarizeHelperPrototypeAudit` so `scripts/audit-helper-prototype-scan.ts`
outputs whether the helper scan plan was registration-blocked and which stable
blocker codes were involved.

**Non-goals:**

- Do not enable helper-backed scans by default.
- Do not change helper/native scan selection.
- Do not change helper readiness gates.
- Do not add UI copy or renderer behavior.

---

### Task 1: Add RED Tests

**Files:**

- Modify: `test/main/helperPrototypeAuditSummary.test.ts`

- [x] **Step 1: Assert audit summary preserves registration blockers**

Add coverage proving `summarizeHelperPrototypeAudit` returns:

- `registrationBlocked: true` when the latest helper plan includes registration
  blockers.
- `registrationBlockers` copied from the latest helper plan.

Run:

```bash
pnpm test test/main/helperPrototypeAuditSummary.test.ts
```

Expected RED: summary output does not expose registration blocker metadata yet.

Result:

- `pnpm test test/main/helperPrototypeAuditSummary.test.ts` failed before
  implementation because summary output did not include
  `registrationBlocked` or `registrationBlockers`.

### Task 2: Implement Audit Summary Metadata

**Files:**

- Modify: `src/main/services/diagnostics/helperPrototypeAuditSummary.ts`

- [x] **Step 1: Extend summary contract**

Add:

- `registrationBlocked: boolean`
- `registrationBlockers: NativeHelperPlanMessage["registrationBlockers"]`

- [x] **Step 2: Populate from latest helper plan**

Use the latest helper plan only, matching the existing summary behavior for
engine, transport, and prototype status.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b23-helper-prototype-audit-registration-blockers.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B23 section stating:

- helper prototype audit summaries now include registration blocker evidence.
- this does not make helper ready or change fallback decisions.
- readiness remains blocked without production evidence.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperPrototypeAuditSummary.test.ts
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

- `pnpm test test/main/helperPrototypeAuditSummary.test.ts`: passed, 1 file,
  2 tests before review, then 3 tests after addressing review feedback.
- `pnpm test`: passed, 45 files, 213 tests before review, then 214 tests after
  addressing review feedback.
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

Ask the reviewer to inspect only Phase B23 for:

- helper readiness or scan selection regressions.
- unstable human-readable reasons being mixed into blocker arrays.
- summary output claiming production readiness.
- backward compatibility of existing audit summary fields.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Review result:

- Critical: none.
- Important: none.
- Minor: summary copied `registrationBlockers` without re-validating stable
  blocker codes.

Fix:

- Added a regression test with a human-readable string mixed into
  `registrationBlockers`.
- Filtered summary blockers through `ScanHelperRegistrationBlockerSchema`.
- Re-ran `pnpm test test/main/helperPrototypeAuditSummary.test.ts`: passed, 1
  file, 3 tests.
- Re-ran `pnpm typecheck`: passed.

- [x] **Step 3: Commit**

```bash
git add src/main/services/diagnostics/helperPrototypeAuditSummary.ts test/main/helperPrototypeAuditSummary.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b23-helper-prototype-audit-registration-blockers.md
git commit -m "feat: include helper audit registration blockers"
```

Result:

- Commit created with message
  `feat: include helper audit registration blockers`.

## Rollback

Remove only the helper prototype audit summary metadata, tests, and B23
documentation. Do not change helper scan selection or readiness gates.
