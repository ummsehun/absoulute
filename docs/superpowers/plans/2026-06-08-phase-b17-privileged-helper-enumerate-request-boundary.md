# Phase B17 Privileged Helper Enumerate Request Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first `scan.enumerate` XPC request boundary inside the
privileged helper process, with strict JSON request validation and operation
allowlisting.

**Architecture:** Phase B16 made `helper-control-macos` probe the privileged
helper Mach service for health/version. Phase B17 extends the privileged helper
protocol shape so a future bridge can send `scan.enumerate` requests to the
installed helper. This phase validates request shape and returns helper protocol
events, but does not yet move directory traversal into the privileged helper or
enable helper-backed scans by default.

**Non-goals:**

- Do not enable helper-backed scans by default.
- Do not bypass readiness, identity, ServiceManagement, or FDA evidence gates.
- Do not add cleanup, file writes, chmod/chown, delete, move, or arbitrary
  command execution.
- Do not claim production scan readiness.

---

### Task 1: Add Source Contract Tests

**Files:**

- Modify: `test/main/macosPrivilegedHelperCli.test.ts`

- [x] **Step 1: Assert privileged helper exposes enumerate request boundary**

Add source assertions that `native/macos-helper/privileged-helper/main.swift`:

- adds `func enumerate(_ requestJson: String, withReply reply: @escaping
  (String) -> Void)` to `DiskVisualizerPrivilegedHelperProtocol`.
- decodes a strict `scan.enumerate` request envelope.
- rejects unsupported operations.
- validates IDs, nonce, path shape, max depth, emit policy, permission policy,
  volume policy, and planned root containment.
- emits helper protocol `ready`/`error` JSON lines through the reply string.
- does not contain cleanup, delete, chmod/chown, move, or arbitrary shell
  execution APIs.
- still rejects placeholder `TEAMID_NOT_CONFIGURED` builds before accepting a
  connection.

Run:

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts
```

Expected RED: privileged helper currently exposes only health/version.

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` failed before
  implementation because the privileged helper protocol did not expose
  `enumerate(_:withReply:)`.

### Task 2: Implement Privileged Helper Enumerate Boundary

**Files:**

- Modify: `native/macos-helper/privileged-helper/main.swift`

- [x] **Step 1: Add XPC protocol method**

Add an Objective-C-compatible method:

```swift
func enumerate(_ requestJson: String, withReply reply: @escaping (String) -> Void)
```

- [x] **Step 2: Add strict request models and validation**

Mirror the existing helper protocol request constraints used by
`helper-enumerate-macos`:

- `schemaVersion == 1`
- ID lengths 1...128
- nonce length 16...256
- `operation == "scan.enumerate"`
- absolute normalized POSIX root and planned roots
- root included in planned roots
- scan/accuracy/volume/permission policy allowlists
- max depth and emit policy bounds
- strict unknown field rejection

- [x] **Step 3: Return helper protocol events**

For valid requests, return newline-delimited JSON events:

- `ready` with helper version.
- `error` with `E_HELPER_INTERNAL` explaining traversal is not implemented in
  this mini phase.

For invalid requests, return:

- `error` with `E_INVALID_REQUEST`.

This creates the XPC request boundary without claiming traversal readiness.

### Task 3: Build Privileged Helper

**Files:**

- Potentially modified by build:
  `.tmp/swift-generated/privileged-helper-main.swift`
- Potentially modified by build:
  `resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper`

- [x] **Step 1: Build helper**

Run:

```bash
pnpm build:native:privileged-helper
```

Expected:

- Swift helper compiles.
- Placeholder Team ID metadata remains blocked.

Result:

- `pnpm build:native:privileged-helper`: passed.

### Task 4: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b17-privileged-helper-enumerate-request-boundary.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B17 section stating:

- privileged helper now has a strict XPC `scan.enumerate` request boundary.
- traversal is not implemented in privileged helper yet.
- helper default activation remains disabled.
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

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts`: passed, 4 tests.
- `pnpm build:native:privileged-helper`: passed.
- `pnpm test`: passed, 45 files, 203 tests.
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

Ask the reviewer to inspect only Phase B17 for:

- accidental helper default activation.
- operation allowlist or request validation gaps.
- accidental cleanup/write/delete/chmod/chown/shell execution exposure.
- overclaiming traversal or production readiness.
- placeholder Team ID acceptance regressions.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Review result:

- First review found one Important issue: invalid request errors could echo a
  too-long `requestId`, making the returned error event fail the shared helper
  event schema.
- Fixed by accepting decoded fallback request IDs only when they satisfy the
  same 1..128 length bound, otherwise returning `unknown`.
- First review also found one Minor contract difference: planned root
  containment used normalized comparison instead of the shared schema's raw
  string inclusion rule.
- Fixed by requiring `plannedRoots.contains(root)` in the Swift boundary.
- Re-ran verification after fixes with the same passing results listed above.
- Follow-up review reported no Critical, Important, or Minor findings.

- [x] **Step 3: Commit**

```bash
git add native/macos-helper/privileged-helper/main.swift .tmp/swift-generated/privileged-helper-main.swift resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper test/main/macosPrivilegedHelperCli.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b17-privileged-helper-enumerate-request-boundary.md
git commit -m "feat: add privileged helper enumerate request boundary"
```

## Rollback

Revert only the privileged helper enumerate request boundary, generated helper
artifact, tests, and documentation. Do not revert prior helper readiness gates
or enable helper execution by default.
