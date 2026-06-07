# Phase B5 Helper Terminal Error Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve helper terminal error details when helper-backed scan falls back to native scanning.

**Architecture:** Keep helper event mapping in `helperEventAdapter.ts`, but let `NativeScanOrchestrator.runHelperStage()` remember `HelperEvent` terminal errors before converting them into native warnings. If the helper stage ends without `done` because a helper error occurred, throw a reason that includes the helper error code and message.

**Tech Stack:** Electron main process TypeScript, helper protocol schemas, Vitest.

---

## File Structure

- Modify: `src/main/services/scan/nativeScanOrchestrator.ts`
  - Captures helper `error` events and uses their code/message in fallback errors.
- Modify: `test/main/nativeScanOrchestrator.test.ts`
  - Adds RED coverage proving helper error details are logged as fallback reason.
- Modify: `docs/project-status-audit.md`
  - Records B5 status, verification, and remaining blockers.

## Non-Goals

- Do not disable native fallback.
- Do not enable helper execution by default.
- Do not implement production XPC peer identity validation.
- Do not change helper event schema.

## Task 1: Preserve Helper Error Fallback Reason

**Files:**
- Modify: `test/main/nativeScanOrchestrator.test.ts`
- Modify: `src/main/services/scan/nativeScanOrchestrator.ts`

- [x] **Step 1: Write failing helper error fallback test**

Add a test where helper enumeration emits:

```ts
{ type: "error", requestId: "request-1", code: "E_INVALID_CLIENT", message: "Rejected caller identity" }
```

and then returns without `done`.

Expected fallback log reason:

```text
helper-error:E_INVALID_CLIENT:Rejected caller identity
```

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts
```

Expected RED: fallback reason currently reports missing done event instead of helper error details.

- [x] **Step 2: Capture terminal helper error in orchestrator**

Inside `runHelperStage()`:

- store `terminalHelperError` when `event.type === "error"`.
- continue dispatching mapped native warning messages.
- after enumerate returns, if no done and terminal error exists, throw:

```text
helper-error:<code>:<message>
```

- [x] **Step 3: Run GREEN**

Run:

```bash
pnpm test test/main/nativeScanOrchestrator.test.ts
pnpm typecheck
```

Expected: focused tests and typecheck pass.

## Task 2: Document and Verify Mini Phase

**Files:**
- Modify: `docs/project-status-audit.md`
- Modify: `docs/superpowers/plans/2026-06-08-phase-b5-helper-terminal-error-fallback.md`

- [x] **Step 1: Record B5 status in project audit**

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

- helper error details being lost before fallback.
- helper error bypassing warning dispatch.
- helper default enablement.
- document overclaiming production helper readiness.

- [x] **Step 2: Address Critical and Important findings**

Use TDD for behavior fixes.

- [x] **Step 3: Commit the mini phase**

Commit message:

```bash
git commit -m "fix: preserve helper terminal error fallback"
```
