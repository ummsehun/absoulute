# Phase B58 Helper Readiness Blocker Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve helper readiness blockers in scan diagnostics so fallback
scans explain why production helper scanning is not active.

**Architecture:** Keep registration preflight blockers unchanged. Add a
separate `readinessBlockers` field to helper plan diagnostics for readiness
gates that are not registration preflight blockers, such as peer validation and
ServiceManagement availability.

**Tech Stack:** Electron main process TypeScript, shared Zod scan schema,
Vitest.

---

### Task 1: Add RED Diagnostics Coverage

**Files:**

- Modify: `test/main/nativeScanOrchestrator.test.ts`
- Modify: `test/main/scanDiagnostics.test.ts`
- Modify: `test/main/helperPrototypeAuditSummary.test.ts`

- [x] **Step 1: Assert orchestrator preserves readiness blockers**

Extend the helper blocked scan-plan test with a helper status containing:

```ts
readinessBlockers: [
  "helper-peer-validation-missing",
  "service-management-not-registered",
]
```

Expected helper plan output must include the same `readinessBlockers` while
keeping `registrationBlockers` unchanged.

- [x] **Step 2: Assert shared diagnostics schema preserves readiness blockers**

Add `readinessBlockers` to the helper plan fixture in
`test/main/scanDiagnostics.test.ts` and assert `ScanDiagnosticsSchema.parse()`
round-trips it.

- [x] **Step 3: Run focused tests to verify RED**

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts test/main/scanDiagnostics.test.ts
```

Expected: FAIL because `ScanHelperPlanSchema` and
`NativeHelperPlanMessage` do not expose `readinessBlockers` yet.

Result: RED confirmed. Focused diagnostics tests failed because helper plan
messages and schema parsing dropped `readinessBlockers`. Prototype audit
summary tests also failed because the summary did not expose
`readinessBlocked/readinessBlockers`.

### Task 2: Implement Readiness Blocker Diagnostics

**Files:**

- Modify: `src/shared/schemas/scan.ts`
- Modify: `src/main/services/helper/helperClient.ts`
- Modify: `src/main/services/helper/macosXpcHelperTransport.ts`
- Modify: `src/main/services/diagnostics/helperPrototypeAuditSummary.ts`
- Modify: `src/main/services/scan/nativeScanOrchestrator.ts`

- [x] **Step 1: Add shared readiness blocker schema**

Add a `ScanHelperReadinessBlockerSchema` enum containing readiness-only
blockers:

```ts
[
  "helper-peer-validation-missing",
  "service-management-not-registered",
]
```

Then add optional `readinessBlockers` to `ScanHelperPlanSchema`.

- [x] **Step 2: Add readiness blockers to helper status and native helper plan message**

Extend `NativeHelperPlanMessage` with:

```ts
readinessBlockers?: string[];
```

Use the stricter shared inferred type if practical.

- [x] **Step 3: Populate readiness blockers from helper status**

When `helperStatus.readinessBlockers` is present and non-empty, copy it into
the helper plan message. Do not merge it into `registrationBlockers`.

- [x] **Step 4: Populate actual macOS XPC status readiness blockers**

Add diagnostic readiness blockers to XPC status:

- `service-management-not-registered` when ServiceManagement does not pass;
- `helper-peer-validation-missing` when control health lacks listener
  code-signing peer validation.

- [x] **Step 5: Preserve readiness blockers in prototype audit summaries**

Add `readinessBlocked` and `readinessBlockers` to
`HelperPrototypeAuditSummary`, filtered through the shared stable readiness
blocker schema.

- [x] **Step 6: Run focused tests to verify GREEN**

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts test/main/scanDiagnostics.test.ts
pnpm typecheck
```

Expected: PASS.

Result: `pnpm test test/main/helperPrototypeAuditSummary.test.ts
test/main/nativeScanOrchestrator.test.ts test/main/scanDiagnostics.test.ts
test/main/helperClient.test.ts` passed with 4 files and 63 tests.
`pnpm typecheck` passed.

### Task 3: Document, Review, Verify, Commit

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b58-helper-readiness-blocker-diagnostics.md`

- [x] **Step 1: Document status**

Document that scan diagnostics now distinguish registration blockers from
readiness blockers, and that this is diagnostic only. It does not enable helper
scanning.

- [x] **Step 2: Run sub-agent code review**

Ask the review sub-agent to check:

- schema compatibility;
- readiness blockers not being confused with registration blockers;
- no default helper enablement;
- test coverage for IPC-facing diagnostics.

Result: Initial sub-agent review reported no Critical findings and one
Important finding: `caller-identity: fail` could overstate peer-validation
failure before control peer validation was actually probed. A regression test
was added and `helper-peer-validation-missing` is now emitted only for
`helper-control-peer-validation-missing`. Follow-up review reported no Critical
or Important findings.

- [x] **Step 3: Run verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit:helper-readiness --platform darwin --resources-path resources
```

Expected:

- Tests/typecheck/lint/build pass.
- Readiness audit remains blocked.

Result:

- `pnpm test` passed, 55 files and 322 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  exited 1 as expected with `status: "blocked"`.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/shared/schemas/scan.ts src/main/services/helper/helperClient.ts src/main/services/helper/macosXpcHelperTransport.ts src/main/services/diagnostics/helperPrototypeAuditSummary.ts src/main/services/scan/nativeScanOrchestrator.ts test/main/helperClient.test.ts test/main/helperPrototypeAuditSummary.test.ts test/main/nativeScanOrchestrator.test.ts test/main/scanDiagnostics.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b58-helper-readiness-blocker-diagnostics.md
git diff --cached --check
git commit -m "feat: expose helper readiness blockers in diagnostics"
```
