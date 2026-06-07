# Phase B22 Helper Plan Registration Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve helper registration preflight blockers in scan diagnostics
helper plan output.

**Architecture:** `NativeScanOrchestrator` already records registration
preflight blockers in native helper scan logs. Phase B22 carries the same
blockers through the `onHelperPlan` message and shared `ScanHelperPlan` schema
so renderer/diagnostics consumers can explain why helper-backed enumeration
fell back to native scanning without parsing logs.

**Non-goals:**

- Do not enable helper-backed scans by default.
- Do not change helper plan engine selection.
- Do not alter registration preflight pass/fail semantics.
- Do not add UI copy beyond existing helper plan formatting.

---

### Task 1: Add RED Tests

**Files:**

- Modify: `test/main/nativeScanOrchestrator.test.ts`
- Modify: `test/main/scanDiagnostics.test.ts`
- Modify: `test/renderer/helperPlan.test.ts`

- [x] **Step 1: Assert orchestrator helper plan carries blockers**

Add coverage where helper registration preflight is blocked and assert
`handlers.helperPlans[0].registrationBlockers` contains the preflight blocker
codes.

- [x] **Step 2: Assert diagnostics schema preserves blockers**

Add coverage proving `buildScanDiagnostics` accepts and returns
`helperPlan.registrationBlockers`.

- [x] **Step 3: Assert renderer helper label remains stable**

Add coverage proving helper plan formatting ignores the new metadata and keeps
the existing label stable.

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts test/main/scanDiagnostics.test.ts test/renderer/helperPlan.test.ts
```

Expected RED: `registrationBlockers` is not present on the helper plan message
or shared schema.

Result:

- `pnpm test test/main/nativeScanOrchestrator.test.ts
  test/main/scanDiagnostics.test.ts test/renderer/helperPlan.test.ts` failed
  before implementation because `NativeHelperPlanMessage` did not include
  `registrationBlockers`.

### Task 2: Implement Helper Plan Blocker Propagation

**Files:**

- Modify: `src/main/services/scan/nativeScanOrchestrator.ts`
- Modify: `src/shared/schemas/scan.ts`

- [x] **Step 1: Extend shared helper plan schema**

Add optional `registrationBlockers: string[]` with non-empty string entries to
`ScanHelperPlanSchema`.

- [x] **Step 2: Populate helper plan message**

When `helperStatus.registrationPreflight?.blockers` exists and is non-empty,
attach a copy to `NativeHelperPlanMessage.registrationBlockers`.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b22-helper-plan-registration-blockers.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B22 section stating:

- helper plan diagnostics now preserve registration preflight blocker codes.
- this does not make helper ready or change fallback decisions.
- readiness remains blocked without production evidence.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts test/main/scanDiagnostics.test.ts test/renderer/helperPlan.test.ts
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

- `pnpm test test/main/nativeScanOrchestrator.test.ts
  test/main/scanDiagnostics.test.ts test/renderer/helperPlan.test.ts`: passed,
  3 files, 21 tests.
- `pnpm test`: passed, 45 files, 212 tests.
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

Ask the reviewer to inspect only Phase B22 for:

- helper default activation regressions.
- changing helper/native plan selection semantics.
- shared schema compatibility issues.
- leaking unstable or human-readable reasons instead of stable blocker codes.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Review result:

- Critical: none.
- Important: none.
- Minor: shared schema accepted any non-empty string for
  `registrationBlockers`; restrict it to stable blocker codes.

Fix:

- Added `ScanHelperRegistrationBlockerSchema`.
- Changed `registrationBlockers` to use the blocker enum schema.
- Typed `NativeHelperPlanMessage.registrationBlockers` from
  `HelperClientStatus["registrationPreflight"]["blockers"]`.
- Re-ran focused tests and typecheck successfully.

- [x] **Step 3: Commit**

```bash
git add src/main/services/scan/nativeScanOrchestrator.ts src/shared/schemas/scan.ts test/main/nativeScanOrchestrator.test.ts test/main/scanDiagnostics.test.ts test/renderer/helperPlan.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b22-helper-plan-registration-blockers.md
git commit -m "feat: expose helper plan registration blockers"
```

Result:

- Commit created with message
  `feat: expose helper plan registration blockers`.

## Rollback

Remove only the helper plan blocker metadata, tests, and B22 documentation. Do
not change helper registration gates or helper scan selection.
