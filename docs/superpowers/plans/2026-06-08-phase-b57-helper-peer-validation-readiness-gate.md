# Phase B57 Helper Peer Validation Readiness Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep helper readiness blocked until runtime peer-validation evidence
is explicitly provided.

**Architecture:** Preserve static registration preflight semantics. Add a
separate readiness evidence key for XPC peer validation so production helper
default activation cannot be inferred from Team ID, listener requirement,
ServiceManagement, and FDA evidence alone.

**Tech Stack:** Electron main process TypeScript, Bun readiness audit script,
Vitest.

**Non-goals:**

- Do not enable helper-backed scans by default.
- Do not fabricate production identity, FDA, ServiceManagement, or peer
  validation evidence.
- Do not change ServiceManagement or registration preflight semantics.

---

### Task 1: Add RED Readiness Gate Tests

**Files:**

- Modify: `test/main/helperReadinessAudit.test.ts`
- Modify: `test/main/helperReadinessAuditScript.test.ts`

- [x] **Step 1: Assert missing peer validation blocks otherwise-ready report**

Add a test proving `buildHelperReadinessReport()` reports:

```ts
blockers: ["helper-peer-validation-missing"]
evidence: expect.objectContaining({
  key: "peer-validation",
  reason: "helper-peer-validation-missing",
  status: "fail",
})
```

when registration, FDA, and ServiceManagement evidence are ready but
`peerValidationStatus: "blocked"`.

- [x] **Step 2: Assert readiness CLI blocks without peer validation evidence**

Extend the existing explicit project-root readiness script test so all existing
static blockers are removed and the remaining blocker is
`helper-peer-validation-missing`.

- [x] **Step 3: Assert readiness CLI accepts explicit peer validation evidence**

Add `--confirm-peer-validation` to the same script scenario and assert the peer
validation blocker disappears.

- [x] **Step 4: Run focused tests to verify RED**

Run:

```bash
pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts
```

Expected: FAIL because the readiness audit does not know about peer-validation
evidence yet.

Result: RED confirmed. The builder stayed `ready` without peer validation, and
the readiness CLI did not include `helper-peer-validation-missing`.

### Task 2: Implement Peer Validation Readiness Evidence

**Files:**

- Modify: `src/main/services/helper/helperReadinessAudit.ts`
- Modify: `scripts/audit-helper-readiness.ts`

- [x] **Step 1: Add report input**

Add:

```ts
peerValidationStatus?: "ready" | "blocked";
```

to `HelperReadinessReportInput`.

- [x] **Step 2: Add blocker and evidence**

If `peerValidationStatus === "blocked"`, add
`helper-peer-validation-missing` to blockers and emit evidence:

```ts
{
  key: "peer-validation",
  status: "fail",
  reason: "helper-peer-validation-missing",
  guidance: {
    description: "Provide XPC control health evidence with listener code-signing peer validation.",
    requiredInputs: ["SCAN_HELPER_PEER_VALIDATION_READY"],
  },
}
```

For ready reports, emit pass evidence for `peer-validation`.

- [x] **Step 3: Add CLI/env confirmation**

In `scripts/audit-helper-readiness.ts`, add:

```ts
const HELPER_PEER_VALIDATION_READY_ENV = "SCAN_HELPER_PEER_VALIDATION_READY";
```

and support:

```bash
--confirm-peer-validation
```

The script passes `peerValidationStatus: "ready"` only when the env/flag is
true; otherwise it passes `"blocked"`.

- [x] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts
```

Expected: PASS.

Result: GREEN confirmed. `pnpm test test/main/helperReadinessAudit.test.ts
test/main/helperReadinessAuditScript.test.ts` passed with 2 files and 23 tests.
`pnpm typecheck` also passed.

### Task 2.5: Keep Bundle Readiness Semantics Consistent

**Files:**

- Modify: `src/main/services/helper/helperReadinessBundle.ts`
- Modify: `scripts/audit-helper-readiness-bundle.ts`
- Modify: `test/main/helperReadinessBundle.test.ts`
- Modify: `test/main/helperReadinessBundleScript.test.ts`
- Modify: `test/main/helperReadinessAuditScript.test.ts`

- [x] **Step 1: Reuse the peer-validation evidence env key**

Export `HELPER_PEER_VALIDATION_READY_ENV` from
`helperReadinessAudit.ts` and reuse it in both readiness scripts.

- [x] **Step 2: Pass peer validation evidence through the bundle builder**

Add `peerValidationReady?: boolean` to `BuildHelperReadinessBundleOptions`,
merge it into the evidence env, and pass `peerValidationStatus` into
`buildHelperReadinessReport()`.

- [x] **Step 3: Add bundle CLI confirmation support**

Add `--confirm-peer-validation` to
`scripts/audit-helper-readiness-bundle.ts`.

- [x] **Step 4: Cover bundle behavior in tests**

Assert that bundle readiness is blocked by default with
`helper-peer-validation-missing`, and that explicit peer validation evidence
removes only that blocker while unrelated blockers remain.

Result: Focused tests passed. `pnpm test test/main/helperReadinessAudit.test.ts
test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundle.test.ts
test/main/helperReadinessBundleScript.test.ts` passed with 4 files and 37
tests. `pnpm typecheck` passed.

### Task 3: Document, Review, Verify, Commit

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b57-helper-peer-validation-readiness-gate.md`

- [x] **Step 1: Document status**

Document that helper readiness now has an explicit peer-validation gate and the
current repo remains blocked without real runtime health evidence.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit:helper-readiness --platform darwin --resources-path resources
pnpm audit:helper-readiness-bundle --platform darwin --resources-path resources
```

Expected:

- Tests/typecheck/lint/build pass.
- Readiness audit exits 1 with `status: "blocked"` and includes
  `helper-peer-validation-missing` until peer validation evidence is confirmed.
- Readiness bundle audit exits 1 with `status: "blocked"` and includes
  `helper-peer-validation-missing` until peer validation evidence is confirmed.

Result:

- `pnpm test` passed, 55 files and 321 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  exited 1 as expected with `status: "blocked"` and
  `helper-peer-validation-missing`.
- `pnpm audit:helper-readiness-bundle --platform darwin --resources-path
  resources` exited 1 as expected with `status: "blocked"` and
  `helper-peer-validation-missing`.

- [x] **Step 3: Run sub-agent code review**

Ask the review sub-agent to check:

- peer-validation evidence false positives
- readiness audit pass without runtime peer evidence
- readiness bundle pass without runtime peer evidence
- CLI option parsing edge cases
- unchanged ServiceManagement/FDA/preflight semantics

Result: Sub-agent review reported no Critical or Important findings. One Minor
finding noted duplicate peer-validation confirmation flow in the bundle CLI;
the CLI was simplified to pass the confirmation through the env overlay only.
After the review follow-up, focused readiness/bundle tests and `pnpm typecheck`
passed.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/main/services/helper/helperReadinessAudit.ts scripts/audit-helper-readiness.ts src/main/services/helper/helperReadinessBundle.ts scripts/audit-helper-readiness-bundle.ts test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b57-helper-peer-validation-readiness-gate.md
git diff --cached --check
git commit -m "feat: gate helper readiness on peer validation"
```
