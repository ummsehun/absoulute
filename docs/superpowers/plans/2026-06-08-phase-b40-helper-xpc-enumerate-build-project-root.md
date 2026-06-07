# Phase B40 Helper XPC Enumerate Build Project Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:test-driven-development for code changes and request sub-agent
> review before committing this mini phase.

**Goal:** Let the helper XPC enumerate bridge build script generate its packaged
bridge artifact under an explicit project root so `helper-xpc-enumerate-bridge`
evidence can be rehearsed without writing into the live repository.

**Architecture:** Keep the existing default behavior when no option is passed.
Add `--project-root <path>` parsing to
`scripts/build-macos-helper-xpc-enumerate.ts` and resolve source, output, and
Swift module cache paths relative to the selected root. Do not change bridge
Swift behavior or readiness semantics.

**Non-goals:**

- Do not make helper readiness pass.
- Do not enable helper defaults.
- Do not alter the XPC enumerate bridge protocol or stream semantics.
- Do not change production identity/FDA/ServiceManagement evidence.

---

### Task 1: Add RED Build Script Tests

**Files:**

- Modify: `test/main/macosPrivilegedHelperCli.test.ts`

- [x] **Step 1: Reuse fake Swift compiler helper**

Use the existing fake `swiftc` helper that writes an output file and records
arguments when `FAKE_SWIFTC_ARGS_LOG` is set.

- [x] **Step 2: Add explicit project root test**

Run:

```bash
bun run <repo>/scripts/build-macos-helper-xpc-enumerate.ts --project-root <artifact-root>
```

with:

- `cwd` set to a different temporary root;
- minimal `native/macos-helper/xpc-enumerate/main.swift` files in both roots;
- fake `swiftc` prepended to `PATH`.

Expected RED:

- The current script ignores `--project-root` and writes
  `resources/bin/helper-xpc-enumerate-macos` under `cwd`, not
  `<artifact-root>`.

Result:

- RED confirmed: the helper XPC enumerate bridge output was not written under
  the explicit artifact root.

- [x] **Step 3: Add missing project root tests**

Run:

```bash
bun run <repo>/scripts/build-macos-helper-xpc-enumerate.ts --project-root
bun run <repo>/scripts/build-macos-helper-xpc-enumerate.ts --project-root --other
```

Expected RED:

- The script exits `0` before implementation because the option is ignored.

Result:

- RED confirmed: both missing-value forms exited `0` instead of failing with
  `missing value for --project-root`.

### Task 2: Implement Project Root Parsing

**Files:**

- Modify: `scripts/build-macos-helper-xpc-enumerate.ts`

- [x] **Step 1: Parse `--project-root`**

Use local argument parsing consistent with B38/B39: missing, blank, or
option-looking values must throw `missing value for --project-root`.

- [x] **Step 2: Resolve build paths from selected root**

Use the selected project root for:

- `native/macos-helper/xpc-enumerate/main.swift`
- `resources/bin/helper-xpc-enumerate-macos`
- `.tmp/swift-module-cache`

- [x] **Step 3: Preserve default behavior**

When `--project-root` is absent, keep `process.cwd()`.

### Task 3: Verify And Document

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b40-helper-xpc-enumerate-build-project-root.md`

- [x] **Step 1: Run focused tests**

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts
```

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` passed, 1 file and 12
  tests.

- [x] **Step 2: Run related helper evidence tests**

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperReadinessAudit.test.ts
```

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperReadinessAudit.test.ts`
  passed, 4 files and 26 tests.

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

- `pnpm test` passed, 55 files and 271 tests.
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

Ask the reviewer to inspect only B40 for:

- XPC enumerate build path resolution correctness
- no writes to the live repository from tests
- no readiness semantic changes
- no protocol/bridge behavior changes

Result:

- Sub-agent `019ea2d3-1d6c-7493-ab61-c05eb15e73ce` found no Critical,
  Important, or Minor issues.

- [x] **Step 2: Address review findings**

Fix Critical and Important issues before proceeding.

Result:

- No review fixes were required.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-macos-helper-xpc-enumerate.ts test/main/macosPrivilegedHelperCli.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b40-helper-xpc-enumerate-build-project-root.md
git commit -m "feat: add helper xpc enumerate build project root option"
```

### Rollback Plan

Revert only the XPC enumerate bridge build `--project-root` option, B40 tests,
and B40 documentation. Do not change helper readiness gates or previous helper
build script options.
