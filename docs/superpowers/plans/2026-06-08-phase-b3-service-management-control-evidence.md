# Phase B3 ServiceManagement Control Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden ServiceManagement register/unregister command evidence so command-control results cannot be mistaken for generic status output.

**Architecture:** Keep all ServiceManagement command execution inside `macosServiceManagementProbe.ts`. The controller should accept register/unregister results only when the command output proves the requested operation completed; status-only output or mismatched operation output must remain non-ready evidence.

**Tech Stack:** Electron main process TypeScript, Vitest, Swift `SMAppService` probe source.

---

## File Structure

- Modify: `src/main/services/helper/macosServiceManagementProbe.ts`
  - Validates controller command output for `register` and `unregister`.
  - Keeps generic `getStatus()` parsing unchanged.
- Modify: `test/main/macosServiceManagementProbe.test.ts`
  - Adds RED tests for mismatched register/unregister command output.
- Modify: `docs/project-status-audit.md`
  - Records B3 status, verification, and remaining external blockers.

## Non-Goals

- Do not run real `SMAppService.register()` in tests.
- Do not enable helper execution by default.
- Do not claim the helper is registered without external packaged-app evidence.
- Do not implement helper-backed scan enumeration.

## Task 1: Reject Mismatched ServiceManagement Control Output

**Files:**
- Modify: `test/main/macosServiceManagementProbe.test.ts`
- Modify: `src/main/services/helper/macosServiceManagementProbe.ts`

- [x] **Step 1: Write failing controller output validation tests**

Add tests proving:

- `register()` rejects an exit-0 output whose reason is not `register-succeeded`.
- `unregister()` rejects an exit-0 output whose reason is not `unregister-succeeded`.

Run:

```bash
pnpm test test/main/macosServiceManagementProbe.test.ts
```

Expected RED: controller currently accepts generic status-like output.

- [x] **Step 2: Implement command-specific validation**

Keep `getStatus()` behavior unchanged. For controller operations:

- `register()` accepts only parsed output with `reason === "register-succeeded"`.
- `unregister()` accepts only parsed output with `reason === "unregister-succeeded"`.
- mismatch returns:

```ts
{
  state: "not-implemented",
  reason: "service-management-control-output-mismatch:<operation>"
}
```

- [x] **Step 3: Run GREEN**

Run:

```bash
pnpm test test/main/macosServiceManagementProbe.test.ts
pnpm typecheck
```

Expected: tests and typecheck pass.

## Task 2: Document and Verify Mini Phase

**Files:**
- Modify: `docs/project-status-audit.md`
- Modify: `docs/superpowers/plans/2026-06-08-phase-b3-service-management-control-evidence.md`

- [x] **Step 1: Record B3 status in project audit**

Include facts, verification commands, and external blockers.

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

## Task 3: Subagent Review and Commit

**Files:**
- Review all files changed in this mini phase.

- [x] **Step 1: Request subagent code review**

Focus review on:

- accidental helper default enablement.
- register/unregister mismatch being accepted as ready evidence.
- generic status output being accepted for control operations.
- document overclaiming real ServiceManagement registration evidence.

- [x] **Step 2: Address Critical and Important findings**

Use TDD for behavior fixes.

- [x] **Step 3: Commit the mini phase**

Commit message:

```bash
git commit -m "fix: harden service management control evidence"
```
