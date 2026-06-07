# Phase B4 Helper Stream Request Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind helper stream events to the active helper request so mismatched helper output cannot be merged into the wrong scan stage.

**Architecture:** Keep event parsing inside `macosHelperEnumerateCommand.ts`. The helper CLI/stdout adapter should validate each parsed helper event schema and then require `event.requestId === request.requestId` before dispatching it to scan handlers.

**Tech Stack:** Electron main process TypeScript, zod helper protocol schemas, Vitest.

---

## File Structure

- Modify: `src/main/services/helper/macosHelperEnumerateCommand.ts`
  - Rejects helper stdout events whose `requestId` does not match the active request.
- Modify: `test/main/helperClient.test.ts`
  - Adds a RED test for mismatched helper event `requestId` before command transport dispatch.
- Modify: `docs/project-status-audit.md`
  - Records B4 status, verification, and remaining external blockers.

## Non-Goals

- Do not implement production XPC peer identity validation in this mini phase.
- Do not enable helper execution by default.
- Do not change helper scan policy or aggregation.
- Do not add helper write/delete operations.

## Task 1: Reject Mismatched Helper Event Request IDs

**Files:**
- Modify: `test/main/helperClient.test.ts`
- Modify: `src/main/services/helper/macosHelperEnumerateCommand.ts`

- [x] **Step 1: Write failing mismatch test**

Add a test proving `CommandMacOsHelperEnumerator` rejects a helper event with a different `requestId` and does not dispatch it to handlers.

Run:

```bash
pnpm test test/main/helperClient.test.ts
```

Expected RED: the mismatched event is currently dispatched because only schema validation runs.

- [x] **Step 2: Implement request binding**

Pass the active request ID into stdout line parsing.

Reject mismatches with:

```text
helper-enumerate-request-id-mismatch
```

- [x] **Step 3: Run GREEN**

Run:

```bash
pnpm test test/main/helperClient.test.ts
pnpm typecheck
```

Expected: focused tests and typecheck pass.

## Task 2: Document and Verify Mini Phase

**Files:**
- Modify: `docs/project-status-audit.md`
- Modify: `docs/superpowers/plans/2026-06-08-phase-b4-helper-stream-request-binding.md`

- [x] **Step 1: Record B4 status in project audit**

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

- helper event request mismatch still reaching scan handlers.
- schema validation being bypassed.
- helper default enablement.
- document overclaiming production XPC peer validation.

- [x] **Step 2: Address Critical and Important findings**

Use TDD for behavior fixes.

- [x] **Step 3: Commit the mini phase**

Commit message:

```bash
git commit -m "fix: bind helper stream events to request"
```
