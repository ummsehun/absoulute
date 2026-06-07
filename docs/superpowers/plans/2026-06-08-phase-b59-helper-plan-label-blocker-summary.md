# Phase B59 Helper Plan Label Blocker Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show helper registration/readiness blockers in renderer helper plan
labels so users can see why production helper scanning is not active.

**Architecture:** Keep scan diagnostics schema unchanged from B58. Format the
already-provided `registrationBlockers` and `readinessBlockers` in the renderer
helper-plan utility without changing scan selection or helper readiness gates.

**Tech Stack:** React renderer TypeScript utility, Vitest.

---

### Task 1: Add RED Renderer Label Coverage

**Files:**

- Modify: `test/renderer/helperPlan.test.ts`

- [x] **Step 1: Assert fallback labels include blocker summary**

Add a test for a native fallback helper plan containing:

```ts
registrationBlockers: ["team-id-missing"],
readinessBlockers: ["service-management-not-registered"],
```

Expected label:

```text
helper blocked fallback registration-preflight-blocked xpc not-installed registration:team-id-missing readiness:service-management-not-registered
```

- [x] **Step 2: Assert multiple blockers are compacted predictably**

Add a test that multiple blocker codes are compacted as `first-code,+N` inside
their category.

- [x] **Step 3: Run focused tests to verify RED**

Run:

```bash
pnpm test test/renderer/helperPlan.test.ts
```

Expected: FAIL because `getHelperPlanLabel()` does not include blockers yet.

Result: RED confirmed. The new tests failed because fallback labels omitted
`registration:` and `readiness:` blocker suffixes.

### Task 2: Implement Blocker-Aware Labels

**Files:**

- Modify: `src/renderer/src/utils/helperPlan.ts`

- [x] **Step 1: Add helper blocker formatter**

Add a small formatter that returns:

```ts
[
  "registration:team-id-missing,helper-xpc-enumerate-bridge-missing",
  "readiness:service-management-not-registered",
]
```

for non-empty blocker arrays, and returns no suffixes when the arrays are empty
or absent.

- [x] **Step 2: Append blocker suffixes to fallback labels**

Append the suffixes only after the existing fallback label text. Do not change
helper-engine labels without blockers.

- [x] **Step 3: Run focused tests to verify GREEN**

Run:

```bash
pnpm test test/renderer/helperPlan.test.ts
pnpm typecheck
```

Expected: PASS.

Result:

- `pnpm test test/renderer/helperPlan.test.ts` passed, 1 file and 5 tests.
- `pnpm typecheck` passed.

Review follow-up: Initial sub-agent review reported one Important finding:
placing blocker summaries at the end could be truncated in the UI before the
user sees the cause. The label now places compact blocker summaries immediately
after `helper <readiness>`, and multiple codes render as `first-code,+N`.
After this follow-up, `pnpm test test/renderer/helperPlan.test.ts` and
`pnpm typecheck` passed.

### Task 3: Document, Review, Verify, Commit

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b59-helper-plan-label-blocker-summary.md`

- [x] **Step 1: Document status**

Document that helper plan labels now include blocker summaries, and that this is
diagnostic only. It does not enable helper scanning.

- [x] **Step 2: Run sub-agent code review**

Ask the review sub-agent to check:

- label formatting stability;
- no scan selection or helper readiness behavior change;
- readability when both blocker categories exist.

Result: Initial sub-agent review reported one Important finding: suffix
placement could be truncated before the blocker cause. The label was revised to
front-load compact blocker summaries. Follow-up review reported no Critical or
Important findings.

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

- `pnpm test` passed, 55 files and 324 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  exited 1 as expected with `status: "blocked"`.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/renderer/src/utils/helperPlan.ts test/renderer/helperPlan.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b59-helper-plan-label-blocker-summary.md
git diff --cached --check
git commit -m "feat: show helper blocker summary in labels"
```
