# Phase B32 Helper Entry Adapter Exactness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align helper entry aggregation with native scanner exactness by
dropping helper `symlink` and `other` entries before they reach native
aggregation handlers.

**Architecture:** Keep file entries as counted size observations and directory
entries as visible zero-size traversal markers. Filter unsupported helper entry
kinds at the adapter boundary because the Rust native scanner skips symlinks
and non-file/non-directory entries before metadata aggregation.

**Tech Stack:** Electron main process TypeScript, helper event adapter, Vitest.

**Non-goals:**

- Do not change helper Swift traversal output.
- Do not change native scanner Rust traversal policy.
- Do not follow symlinks.
- Do not count `other` filesystem objects as files.
- Do not change helper readiness gates or default activation.

---

### Task 1: Add RED Adapter Tests

**Files:**

- Modify: `test/main/helperEventAdapter.test.ts`

- [x] **Step 1: Assert symlink and other entries are omitted**

Add a test proving helper `symlink` and `other` entries do not become native
aggregation items:

```ts
it("omits helper symlink and other entries from native aggregation", () => {
  expect(
    mapHelperEventToNativeMessages({
      type: "entry_batch",
      requestId: "request-1",
      items: [
        {
          path: "/Users/tester/link",
          parentPath: "/Users/tester",
          kind: "symlink",
          size: 128,
          estimated: false,
        },
        {
          path: "/Users/tester/socket",
          parentPath: "/Users/tester",
          kind: "other",
          size: 64,
          estimated: false,
        },
      ],
    }),
  ).toEqual([]);
});
```

- [x] **Step 2: Assert mixed batches preserve files and directories**

Extend the existing entry-batch test or add a new test proving file entries and
directory visibility markers remain:

```ts
expect(mappedItems).toEqual([
  {
    path: "/Users/tester/file.txt",
    sizeDelta: 42,
    countDelta: 1,
    estimated: false,
  },
  {
    path: "/Users/tester/Documents",
    sizeDelta: 0,
    countDelta: 0,
    estimated: false,
  },
]);
```

Run:

```bash
pnpm test test/main/helperEventAdapter.test.ts
```

Expected RED: the symlink/other test fails because the adapter currently emits
zero-size aggregation items for both kinds.

Result:

- RED confirmed: `pnpm test test/main/helperEventAdapter.test.ts` failed
  because helper `symlink` and `other` entries were emitted as zero-size
  native aggregation items.
- GREEN after implementation: `pnpm test test/main/helperEventAdapter.test.ts`
  passed, 1 file and 8 tests.

### Task 2: Implement Adapter Filtering

**Files:**

- Modify: `src/main/services/scan/helperEventAdapter.ts`

- [x] **Step 1: Filter unsupported entry kinds**

Change entry-batch mapping so only `file` and `dir` helper entries are mapped:

```ts
case "entry_batch":
  return mapEntryBatch(event);
```

`mapEntryBatch()` should return `NativeScannerMessage[]`, filter unsupported
entries, and return `[]` when no file/dir items remain.

- [x] **Step 2: Preserve file and directory semantics**

Keep:

- file: `sizeDelta = item.size`, `countDelta = 1`
- dir: `sizeDelta = 0`, `countDelta = 0`

Do not count symlink or other entries.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b32-helper-entry-adapter-exactness.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B32 section stating:

- helper symlink/other entries are now omitted at the adapter boundary.
- helper files and directories keep existing semantics.
- current helper readiness remains blocked.
- production helper scans remain blocked on external evidence.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperEventAdapter.test.ts test/main/nativeScanOrchestrator.test.ts
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

- `pnpm test test/main/helperEventAdapter.test.ts` passed, 1 file and 8 tests.
- `pnpm test test/main/helperEventAdapter.test.ts test/main/nativeScanOrchestrator.test.ts`
  passed, 2 files and 27 tests.
- `pnpm test` initially surfaced two ServiceManagement probe failures in the
  full parallel suite. Both failing tests passed when rerun individually, and
  the full suite passed on rerun with 52 files and 251 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm audit:helper-readiness-bundle` remained intentionally blocked with
  `canEnableHelperByDefault: false`.
- `pnpm audit:helper-readiness` remained intentionally blocked with
  `canEnableHelperByDefault: false`.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.

### Task 4: Review And Commit

**Files:**

- All files changed by Tasks 1-3.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B32 for:

- accidental loss of file size/count observations.
- accidental loss of directory visibility markers.
- mismatch with native scanner symlink/other skip policy.
- changes to readiness/default activation.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

- [x] **Step 3: Commit**

```bash
git add src/main/services/scan/helperEventAdapter.ts test/main/helperEventAdapter.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b32-helper-entry-adapter-exactness.md
git commit -m "fix: align helper entry aggregation"
```

Result:

- Sub-agent `019ea2d3-1d6c-7493-ab61-c05eb15e73ce` reviewed the B32 diff.
- Critical: none.
- Important: none.
- Minor: none.
- Reviewer confirmed file observations and directory markers are preserved,
  symlink/other aggregation is skipped consistently with the Rust native scanner
  policy, and helper readiness/default activation code was not changed.
- Reviewer did not run tests; verification was performed locally in Task 3.
- Committed as `5bf4c3b fix: align helper entry aggregation`.

## Rollback

Revert only helper entry adapter filtering, tests, and B32 documentation. Do
not revert helper planning or readiness-gating phases.
