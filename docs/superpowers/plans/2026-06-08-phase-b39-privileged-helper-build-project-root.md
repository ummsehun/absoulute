# Phase B39 Privileged Helper Build Project Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:test-driven-development for code changes and request sub-agent
> review before committing this mini phase.

**Goal:** Let the privileged helper build script generate helper executable and
listener requirement metadata under an explicit project root so production
identity evidence can be rehearsed without writing into the live repository.

**Architecture:** Keep the existing default behavior when no option is passed.
Add `--project-root <path>` parsing to `scripts/build-macos-privileged-helper.ts`
and resolve native sources, generated Swift source, module cache, helper output,
and requirement metadata relative to that selected root. Do not change signing
or readiness semantics.

**Non-goals:**

- Do not provide or infer a production Team ID.
- Do not make helper readiness pass.
- Do not enable helper defaults.
- Do not change the helper Swift protocol, traversal behavior, or XPC policy.

---

### Task 1: Add RED Build Script Tests

**Files:**

- Modify: `test/main/macosPrivilegedHelperCli.test.ts`

- [x] **Step 1: Add fake Swift compiler helper in the test**

Create a temporary `swiftc` executable that accepts `-o <path>`, writes Mach-O
header bytes to that output, and exits `0`.

- [x] **Step 2: Add explicit project root test**

Run:

```bash
bun run <repo>/scripts/build-macos-privileged-helper.ts --project-root <artifact-root>
```

with:

- `cwd` set to a different temporary root;
- minimal `native/macos-helper/privileged-helper/main.swift` files in both
  roots;
- fake `swiftc` prepended to `PATH`;
- `SCAN_HELPER_TEAM_ID=ABCDE12345`.

Expected RED:

- The current script ignores `--project-root` and writes the helper output and
  `.requirement.json` under `cwd`, not `<artifact-root>`.

Result:

- RED confirmed: the helper output was not written under the explicit artifact
  root.

- [x] **Step 3: Add missing project root value test**

Run:

```bash
bun run <repo>/scripts/build-macos-privileged-helper.ts --project-root
```

Expected RED:

- The script exits `0` before implementation because the option is ignored.

Result:

- RED confirmed: the script exited `0` instead of failing with
  `missing value for --project-root`.

- [x] **Step 4: Add option-as-value regression test**

Add a regression test for option-looking values in the project root position:

```bash
bun run <repo>/scripts/build-macos-privileged-helper.ts --project-root --team-id
```

Result:

- The test passes after implementation because values beginning with `--` are
  rejected as missing project root values.

- [x] **Step 5: Add generated source compile input regression test**

After sub-agent review, make fake `swiftc` record its arguments and assert the
actual compile input is:

```text
<project-root>/.tmp/swift-generated/privileged-helper-main.swift
```

Result:

- RED confirmed: the script still compiled a second generated source under
  `/tmp/diskviz-privileged-helper-*`.

### Task 2: Implement Project Root Parsing

**Files:**

- Modify: `scripts/build-macos-privileged-helper.ts`

- [x] **Step 1: Parse `--project-root`**

Use local argument parsing consistent with B38: missing, blank, or
option-looking values must throw `missing value for --project-root`.

- [x] **Step 2: Resolve all build paths from selected root**

Use the selected project root for:

- source Swift file
- traversal Swift file
- output helper executable
- requirement metadata
- `.tmp/swift-module-cache`
- `.tmp/swift-generated/privileged-helper-main.swift`

After review, the actual `swiftc` compile input also uses the selected root's
generated Swift file instead of a second `/tmp` copy.

- [x] **Step 3: Preserve default behavior**

When `--project-root` is absent, keep `process.cwd()`.

### Task 3: Verify And Document

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b39-privileged-helper-build-project-root.md`

- [x] **Step 1: Run focused tests**

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts
```

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` passed, 1 file and 9
  tests.

- [x] **Step 2: Run related helper readiness tests**

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperPreflightAuditScript.test.ts
```

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperPreflightAuditScript.test.ts`
  passed, 4 files and 19 tests.

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

- `pnpm test` passed, 55 files and 268 tests.
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

Ask the reviewer to inspect only B39 for:

- build script path resolution correctness
- no writes to the live repository from tests
- no readiness semantic changes
- no production identity fabrication

Result:

- Sub-agent `019ea2d3-1d6c-7493-ab61-c05eb15e73ce` found no Critical issues.
- Important feedback: the script wrote a generated Swift source under the
  selected root, but compiled a second copy under `/tmp`.
- Minor feedback: tests did not directly assert module cache/generated source
  placement.

- [x] **Step 2: Address review findings**

Fix Critical and Important issues before proceeding.

Result:

- Added fake `swiftc` argument logging.
- Asserted selected-root generated source and module cache are created outside
  `cwd`.
- Removed the second `/tmp` generated source and compiled the selected-root
  generated source directly.
- Follow-up sub-agent review found no Critical, Important, or Minor issues.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-macos-privileged-helper.ts test/main/macosPrivilegedHelperCli.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b39-privileged-helper-build-project-root.md
git commit -m "feat: add privileged helper build project root option"
```

### Rollback Plan

Revert only the privileged helper build `--project-root` option, B39 tests, and
B39 documentation. Do not change helper readiness gates or previous helper build
outputs.
