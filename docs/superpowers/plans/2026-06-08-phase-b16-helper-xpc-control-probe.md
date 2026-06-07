# Phase B16 Helper XPC Control Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the packaged `helper-control-macos` command from a local
control-response simulator into a narrow Mach service XPC probe for the
privileged helper health/version surface added in Phase B15.

**Architecture:** Keep the main app transport and helper default activation
gated. The command remains a child-process bridge used by TypeScript because
Node/Electron does not directly expose NSXPC APIs. The command should validate
the existing helper control request envelope, connect to
`com.example.diskvisualizer.privileged-helper`, call only `healthCheck` or
`getVersion`, and emit existing helper protocol `ready`/`done`/`error` events.

**Non-goals:**

- Do not add privileged scan enumeration to the XPC helper.
- Do not enable helper-backed scans by default.
- Do not treat local command success as production readiness without
  ServiceManagement, identity, FDA, and packaging evidence.
- Do not add arbitrary command execution, writes, cleanup, chmod/chown, or
  delete operations.

---

### Task 1: Add Source Contract Tests

**Files:**

- Modify: `test/main/helperClient.test.ts`
- Modify: `test/main/macosPrivilegedHelperCli.test.ts`

- [x] **Step 1: Assert helper control source uses NSXPC**

Add source assertions that `native/macos-helper/control/main.swift`:

- defines the same Objective-C-compatible control protocol method names:
  `healthCheck` and `getVersion`.
- connects with
  `NSXPCConnection(machServiceName:options:)`.
- sets `remoteObjectInterface`.
- calls only health/version methods.
- still emits helper protocol `ready`, `done`, and `error` events.
- does not contain scan enumeration APIs.

- [x] **Step 2: Assert transport still treats the command as evidence-gated**

Add a TypeScript assertion that local command control success can set
`xpc-channel: pass` only when registration preflight and ServiceManagement
checks are ready.

Run:

```bash
pnpm test test/main/helperClient.test.ts test/main/macosPrivilegedHelperCli.test.ts
```

Expected RED: current helper control command does not use NSXPC.

Result:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` failed before
  implementation because the helper control command did not define the
  privileged helper XPC protocol or NSXPC connection.
- Existing `helperClient` coverage already asserts local control command success
  only marks `xpc-channel: pass` when registration preflight and
  ServiceManagement evidence are ready.

### Task 2: Implement Swift XPC Control Probe

**Files:**

- Modify: `native/macos-helper/control/main.swift`

- [x] **Step 1: Keep strict request validation**

Retain existing strict decoding and validation for:

- schema version
- request id
- scan id
- stage id
- operation allowlist
- issued timestamp
- nonce
- unknown request/payload fields

- [x] **Step 2: Connect to privileged helper Mach service**

Implement a small `DiskVisualizerPrivilegedHelperProtocol` client protocol that
matches Phase B15 and use `NSXPCConnection` to call:

- `healthCheck` for `health.check`
- `getVersion` for `version.get`

Emit:

- `ready` with the helper version returned by the helper.
- `done` after a successful reply.
- `error` and non-zero exit for connection, timeout, invalid output, or XPC
  failure.

Do not add scan enumeration methods.

### Task 3: Build And Package Probe

**Files:**

- Potentially modified by build: `resources/bin/helper-control-macos`

- [x] **Step 1: Build helper control command**

Run:

```bash
pnpm build:native:helper-control
```

Expected:

- Swift helper control command compiles.
- The generated command remains packaged through `electron-builder.json`.

Result:

- `pnpm build:native:helper-control`: passed.

### Task 4: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b16-helper-xpc-control-probe.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B16 section stating:

- `helper-control-macos` now probes the privileged helper Mach service XPC
  health/version surface.
- helper scan enumeration is still not exposed through XPC.
- main app helper transport remains opt-in and evidence-gated.
- readiness remains blocked until production identity/FDA/ServiceManagement
  evidence exists.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperClient.test.ts test/main/macosPrivilegedHelperCli.test.ts
pnpm build:native:helper-control
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
- helper control Swift build succeeds.
- helper preflight/readiness remain blocked without real production evidence.

Result:

- `pnpm test test/main/helperClient.test.ts
  test/main/macosPrivilegedHelperCli.test.ts`: passed, 2 files, 37 tests.
- `pnpm build:native:helper-control`: passed.
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

Ask the reviewer to inspect only Phase B16 for:

- accidental scan enumeration exposure through control XPC.
- treating local XPC probe success as readiness without registration evidence.
- request validation regressions.
- helper default activation regressions.
- overclaiming production readiness in docs.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Review result:

- First review found one Important issue: Swift emitted
  `E_XPC_CONTROL_FAILED`, which was outside the shared helper protocol error
  code schema.
- Fixed by mapping `ValidationError` and `DecodingError` to
  `E_INVALID_REQUEST`, and XPC/probe failures to `E_HELPER_INTERNAL`.
- Added source assertions that the control probe uses `E_INVALID_REQUEST` and
  `E_HELPER_INTERNAL` and does not use `E_XPC_CONTROL_FAILED`.
- Follow-up review reported no Critical, Important, or Minor findings.

- [x] **Step 3: Commit**

```bash
git add native/macos-helper/control/main.swift resources/bin/helper-control-macos test/main/helperClient.test.ts test/main/macosPrivilegedHelperCli.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b16-helper-xpc-control-probe.md
git commit -m "feat: probe privileged helper xpc control surface"
```

## Rollback

Revert only the helper control command XPC probe, generated helper control
artifact, tests, and documentation. Do not revert prior Phase B helper
readiness gates or enable helper execution by default.
