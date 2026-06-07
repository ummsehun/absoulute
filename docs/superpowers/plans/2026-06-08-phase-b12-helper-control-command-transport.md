# Phase B12 Helper Control Command Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a helper control command boundary so `health.check` and
`version.get` requests can be executed and validated without enabling helper
scan execution by default.

**Architecture:** Keep scan enumeration isolated in
`macosHelperEnumerateCommand.ts`. Add a separate
`macosHelperControlCommand.ts` boundary that accepts only `health.check` and
`version.get` envelopes, validates event request IDs, and returns health/version
evidence to `MacOsXpcHelperTransport`. The packaged Swift helper-control CLI is
a prototype command resource, not a claim of production XPC identity readiness.

**Tech Stack:** Electron main process, TypeScript, Vitest, Swift command-line
helper prototype, electron-builder resources.

---

### Task 1: Add Helper Control Command Boundary

**Files:**
- Create: `src/main/services/helper/macosHelperControlCommand.ts`
- Modify: `test/main/helperClient.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that:

- `MacOsHelperControlCommand.healthCheck()` runs a `health.check` envelope and
  returns a status only after receiving a matching `ready` and terminal `done`
  event.
- `MacOsHelperControlCommand.getVersion()` runs a `version.get` envelope and
  returns the `helperVersion` from the matching `ready` event.
- mismatched request IDs are rejected before results are accepted.
- `scan.enumerate` envelopes are rejected by the control command boundary.

Run:

```bash
pnpm test test/main/helperClient.test.ts
```

Expected RED: tests fail because `macosHelperControlCommand.ts` does not exist.

- [ ] **Step 2: Implement minimal command boundary**

Create `macosHelperControlCommand.ts` with:

- `MACOS_HELPER_CONTROL_BINARY_NAME = "helper-control-macos"`
- `MacOsHelperControl` interface with `healthCheck()` and `getVersion()`
- command runner that writes the request JSON to stdin and parses JSONL events
- strict request ID binding, terminal-after-terminal rejection, and unsupported
  operation rejection
- resource resolution from `SCAN_HELPER_CONTROL_BIN` or
  `<resourcesPath>/bin/helper-control-macos`

- [ ] **Step 3: Verify boundary tests pass**

Run:

```bash
pnpm test test/main/helperClient.test.ts
```

Expected GREEN: helper client tests pass.

### Task 2: Wire Control Command Into XPC Transport

**Files:**
- Modify: `src/main/services/helper/macosXpcHelperTransport.ts`
- Modify: `src/main/services/helper/helperClient.ts`
- Modify: `test/main/helperClient.test.ts`

- [ ] **Step 1: Write failing transport tests**

Add tests that:

- `MacOsXpcHelperTransport.getVersion()` delegates to configured control
  command and returns the helper version.
- `MacOsXpcHelperTransport.healthCheck()` delegates to configured control
  command, combines the result with ServiceManagement and registration preflight
  evidence, and does not make helper available when external gates remain
  blocked.
- `createDefaultHelperTransport()` resolves a packaged `helper-control-macos`
  resource on darwin when XPC transport is explicitly requested.

Run:

```bash
pnpm test test/main/helperClient.test.ts
```

Expected RED: transport still returns `null` for version and `getStatus()` for
health.

- [ ] **Step 2: Implement transport wiring**

Add optional `control?: MacOsHelperControl` and `controlBinaryPath?: string` to
`MacOsXpcHelperTransportOptions`. Wire `getVersion()` and `healthCheck()` to
the configured control command. If no control command exists, keep the existing
not-implemented behavior.

- [ ] **Step 3: Verify transport tests pass**

Run:

```bash
pnpm test test/main/helperClient.test.ts
```

Expected GREEN: helper client tests pass.

### Task 3: Add Native Control CLI And Packaging Evidence

**Files:**
- Create: `native/macos-helper/control/main.swift`
- Create: `scripts/build-macos-helper-control.ts`
- Modify: `package.json`
- Modify: `electron-builder.json`
- Modify: `test/main/helperPackaging.test.ts`

- [ ] **Step 1: Write failing packaging/CLI tests**

Add tests proving:

- electron-builder packages `helper-control-macos` from `resources/bin`.
- package scripts include `build:native:helper-control`.
- Swift source exists at `native/macos-helper/control/main.swift`.

Run:

```bash
pnpm test test/main/helperPackaging.test.ts
```

Expected RED: package config and source path do not exist yet.

- [ ] **Step 2: Implement native control CLI and packaging config**

The Swift CLI should:

- read one helper request from stdin
- accept only `health.check` and `version.get`
- reject unknown top-level fields
- emit `ready` with `helperVersion: "dev-control-0.1.0"`
- emit terminal `done` with `estimated: false`
- emit `error` with `E_INVALID_REQUEST` and exit nonzero on invalid input

- [ ] **Step 3: Verify packaging tests pass**

Run:

```bash
pnpm test test/main/helperPackaging.test.ts
```

Expected GREEN: packaging tests pass.

### Task 4: Document And Verify

**Files:**
- Modify: `docs/project-status-audit.md`
- Modify: `docs/superpowers/plans/2026-06-08-phase-b12-helper-control-command-transport.md`

- [ ] **Step 1: Document facts and blockers**

Add a Phase B12 section to `docs/project-status-audit.md` stating:

- helper control command transport exists for health/version request evidence.
- packaged native `helper-control-macos` source/build/resource configuration is
  present.
- helper default activation remains disabled.
- readiness remains blocked until real production identity, FDA, packaging, and
  ServiceManagement evidence exist.

- [ ] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperClient.test.ts
pnpm test test/main/helperPackaging.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-readiness
```

Expected:

- tests, typecheck, lint, build, and Rust tests pass.
- `pnpm audit:helper-readiness` remains intentionally blocked while production
  identity, FDA, packaging evidence, helper executable evidence, and
  ServiceManagement evidence are missing.

### Task 5: Review And Commit

**Files:**
- All files changed by Tasks 1-4.

- [ ] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only the Phase B12 diff for:

- unsupported operation handling
- request ID binding
- health/version evidence overclaiming
- package config drift
- helper default activation regressions

- [ ] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they are low-risk and clarify the Phase B evidence.

Review feedback addressed:

- `healthCheck()` no longer treats local control command success as XPC channel
  pass evidence before ServiceManagement and preflight evidence are ready.
- control request default IDs now use UUIDs instead of fixed operation strings.
- tests now cover unsupported control events and terminal-after-terminal events.
- fix-review reported no Critical, Important, or Minor findings after the
  updates.

- [ ] **Step 3: Commit**

```bash
git add src/main/services/helper/macosHelperControlCommand.ts src/main/services/helper/macosXpcHelperTransport.ts src/main/services/helper/helperClient.ts test/main/helperClient.test.ts test/main/helperPackaging.test.ts native/macos-helper/control/main.swift scripts/build-macos-helper-control.ts package.json electron-builder.json docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b12-helper-control-command-transport.md
git commit -m "feat: add helper control command transport"
```

## Rollback

Revert only the helper control command boundary, native control CLI, packaging
configuration, tests, and documentation. Do not change helper readiness gates or
enable helper-backed scan execution by default.
