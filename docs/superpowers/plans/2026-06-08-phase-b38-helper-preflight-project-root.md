# Phase B38 Helper Preflight Project Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:test-driven-development for code changes and request sub-agent
> review before committing this mini phase.

**Goal:** Let `audit-helper-preflight` inspect an explicit project root so
preflight evidence can be rehearsed against isolated or packaged artifacts
without changing the current working directory.

**Architecture:** Keep preflight readiness semantics unchanged. Add only CLI
argument parsing for `--project-root <path>` to the preflight audit script and
pass the resolved value into the existing `buildHelperPreflightAudit`
`projectRoot` option. Continue using the shared `--out` audit output helper.

**Non-goals:**

- Do not mark helper readiness ready.
- Do not change blocker semantics.
- Do not infer production Team ID, designated requirement, FDA, or
  ServiceManagement evidence.
- Do not enable helper defaults.

---

### Task 1: Add RED Preflight Script Tests

**Files:**

- Create: `test/main/helperPreflightAuditScript.test.ts`

- [x] **Step 1: Add explicit project root output test**

Add a script test that creates a temporary project root with placeholder
listener metadata, runs:

```bash
bun run scripts/audit-helper-preflight.ts --project-root <temp-root> --out <temp-root>/out/preflight.json
```

Expected RED:

- The command exits `0` because preflight audits are non-strict by default.
- The test fails before implementation because the script ignores
  `--project-root` and does not read the temporary listener metadata.

Result:

- RED confirmed: the script read the real repo listener metadata instead of the
  temporary project root metadata.

- [x] **Step 2: Add missing project root value test**

Run:

```bash
bun run scripts/audit-helper-preflight.ts --project-root
```

Expected RED:

- The test fails before implementation because the script does not reject a
  missing `--project-root` value.

Result:

- RED confirmed: the script exited `0` instead of failing with
  `missing value for --project-root`.

- [x] **Step 3: Add option-as-value regression test**

After sub-agent review, add a regression test for:

```bash
bun run scripts/audit-helper-preflight.ts --project-root --out /tmp/preflight.json
```

Result:

- RED confirmed: the script exited `0` and treated `--out` as the project root.

### Task 2: Implement CLI Project Root Parsing

**Files:**

- Modify: `scripts/audit-helper-preflight.ts`

- [x] **Step 1: Parse `--project-root`**

Add a small local `resolveOptionalArg(rawArgs, "--project-root")` helper that
matches existing audit scripts by throwing `missing value for --project-root`
when the value is absent or blank.

After review, option-looking values such as `--out` are also treated as missing
values.

- [x] **Step 2: Pass the project root to the audit builder**

Use the explicit project root when provided, otherwise keep `process.cwd()`.

- [x] **Step 3: Preserve existing `--out` behavior**

Keep `resolveAuditOutputPath(rawArgs)` and `writeAuditOutputFile` unchanged.

### Task 3: Verify And Document

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b38-helper-preflight-project-root.md`

- [x] **Step 1: Run focused tests**

```bash
pnpm test test/main/helperPreflightAuditScript.test.ts test/main/helperPreflightAudit.test.ts
```

Result:

- `pnpm test test/main/helperPreflightAuditScript.test.ts test/main/helperPreflightAudit.test.ts`
  passed, 2 files and 11 tests.

- [x] **Step 2: Run related audit script tests**

```bash
pnpm test test/main/helperPreflightAuditScript.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperFdaMatrixAuditScript.test.ts
```

Result:

- `pnpm test test/main/helperPreflightAuditScript.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperFdaMatrixAuditScript.test.ts`
  passed, 5 files and 18 tests.

- [x] **Step 3: Run full verification**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-readiness --platform darwin --resources-path resources
pnpm audit:helper-readiness-bundle
```

Expected:

- Tests, typecheck, lint, build, and Rust tests pass.
- Readiness audits remain intentionally blocked.

Result:

- `pnpm test` passed, 55 files and 265 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  remained intentionally blocked.
- `pnpm audit:helper-readiness-bundle` remained intentionally blocked.

### Task 4: Review And Commit

- [x] **Step 1: Request sub-agent review**

Ask the reviewer to inspect only B38 for:

- preflight script argument parsing correctness
- no readiness semantic changes
- no accidental production evidence fabrication
- test coverage for `--project-root` and missing values

Result:

- Sub-agent `019ea2d3-1d6c-7493-ab61-c05eb15e73ce` found no Critical issues.
- Important feedback: `--project-root --out <path>` was accepted because the
  parser treated `--out` as the project root value.

- [x] **Step 2: Address review findings**

Fix Critical and Important issues before proceeding.

Result:

- Added a regression test for option-as-value handling.
- Updated the parser to treat values beginning with `--` as missing values.

- [ ] **Step 3: Commit**

```bash
git add scripts/audit-helper-preflight.ts test/main/helperPreflightAuditScript.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b38-helper-preflight-project-root.md
git commit -m "feat: add helper preflight project root option"
```

### Rollback Plan

Revert only the preflight script `--project-root` option, its tests, and B38
documentation. Do not change helper readiness gates or previous audit script
options.
