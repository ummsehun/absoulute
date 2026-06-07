# Phase B2 ServiceManagement Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire ServiceManagement probe results into helper readiness audit without enabling privileged helper execution by default.

**Architecture:** Keep `macosServiceManagementProbe.ts` as the only boundary that executes the Swift probe command. `audit-helper-readiness.ts` should consume that boundary and pass the resulting state into `helperReadinessAudit.ts`; readiness remains blocked unless ServiceManagement is actually `registered` and all other evidence gates pass.

**Tech Stack:** Electron main process TypeScript, Bun script, Vitest, existing Swift `SMAppService` probe binary.

---

## File Structure

- Modify: `src/main/services/helper/helperReadinessAudit.ts`
  - Accepts all ServiceManagement probe states: `registered`, `not-installed`, `pending-approval`, `not-implemented`, and `unknown`.
  - Treats only `registered` as ServiceManagement pass evidence.
- Modify: `scripts/audit-helper-readiness.ts`
  - Calls `createMacOsServiceManagementProbeFromEnv()` and passes the actual probe state into the readiness report.
  - Falls back to `unknown` only if the probe throws unexpectedly.
- Modify: `test/main/helperReadinessAudit.test.ts`
  - Covers `pending-approval` and `not-implemented` as blocked ServiceManagement evidence.
- Create: `test/main/helperReadinessAuditScript.test.ts`
  - Runs the audit script with a fixture probe command and verifies the JSON report uses that probe state.
- Modify: `docs/project-status-audit.md`
  - Records B2 evidence, commands, and remaining blockers.

## Non-Goals

- Do not register or unregister the helper in this mini phase.
- Do not enable helper execution by default.
- Do not add scan enumeration through the helper.
- Do not claim ServiceManagement is ready without a real probe result.

## Task 1: Expand Readiness ServiceManagement States

**Files:**
- Modify: `test/main/helperReadinessAudit.test.ts`
- Modify: `src/main/services/helper/helperReadinessAudit.ts`

- [x] **Step 1: Write failing tests for `pending-approval` and `not-implemented`**

Run:

```bash
pnpm test test/main/helperReadinessAudit.test.ts
```

Expected RED: TypeScript or assertion failures because `serviceManagementStatus` does not yet accept all probe states.

- [x] **Step 2: Extend the readiness input type**

Allow:

```ts
"registered" | "not-installed" | "pending-approval" | "not-implemented" | "unknown"
```

Keep behavior:

- only `registered` yields pass evidence.
- every other state adds `service-management-not-registered`.

- [x] **Step 3: Run GREEN**

Run:

```bash
pnpm test test/main/helperReadinessAudit.test.ts
```

Expected: all helper readiness audit tests pass.

## Task 2: Wire Audit Script to ServiceManagement Probe

**Files:**
- Create: `test/main/helperReadinessAuditScript.test.ts`
- Modify: `scripts/audit-helper-readiness.ts`

- [x] **Step 1: Write failing script test**

Create a temporary executable probe script that prints:

```json
{"state":"pending-approval","reason":"requires-approval"}
```

Run `bun run scripts/audit-helper-readiness.ts` with `SCAN_HELPER_SM_PROBE_BIN` pointing at that fixture.

Expected RED: report still shows `serviceManagementStatus: "unknown"` because the script currently hardcodes unknown.

- [x] **Step 2: Implement probe wiring**

Use:

```ts
const serviceManagement = await createMacOsServiceManagementProbeFromEnv(
  process.env,
  process.platform,
  typeof process.resourcesPath === "string" ? process.resourcesPath : null,
).getStatus();
```

Pass `serviceManagement.state` to `buildHelperReadinessReport`.

If the probe throws, pass `"unknown"` and do not claim readiness.

- [x] **Step 3: Run GREEN**

Run:

```bash
pnpm test test/main/helperReadinessAuditScript.test.ts
pnpm audit:helper-readiness
```

Expected:

- script test passes.
- local audit remains `blocked` unless real external evidence is present.

## Task 3: Document and Verify Mini Phase

**Files:**
- Modify: `docs/project-status-audit.md`
- Modify: `docs/superpowers/plans/2026-06-07-phase-b2-service-management-readiness.md`

- [x] **Step 1: Record B2 status in project audit**

Include facts, verification commands, and remaining external blockers.

- [x] **Step 2: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-readiness
```

Expected:

- test/typecheck/lint/build/cargo pass.
- audit remains `blocked` while external identity/FDA/ServiceManagement evidence is missing.

## Task 4: Subagent Review and Commit

**Files:**
- Review all files changed in this mini phase.

- [x] **Step 1: Request subagent code review**

Focus review on:

- accidental helper default enablement.
- `pending-approval` or `not-implemented` being treated as ready.
- script failures becoming false readiness.
- document overclaiming external ServiceManagement evidence.

- [x] **Step 2: Address Critical and Important findings**

Use TDD for behavior fixes.

- [x] **Step 3: Commit the mini phase**

Commit message:

```bash
git commit -m "feat: wire service management readiness audit"
```
