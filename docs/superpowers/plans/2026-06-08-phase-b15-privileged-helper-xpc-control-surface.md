# Phase B15 Privileged Helper XPC Control Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder privileged-helper listener that rejects every
connection with a minimal read-only XPC control surface for health/version
checks.

**Architecture:** Keep privileged scan enumeration disabled. The production
helper Swift source should still require the configured caller signing
requirement before accepting a connection. After acceptance, it exports only a
small Objective-C-compatible protocol with `healthCheck` and `getVersion`
reply methods. TypeScript remains gated; this phase does not implement a real
Node/Electron XPC client or enable helper scan execution by default.

**Tech Stack:** Swift, Foundation NSXPCListener, Vitest source/packaging tests,
Bun build script.

---

### Task 1: Add XPC Control Surface Tests

**Files:**
- Modify: `test/main/macosPrivilegedHelperCli.test.ts`

- [x] **Step 1: Write failing source contract test**

Extend the privileged helper source test to assert:

- the source defines an `@objc` helper protocol.
- the protocol includes `healthCheck` and `getVersion`.
- `shouldAcceptNewConnection` no longer immediately invalidates and rejects the
  connection.
- accepted connections set `exportedInterface`.
- accepted connections set `exportedObject`.
- accepted connections call `resume()` and return `true`.

Run:

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts
```

Expected RED: current source still invalidates and returns `false`.

### Task 2: Implement Minimal Swift XPC Control Surface

**Files:**
- Modify: `native/macos-helper/privileged-helper/main.swift`

- [x] **Step 1: Implement read-only protocol**

Add:

- `@objc(DiskVisualizerPrivilegedHelperProtocol)` protocol with:
  - `func healthCheck(_ reply: @escaping (String) -> Void)`
  - `func getVersion(_ reply: @escaping (String) -> Void)`
- `final class DiskVisualizerPrivilegedHelperService` implementing the
  protocol.
- health response string such as `ok`.
- version string such as `dev-privileged-helper-0.1.0`.
- listener acceptance that assigns `exportedInterface`, assigns
  `exportedObject`, resumes the connection, and returns `true`.

Do not add scan enumeration APIs in this phase.

- [x] **Step 2: Verify source tests pass**

Run:

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts
```

Expected GREEN: privileged helper source contract tests pass.

### Task 3: Compile Privileged Helper And Preserve Metadata

**Files:**
- Potentially modified by build: `resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper`
- Potentially modified by build: `resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper.requirement.json`

- [x] **Step 1: Build helper**

Run:

```bash
pnpm build:native:privileged-helper
```

Expected:

- Swift helper compiles.
- generated requirement metadata still records `ready: false` unless a real
  `SCAN_HELPER_TEAM_ID` is supplied.
- helper readiness remains blocked.

### Task 4: Document And Verify

**Files:**
- Modify: `docs/project-status-audit.md`
- Modify: `docs/superpowers/plans/2026-06-08-phase-b15-privileged-helper-xpc-control-surface.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B15 section stating:

- privileged helper source now exports health/version XPC control methods.
- the signing requirement remains in place before connection acceptance.
- scan enumeration is still not exposed through the privileged helper service.
- helper default activation remains disabled.
- readiness remains blocked until real identity/FDA/ServiceManagement evidence
  exists.

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

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts`: passed, 3 tests.
- `pnpm build:native:privileged-helper`: passed.
- `pnpm test`: passed, 45 files, 202 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight with placeholder
  `TEAMID_NOT_CONFIGURED` listener metadata.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.

### Task 5: Review And Commit

**Files:**
- All files changed by Tasks 1-4.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B15 for:

- XPC connection acceptance before signing requirement is configured
- accidental scan API exposure
- helper default activation regressions
- build/metadata overclaiming production readiness

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Review result:

- First review found one Minor gap: the real Team ID generated-source path was
  not directly guarded.
- Added a source simulation test that replaces `TEAMID_NOT_CONFIGURED` with a
  real Team ID and asserts the export/resume/true path remains reachable.
- Follow-up review reported no Critical, Important, or Minor findings.

- [ ] **Step 3: Commit**

```bash
git add native/macos-helper/privileged-helper/main.swift .tmp/swift-generated/privileged-helper-main.swift test/main/macosPrivilegedHelperCli.test.ts resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b15-privileged-helper-xpc-control-surface.md
git commit -m "feat: add privileged helper xpc control surface"
```

## Rollback

Revert only the privileged helper XPC control source, generated helper artifact,
tests, and documentation. Do not add scan enumeration APIs or enable helper
execution by default.
