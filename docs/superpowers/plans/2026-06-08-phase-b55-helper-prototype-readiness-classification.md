# Phase B55 Helper Prototype Readiness Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make helper prototype enumeration evidence explicitly distinct from
production-ready helper execution in scan planning and audit summaries.

**Architecture:** Keep the existing conservative helper gates. Add a small
readiness classification to native helper scan-plan messages and prototype audit
summaries so a helper-backed prototype run cannot be mistaken for a registered,
FDA-validated, production helper scan.

**Tech Stack:** Electron main process TypeScript, Vitest, existing native scan
orchestrator and helper prototype audit summary services.

**Non-goals:**

- Do not enable helper-backed scans by default.
- Do not make current helper readiness pass.
- Do not fabricate production bundle ID, Team ID, FDA, ServiceManagement, or
  signing evidence.
- Do not remove the explicit prototype enumerate escape hatch.

---

### Task 1: Add RED Classification Tests

**Files:**

- Modify: `test/main/nativeScanOrchestrator.test.ts`
- Modify: `test/main/helperPrototypeAuditSummary.test.ts`

- [x] **Step 1: Assert prototype helper plan is classified as prototype-only**

Add an assertion to the existing prototype orchestrator test:

```ts
expect(handlers.helperPlans).toEqual([
  {
    engine: "helper",
    productionReadiness: "prototype-only",
    prototypeEnumerate: true,
    transport: "xpc",
  },
]);
```

- [x] **Step 2: Assert prototype audit summary carries the classification**

Update the first helper prototype audit summary expectation:

```ts
productionReadiness: "prototype-only",
```

- [x] **Step 3: Run focused tests to verify RED**

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts test/main/helperPrototypeAuditSummary.test.ts
```

Expected: FAIL because `productionReadiness` is not emitted yet.

Result: RED confirmed. The focused test run failed because helper plan messages
and helper prototype audit summaries did not include `productionReadiness`.

### Task 2: Implement Minimal Classification

**Files:**

- Modify: `src/main/services/scan/nativeScanOrchestrator.ts`
- Modify: `src/main/services/diagnostics/helperPrototypeAuditSummary.ts`
- Modify: `src/shared/schemas/scan.ts`
- Modify: `src/renderer/src/utils/helperPlan.ts`

- [x] **Step 1: Add the helper plan classification type**

Add to `NativeHelperPlanMessage`:

```ts
productionReadiness:
  | "ready"
  | "prototype-only"
  | "blocked"
  | "unavailable";
```

- [x] **Step 2: Derive classification from the selected plan**

Use a focused helper:

```ts
function resolveHelperProductionReadiness(input: {
  helperPlan: HelperScanPlan;
  helperStatus: HelperClientStatus;
  helperPrototypeEnumerate: boolean;
}): NativeHelperPlanMessage["productionReadiness"] {
  if (input.helperPlan.engine === "helper") {
    return input.helperStatus.available ? "ready" : "prototype-only";
  }
  if (input.helperStatus.registrationPreflight?.status === "blocked") {
    return "blocked";
  }
  if (input.helperPrototypeEnumerate) {
    return "prototype-only";
  }
  return "unavailable";
}
```

- [x] **Step 3: Include classification in logs and handler messages**

Set `productionReadiness` on `helperPlanMessage` and include it in
`native_helper_scan_plan` log details.

- [x] **Step 4: Surface classification in prototype audit summary**

Add `productionReadiness` to `HelperPrototypeAuditSummary`, returning the latest
plan value or `"unknown"` when no helper plan exists.

- [x] **Step 5: Preserve classification through shared diagnostics**

Sub-agent review found that adding `productionReadiness` only to
`NativeHelperPlanMessage` left the shared scan diagnostics schema without the
new field. Added `productionReadiness` to `ScanHelperPlanSchema`, added a
schema round-trip assertion in `test/main/scanDiagnostics.test.ts`, and updated
the renderer helper-plan label to include readiness classification.

- [x] **Step 6: Run focused tests to verify GREEN**

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts test/main/helperPrototypeAuditSummary.test.ts
```

Expected: PASS.

Result: GREEN confirmed. `pnpm test
test/main/nativeScanOrchestrator.test.ts
test/main/helperPrototypeAuditSummary.test.ts` passed with 2 files and 22 tests.
After the shared-schema follow-up, `pnpm test
test/main/scanDiagnostics.test.ts test/renderer/helperPlan.test.ts` and the
combined focused test run passed.

### Task 3: Document and Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b55-helper-prototype-readiness-classification.md`

- [x] **Step 1: Update current status**

Document that helper prototype scans are explicitly reported as
`prototype-only`, and production helper readiness remains blocked until real
identity/FDA/ServiceManagement evidence exists.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts test/main/helperPrototypeAuditSummary.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm audit:helper-readiness --platform darwin --resources-path resources
```

Expected:

- Tests, typecheck, and lint pass.
- Helper readiness remains `blocked` with `canEnableHelperByDefault: false`.

Result:

- `pnpm test`: passed, 55 files and 317 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`:
  exited 1 as intended with `status: "blocked"` and
  `canEnableHelperByDefault: false`.

- [x] **Step 3: Run sub-agent code review**

Ask the review sub-agent to check for:

- false-positive helper readiness
- prototype classification mismatches
- broken scan planning contracts

Review result:

- Critical: none.
- Important: shared scan diagnostics schema did not preserve
  `productionReadiness`. Fixed by adding the field to `ScanHelperPlanSchema`,
  adding schema round-trip coverage, and exposing the classification in renderer
  helper-plan labels.
- Minor: diagnostics/shared contract coverage was missing. Covered by
  `test/main/scanDiagnostics.test.ts` and `test/renderer/helperPlan.test.ts`.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/main/services/scan/nativeScanOrchestrator.ts src/main/services/diagnostics/helperPrototypeAuditSummary.ts src/shared/schemas/scan.ts src/renderer/src/utils/helperPlan.ts test/main/nativeScanOrchestrator.test.ts test/main/helperPrototypeAuditSummary.test.ts test/main/scanDiagnostics.test.ts test/renderer/helperPlan.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b55-helper-prototype-readiness-classification.md
git diff --cached --check
git commit -m "feat: classify helper prototype readiness"
```
