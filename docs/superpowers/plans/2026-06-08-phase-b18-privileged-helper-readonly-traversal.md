# Phase B18 Privileged Helper Read-Only Traversal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the privileged helper's `scan.enumerate` XPC method perform
read-only directory traversal and return helper protocol events.

**Architecture:** Keep `native/macos-helper/privileged-helper/main.swift` below
the 500 LOC stabilization target by moving traversal into a separate Swift
source file compiled into the privileged helper. The method still returns
newline-delimited helper protocol JSON through a single XPC reply string in
this mini phase. Streaming over XPC and main-process bridge wiring remain later
work.

**Non-goals:**

- Do not enable helper-backed scans by default.
- Do not bypass readiness, identity, ServiceManagement, or FDA evidence gates.
- Do not add cleanup, file writes, chmod/chown, delete, move, or arbitrary
  command execution.
- Do not claim production readiness or real installed-helper evidence.

---

### Task 1: Add Source Contract Tests

**Files:**

- Modify: `test/main/macosPrivilegedHelperCli.test.ts`

- [x] **Step 1: Assert traversal source is compiled and read-only**

Add source assertions that:

- `scripts/build-macos-privileged-helper.ts` compiles
  `native/macos-helper/privileged-helper/enumerateTraversal.swift`.
- `enumerateTraversal.swift` uses `FileManager.default.enumerator`.
- traversal emits helper protocol `entry_batch`, `progress`, `coverage`,
  `warn`, and `done` events.
- traversal respects `maxDepth`, `sameDeviceOnly`, and `skipDescendants`.
- privileged helper no longer returns the B17
  `scan.enumerate traversal is not implemented` error for valid requests.
- no cleanup, write, delete, chmod/chown, move, or shell execution APIs are
  introduced.

Run:

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts
```

Expected RED: traversal source is not compiled and valid requests still return
the B17 not-implemented error.

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` failed before
  implementation because `enumerateTraversal.swift` did not exist and the build
  script did not compile it.

### Task 2: Implement Traversal Source

**Files:**

- Add: `native/macos-helper/privileged-helper/enumerateTraversal.swift`
- Modify: `native/macos-helper/privileged-helper/main.swift`

- [x] **Step 1: Add read-only traversal helper**

Implement `enumeratePrivileged(_ request: HelperEnumerateRequest) throws ->
[String]` that:

- creates a read-only `FileManager.default.enumerator`.
- emits `entry_batch`, `progress`, `coverage`, `warn`, and `done` events.
- reports permission failures as `E_HELPER_PERMISSION`.
- reports IO failures as `E_IO`.
- reports cross-device skips as `E_SCOPE`.
- respects `maxDepth`, `sameDeviceOnly`, and `emitPolicy.batchMaxItems`.
- never writes to user-controlled paths.

- [x] **Step 2: Wire the XPC method**

After strict validation succeeds, return:

- `ready`
- traversal events from `enumeratePrivileged`

Do not return the B17 not-implemented error for valid requests.

### Task 3: Build Script And Artifact

**Files:**

- Modify: `scripts/build-macos-privileged-helper.ts`
- Potentially modified by build:
  `.tmp/swift-generated/privileged-helper-main.swift`
- Potentially modified by build:
  `resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper`

- [x] **Step 1: Compile multiple Swift sources**

Update the privileged helper build script to pass both generated main source
and `enumerateTraversal.swift` to `swiftc`.

Run:

```bash
pnpm build:native:privileged-helper
```

Expected:

- Swift helper compiles.
- Placeholder Team ID metadata remains blocked.

Result:

- `pnpm build:native:privileged-helper`: passed.
- The build script writes the tracked generated evidence file to
  `.tmp/swift-generated/privileged-helper-main.swift`, while compiling a temp
  `main.swift` from the system temp directory so multi-file Swift top-level code
  compiles without leaving untracked worktree files.

### Task 4: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b18-privileged-helper-readonly-traversal.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B18 section stating:

- privileged helper `scan.enumerate` now performs read-only traversal.
- traversal is returned as newline-delimited helper protocol events in a single
  XPC reply string.
- streaming XPC bridge and default helper activation remain later work.
- readiness remains blocked until production identity/FDA/ServiceManagement
  evidence exists.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts
pnpm build:native:privileged-helper
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
- privileged helper Swift build succeeds.
- helper preflight/readiness remain blocked without real production evidence.

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts`: passed, 5 tests.
- `pnpm build:native:privileged-helper`: passed.
- `pnpm test`: passed, 45 files, 204 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight with placeholder
  `TEAMID_NOT_CONFIGURED` listener metadata.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.
- LOC check:
  - `native/macos-helper/privileged-helper/main.swift`: 338
  - `native/macos-helper/privileged-helper/enumerateTraversal.swift`: 209

### Task 5: Review And Commit

**Files:**

- All files changed by Tasks 1-4.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B18 for:

- accidental helper default activation.
- cleanup/write/delete/chmod/chown/shell execution exposure.
- traversal event schema mismatches.
- missing permission/IO/scope coverage events.
- overclaiming production readiness or installed-helper evidence.
- file size regression beyond the 500 LOC stabilization target.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Review result:

- First review found an Important event encoding issue: optional `mtimeMs`,
  `inode`, and `deviceId` values could enter JSON payloads as invalid optional
  values.
- Fixed by adding optional metadata keys only when values are present.
- First review found an Important root device lookup issue: root stat failures
  could escape as invalid request errors without coverage/done events.
- Fixed by converting root device lookup failures into `E_IO` warn, coverage,
  and done events.
- First review found an Important coverage issue: enumerator creation failure
  emitted `E_IO` but did not increment `ioFailures`.
- Fixed by incrementing `ioFailures` before coverage emission.
- Re-ran the full verification set after fixes with the same passing results
  listed above.
- Follow-up review reported no Critical or Important findings.
- Remaining Minor: tests are still source-contract focused; an installed XPC
  fixture that parses actual Swift traversal replies with `HelperEventSchema`
  remains future bridge/integration work.

- [x] **Step 3: Commit**

```bash
git add native/macos-helper/privileged-helper/main.swift native/macos-helper/privileged-helper/enumerateTraversal.swift scripts/build-macos-privileged-helper.ts .tmp/swift-generated/privileged-helper-main.swift resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper test/main/macosPrivilegedHelperCli.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b18-privileged-helper-readonly-traversal.md
git commit -m "feat: add privileged helper readonly traversal"
```

## Rollback

Revert only the privileged helper traversal source, build script change,
generated helper artifact, tests, and documentation. Do not revert prior helper
readiness gates or enable helper execution by default.
