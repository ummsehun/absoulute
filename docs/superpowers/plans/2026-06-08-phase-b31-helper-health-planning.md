# Phase B31 Helper Health Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use helper health-check evidence during native scan planning so a
ready XPC helper can be selected for exact deep macOS scans.

**Architecture:** Keep `getStatus()` as the cheap status path for scans that
cannot use the helper. For exact deep macOS scans, call `healthCheck()` before
planning because B29 made health checks the only evidence that can prove XPC
channel readiness and set `available: true`.

**Tech Stack:** Electron main process TypeScript, NativeScanOrchestrator,
Vitest.

**Non-goals:**

- Do not enable helper-backed scans while registration preflight is blocked.
- Do not select helper for quick, preview, responsive, or non-macOS scans.
- Do not bypass helper planner rules.
- Do not change default readiness/audit semantics.
- Do not fabricate production helper evidence.

---

### Task 1: Add RED Planning Test

**Files:**

- Modify: `test/main/nativeScanOrchestrator.test.ts`

- [x] **Step 1: Assert exact deep scans use healthCheck availability**

Add a test near the existing helper routing tests:

```ts
it("uses helper health check evidence before planning exact deep scans", async () => {
  vi.spyOn(os, "platform").mockReturnValue("darwin");
  const calls: string[] = [];
  const helperInputs: unknown[] = [];
  const helperClient: HelperClient = {
    getStatus: async () => {
      calls.push("getStatus");
      return { available: false, transport: "xpc" };
    },
    getVersion: async () => "test-helper",
    healthCheck: async () => {
      calls.push("healthCheck");
      return { available: true, transport: "xpc" };
    },
    register: async () => ({ available: false, transport: "xpc" }),
    unregister: async () => ({ available: false, transport: "xpc" }),
    enumerate: async (input, handlers) => {
      helperInputs.push(input);
      handlers.onEvent({
        type: "done",
        requestId: input.requestId ?? "missing-request-id",
        elapsedMs: 1,
        estimated: false,
      });
    },
  };
  const orchestrator = new NativeScanOrchestrator(helperClient);
  const handlers = createRecordingHandlers();

  const result = await orchestrator.runStage(
    {
      scanId: "scan-1",
      rootPath: "/Users/tester",
      permissionDeniedRoots: [],
      paused: false,
      cancelled: false,
      options: resolveScanOptions(
        {
          rootPath: "/Users/tester",
          optInProtected: false,
          accuracyMode: "full",
        },
        "/Users/tester",
      ),
    },
    {
      mode: "deep",
      maxDepth: 128,
      timeBudgetMs: 0,
    },
    handlers,
  );

  expect(result).toEqual({ estimated: false });
  expect(calls).toEqual(["healthCheck"]);
  expect(helperInputs).toHaveLength(1);
  expect(handlers.helperPlans).toEqual([
    {
      engine: "helper",
      transport: "xpc",
    },
  ]);
});
```

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts
```

Expected RED: the new test fails because `NativeScanOrchestrator` currently
calls `getStatus()` for planning and therefore falls back to native when
`getStatus()` reports unavailable.

Result:

- RED confirmed: `pnpm test test/main/nativeScanOrchestrator.test.ts` failed
  because planning called `getStatus()` and fell back to native while
  `healthCheck()` had the helper availability evidence.
- GREEN after implementation and review feedback:
  `pnpm test test/main/nativeScanOrchestrator.test.ts` passed, 1 file and 19
  tests.

### Task 2: Implement Health-Based Planning Status

**Files:**

- Modify: `src/main/services/scan/nativeScanOrchestrator.ts`

- [x] **Step 1: Add helper scan candidate predicate**

Add a local helper that mirrors the cheap planner preconditions that can be
checked before helper status is known:

```ts
function shouldProbeHelperHealthForStage(input: {
  platform: NodeJS.Platform;
  stage: NativeScanPhaseMode;
  options: Pick<ResolvedScanOptions, "accuracyMode" | "deepPolicyPreset">;
}): boolean {
  return input.platform === "darwin"
    && input.stage === "deep"
    && input.options.accuracyMode === "full"
    && input.options.deepPolicyPreset === "exact";
}
```

- [x] **Step 2: Pass stage context into helper status resolution**

Change `resolveHelperStatus()` to accept the stage and options. Use
`healthCheck()` only when `shouldProbeHelperHealthForStage()` returns true:

```ts
private async resolveHelperStatus(input: {
  platform: NodeJS.Platform;
  stage: NativeScanPhaseMode;
  options: Pick<ResolvedScanOptions, "accuracyMode" | "deepPolicyPreset">;
}): Promise<HelperClientStatus> {
  try {
    return shouldProbeHelperHealthForStage(input)
      ? await this.helperClient.healthCheck()
      : await this.helperClient.getStatus();
  } catch (error) {
    return {
      available: false,
      reason: `helper-status-failed:${String(error)}`,
      transport: "disabled",
    };
  }
}
```

- [x] **Step 3: Use one platform value for status and planning**

In `runStage()`, compute `const platform = os.platform();` once. Pass it to
`resolveHelperStatus()` and `resolveNativeHelperScanPlan()` so health probing
and planning agree.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b31-helper-health-planning.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B31 section stating:

- Exact deep macOS scan planning now uses `healthCheck()` evidence.
- Quick/preview/non-macOS scans still do not use the helper.
- Current repo readiness remains blocked.
- Helper-backed production scans remain blocked on external evidence.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts test/main/helperClient.test.ts test/main/helperScanPlanner.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-readiness-bundle
pnpm audit:helper-readiness
```

Expected:

- tests, typecheck, lint, build, and Rust tests pass.
- readiness bundle and helper readiness remain intentionally blocked in the
  current repo.

Result:

- `pnpm test test/main/nativeScanOrchestrator.test.ts
  test/main/helperClient.test.ts test/main/helperScanPlanner.test.ts` passed:
  3 files, 64 tests.
- `pnpm test` passed: 52 files, 249 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed with the
  existing Rust dead-code warnings.
- `pnpm audit:helper-readiness-bundle` printed blocked bundle readiness and
  exited 1 as intended.
- `pnpm audit:helper-readiness` printed blocked readiness and exited 1 as
  intended.

### Task 4: Review And Commit

**Files:**

- All files changed by Tasks 1-3.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B31 for:

- helper selection on quick/preview/non-macOS scans.
- using `healthCheck()` too broadly.
- bypassing registration preflight or helper planner gates.
- fallback behavior when helper health check throws.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Result:

- Sub-agent review reported no Critical or Important findings.
- Minor finding: negative tests should directly pin that quick/preview/non-macOS
  scans do not call `healthCheck()` and that health-check failure falls back to
  native planning.
- Addressed by adding both negative test cases.
- Re-run focused and full verification passed.
- Sub-agent re-review reported no Critical, Important, or Minor findings and
  said the change is ready to commit.

- [x] **Step 3: Commit**

```bash
git add src/main/services/scan/nativeScanOrchestrator.ts test/main/nativeScanOrchestrator.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b31-helper-health-planning.md
git commit -m "feat: use helper health for scan planning"
```

## Rollback

Revert only the helper health planning probe, tests, and B31 documentation. Do
not revert B29 availability gating or B30 readiness-gated default transport.
