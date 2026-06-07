# Phase B19 Helper XPC Enumerate Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a packaged main-process bridge command that calls the privileged
helper `scan.enumerate` XPC method.

**Architecture:** Keep the existing `helper-enumerate-macos` local prototype
CLI intact for fixture tests and prototype audit. Add a separate
`helper-xpc-enumerate-macos` binary that reads the existing helper request
envelope from stdin, connects to the privileged helper Mach service, calls
`enumerate(_:withReply:)`, and writes the helper's newline-delimited event
reply to stdout. The TypeScript XPC transport should prefer the packaged XPC
bridge when present, while retaining explicit env override and local prototype
fallback.

**Non-goals:**

- Do not enable helper-backed scans by default.
- Do not bypass readiness, identity, ServiceManagement, or FDA evidence gates.
- Do not remove the local prototype enumerate CLI.
- Do not claim installed-helper production readiness.

---

### Task 1: Add RED Tests

**Files:**

- Modify: `test/main/macosPrivilegedHelperCli.test.ts`
- Modify: `test/main/helperPackaging.test.ts`
- Modify: `test/main/helperClient.test.ts`

- [x] **Step 1: Assert XPC enumerate bridge source/build/package contract**

Add assertions that:

- `native/macos-helper/xpc-enumerate/main.swift` exists.
- it defines `enumerate(_ requestJson:withReply:)`.
- it uses `NSXPCConnection(machServiceName:options:)`.
- it writes helper reply lines to stdout.
- it maps XPC/request failures to shared helper error codes.
- `package.json` has `build:native:helper-xpc-enumerate`.
- `electron-builder.json` packages `helper-xpc-enumerate-macos`.

- [x] **Step 2: Assert transport prefers packaged XPC enumerate bridge**

Add a TypeScript test that a resources directory containing both
`helper-xpc-enumerate-macos` and `helper-enumerate-macos` resolves the XPC
bridge path for `MacOsXpcHelperTransport` enumeration.

Run:

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperPackaging.test.ts test/main/helperClient.test.ts
```

Expected RED: bridge source, build script, packaging, and resolver do not exist.

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts
  test/main/helperPackaging.test.ts test/main/helperClient.test.ts` failed
  before implementation because the bridge source, package script, packaging
  entry, and resolver priority did not exist.

### Task 2: Implement Bridge And Resolver

**Files:**

- Add: `native/macos-helper/xpc-enumerate/main.swift`
- Add: `scripts/build-macos-helper-xpc-enumerate.ts`
- Modify: `src/main/services/helper/macosHelperEnumerateCommand.ts`
- Modify: `src/main/services/helper/macosXpcHelperTransport.ts` if needed.
- Modify: `package.json`
- Modify: `electron-builder.json`

- [x] **Step 1: Add Swift bridge**

Implement `helper-xpc-enumerate-macos`:

- read request JSON from stdin.
- validate enough of the request to ensure operation is `scan.enumerate` and
  requestId is 1..128 for error correlation.
- connect to `com.example.diskvisualizer.privileged-helper` with
  `NSXPCConnection`.
- call `enumerate(_:withReply:)`.
- print returned event lines to stdout.
- emit `E_INVALID_REQUEST` for invalid request shape.
- emit `E_HELPER_INTERNAL` for XPC/probe failures.

- [x] **Step 2: Prefer XPC bridge in TypeScript resolution**

Add `helper-xpc-enumerate-macos` as the preferred packaged enumerate command
when present. Keep `SCAN_HELPER_ENUMERATE_BIN` as an explicit override and keep
`helper-enumerate-macos` as fallback.

### Task 3: Build Artifact

**Files:**

- Potentially modified by build: `resources/bin/helper-xpc-enumerate-macos`

- [x] **Step 1: Build bridge**

Run:

```bash
pnpm build:native:helper-xpc-enumerate
```

Expected:

- Swift bridge compiles.
- Packaged binary exists in `resources/bin`.

Result:

- `pnpm build:native:helper-xpc-enumerate`: passed.

### Task 4: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b19-helper-xpc-enumerate-bridge.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B19 section stating:

- packaged XPC enumerate bridge exists.
- TypeScript transport can resolve the bridge.
- default helper activation remains disabled and evidence-gated.
- installed helper ServiceManagement/identity/FDA evidence is still missing.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperPackaging.test.ts test/main/helperClient.test.ts
pnpm build:native:helper-xpc-enumerate
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
- helper readiness remains blocked without production evidence.

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts
  test/main/helperPackaging.test.ts test/main/helperClient.test.ts`: passed, 3
  files, 48 tests.
- `pnpm build:native:helper-xpc-enumerate`: passed.
- `pnpm test`: passed, 45 files, 207 tests.
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
  - `native/macos-helper/xpc-enumerate/main.swift`: 191

### Task 5: Review And Commit

**Files:**

- All files changed by Tasks 1-4.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B19 for:

- default helper activation regressions.
- XPC bridge request/error event schema mismatches.
- resolver accidentally replacing explicit env override or prototype fallback.
- packaging overclaiming production readiness.
- installed helper evidence overclaiming.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Review result:

- Review found no Critical or Important findings.
- One Minor noted that bridge-side error messages could exceed the shared
  helper event schema's 2048-character limit.
- Fixed by truncating bridge-generated error messages with `boundedMessage`.
- Re-ran the full verification set after the fix with the same passing results
  listed above.

- [ ] **Step 3: Commit**

```bash
git add native/macos-helper/xpc-enumerate/main.swift scripts/build-macos-helper-xpc-enumerate.ts resources/bin/helper-xpc-enumerate-macos src/main/services/helper/macosHelperEnumerateCommand.ts test/main/macosPrivilegedHelperCli.test.ts test/main/helperPackaging.test.ts test/main/helperClient.test.ts package.json electron-builder.json docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b19-helper-xpc-enumerate-bridge.md
git commit -m "feat: add helper xpc enumerate bridge"
```

## Rollback

Revert only the XPC enumerate bridge, resolver, packaging, tests, and
documentation. Do not remove the local prototype enumerate CLI or enable helper
execution by default.
