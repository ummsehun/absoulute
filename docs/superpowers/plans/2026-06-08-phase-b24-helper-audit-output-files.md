# Phase B24 Helper Audit Output Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow helper preflight/readiness audit commands to write their JSON
reports to explicit files for Phase B evidence retention.

**Architecture:** Keep the existing stdout and exit-code behavior intact. Add a
small shared script helper that parses `--out <path>` and writes the same JSON
payload that is printed to stdout. This gives Phase B work a durable audit
artifact without changing readiness decisions.

**Non-goals:**

- Do not make helper readiness pass.
- Do not change audit JSON shape.
- Do not change strict preflight exit semantics.
- Do not add default output files or commit generated audit JSON.
- Prefer repo-external output paths such as `/tmp/...` for generated audit JSON.

---

### Task 1: Add RED Tests

**Files:**

- Modify: `test/main/helperReadinessAuditScript.test.ts`
- Modify: `test/main/helperPreflightAudit.test.ts`

- [x] **Step 1: Assert readiness audit `--out`**

Add a script-level test proving `bun run scripts/audit-helper-readiness.ts
--out <file>` writes the same JSON report to the file while preserving blocked
exit status.

- [x] **Step 2: Assert preflight audit `--out`**

Add a script-level test proving `bun run scripts/audit-helper-preflight.ts
--out <file>` writes the same JSON audit to the file while preserving normal
exit status.

Run:

```bash
pnpm test test/main/helperReadinessAuditScript.test.ts test/main/helperPreflightAudit.test.ts
```

Expected RED: scripts currently ignore `--out` and do not write output files.

Result:

- `pnpm test test/main/helperReadinessAuditScript.test.ts
  test/main/helperPreflightAudit.test.ts` failed before implementation because
  scripts ignored `--out` and did not create output files.

### Task 2: Implement Output File Helper

**Files:**

- Add: `scripts/helper-audit-output.ts`
- Modify: `scripts/audit-helper-preflight.ts`
- Modify: `scripts/audit-helper-readiness.ts`

- [x] **Step 1: Add shared script helper**

Implement:

- `resolveAuditOutputPath(argv: string[]): string | null`
- `writeAuditOutputFile(outputPath: string | null, json: string): void`

The writer should create parent directories and write UTF-8 JSON.

- [x] **Step 2: Wire preflight/readiness scripts**

Both scripts should:

- build the JSON string once.
- print it to stdout.
- write it to `--out` when provided.
- preserve existing exit-code behavior.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b24-helper-audit-output-files.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B24 section stating:

- helper audit commands can now write JSON evidence files with `--out`.
- stdout and exit semantics remain unchanged.
- readiness remains blocked without production evidence.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperReadinessAuditScript.test.ts test/main/helperPreflightAudit.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-preflight
pnpm audit:helper-readiness
```

Expected:

- tests, typecheck, lint, build, and Rust tests pass.
- helper readiness remains intentionally blocked.

Result:

- `pnpm test test/main/helperAuditOutput.test.ts
  test/main/helperReadinessAuditScript.test.ts
  test/main/helperPreflightAudit.test.ts` passed after implementation: 3 files,
  14 tests.
- `bun run scripts/audit-helper-preflight.ts --out` failed explicitly with
  `--out requires an output file path`.
- `pnpm test` passed: 46 files, 220 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-preflight` printed `status: "blocked"` and exited 0.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.
- Direct `--out` checks wrote `/tmp/luie-helper-audit-b24/preflight.json` and
  `/tmp/luie-helper-audit-b24/readiness.json`; both parsed as JSON and retained
  the intended blocked statuses.
- Sub-agent review found no Critical or Important issues. Minor feedback about
  missing `--out` values and generated artifact path guidance was addressed.

### Task 4: Review And Commit

**Files:**

- All files changed by Tasks 1-3.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B24 for:

- audit output JSON shape changes.
- changed readiness/preflight exit semantics.
- unsafe path handling or accidental generated artifact commits.
- duplicate script logic that should be shared.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Result:

- Sub-agent review found no Critical or Important issues.
- Minor feedback about missing `--out` path handling was addressed with an
  explicit error and helper unit tests.
- Minor feedback about generated audit output path guidance was addressed in
  documentation.
- Follow-up Minor feedback about the commit command omitting
  `test/main/helperAuditOutput.test.ts` was addressed in this plan.

- [x] **Step 3: Commit**

```bash
git add scripts/helper-audit-output.ts scripts/audit-helper-preflight.ts scripts/audit-helper-readiness.ts test/main/helperAuditOutput.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperPreflightAudit.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b24-helper-audit-output-files.md
git commit -m "feat: write helper audit output files"
```

Result:

- Committed with message `feat: write helper audit output files`.

## Rollback

Remove only the `--out` file-writing support, tests, and B24 documentation. Do
not change helper readiness or preflight audit semantics.
