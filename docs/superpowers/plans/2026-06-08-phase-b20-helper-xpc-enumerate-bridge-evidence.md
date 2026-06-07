# Phase B20 Helper XPC Enumerate Bridge Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the packaged `helper-xpc-enumerate-macos` bridge an explicit
helper readiness and preflight evidence item.

**Architecture:** Phase B19 added the XPC enumerate bridge and made the
TypeScript helper transport prefer it. Phase B20 closes the evidence gap:
enumeration readiness must not pass unless the bridge is built, executable,
Mach-O, packaged by `electron-builder.json`, and explicitly confirmed by the
preflight environment. Install readiness stays separate from enumeration
readiness because the bridge is an app-side enumerate command, not the
ServiceManagement daemon install payload.

**Non-goals:**

- Do not enable helper-backed scans by default.
- Do not claim ServiceManagement, production signing, or FDA readiness.
- Do not replace the privileged helper executable or LaunchDaemon evidence.
- Do not remove the local prototype enumerate CLI fallback.

---

### Task 1: Add RED Tests

**Files:**

- Modify: `test/main/helperRegistration.test.ts`
- Modify: `test/main/helperPreflightAudit.test.ts`
- Modify: `test/main/helperReadinessAudit.test.ts`

- [x] **Step 1: Assert registration preflight bridge evidence**

Add assertions that:

- `helper-xpc-enumerate-bridge-missing` is a registration blocker when the
  bridge is not ready.
- environment evidence requires both
  `SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY=1` and a packaged executable Mach-O
  bridge artifact.
- missing, non-executable, non-Mach-O, or unpackaged bridge artifacts do not
  count as ready.

- [x] **Step 2: Assert preflight audit bridge evidence**

Add assertions that:

- artifact, confirmation, and effective evidence expose
  `helperXpcEnumerateBridge`.
- the bridge blocker has remediation pointing at
  `pnpm build:native:helper-xpc-enumerate`.
- install readiness is not blocked by the bridge evidence, but enumerate
  readiness is.

- [x] **Step 3: Assert readiness guidance**

Add assertions that `audit:helper-readiness` reports a failed
`xpc-enumerate-bridge` evidence item when the bridge blocker is present.

Run:

```bash
pnpm test test/main/helperRegistration.test.ts test/main/helperPreflightAudit.test.ts test/main/helperReadinessAudit.test.ts
```

Expected RED: the bridge blocker, evidence key, environment variable, artifact
resolver, and remediation do not exist yet.

Result:

- `pnpm test test/main/helperRegistration.test.ts
  test/main/helperPreflightAudit.test.ts test/main/helperReadinessAudit.test.ts`
  failed before implementation because the bridge blocker, evidence field,
  artifact resolver, and readiness guidance did not exist yet.

### Task 2: Implement Evidence Gate

**Files:**

- Modify: `src/main/services/helper/helperRegistration.ts`
- Modify: `src/main/services/helper/helperPreflightAudit.ts`
- Modify: `src/main/services/helper/helperReadinessAudit.ts`

- [x] **Step 1: Add registration evidence**

Add:

- `helper-xpc-enumerate-bridge-missing` blocker.
- `SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY` confirmation variable.
- `resources/bin/helper-xpc-enumerate-macos` source-relative path constant.
- resolver that requires executable bit, Mach-O header, and
  `electron-builder.json` `extraResources` packaging into `bin`.

- [x] **Step 2: Add preflight/readiness audit evidence**

Expose the evidence in artifact, confirmation, effective, remediation, and
readiness guidance outputs. Keep install readiness independent from this
enumeration bridge blocker.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b20-helper-xpc-enumerate-bridge-evidence.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B20 section stating:

- the XPC enumerate bridge is now an explicit preflight/readiness evidence item.
- missing bridge evidence blocks enumerate readiness.
- install readiness remains focused on ServiceManagement install prerequisites.
- default helper activation remains disabled and externally blocked.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperRegistration.test.ts test/main/helperPreflightAudit.test.ts test/main/helperReadinessAudit.test.ts
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
- helper readiness remains blocked without production identity/FDA/
  ServiceManagement evidence.
- helper preflight/remediation explicitly mentions the XPC enumerate bridge
  when bridge confirmation or artifact evidence is missing.

Result:

- `pnpm test test/main/helperRegistration.test.ts
  test/main/helperPreflightAudit.test.ts test/main/helperReadinessAudit.test.ts`:
  passed, 3 files, 28 tests.
- `pnpm test test/main/helperClient.test.ts test/main/helperRegistration.test.ts
  test/main/helperPreflightAudit.test.ts test/main/helperReadinessAudit.test.ts`:
  passed, 4 files, 62 tests.
- `pnpm test`: passed, 45 files, 210 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight. Artifact evidence
  detected `helperXpcEnumerateBridge: true`, but effective evidence remained
  false because `SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY` was not set.
- `pnpm audit:helper-readiness`: reported `status: "blocked"`,
  `canEnableHelperByDefault: false`, and failed
  `xpc-enumerate-bridge` evidence guidance.
- LOC check:
  - `src/main/services/helper/helperRegistration.ts`: 459
  - `src/main/services/helper/helperPreflightAudit.ts`: 416
  - `src/main/services/helper/helperReadinessAudit.ts`: 187
  - `src/main/services/helper/macosXpcHelperTransport.ts`: 249

### Task 4: Review And Commit

**Files:**

- All files changed by Tasks 1-3.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B20 for:

- accidental helper default activation.
- bridge evidence overclaiming readiness from environment variables alone.
- install readiness being blocked by app-side enumerate bridge evidence.
- missing remediation or misleading readiness guidance.
- broad coupling between helper registration and transport implementation.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Review result:

- Critical: none.
- Important: none.
- Minor: commit example omitted `src/main/services/helper/macosXpcHelperTransport.ts`
  and `test/main/helperClient.test.ts`.
- Fixed the Minor documentation issue before commit.

- [x] **Step 3: Commit**

```bash
git add src/main/services/helper/helperRegistration.ts src/main/services/helper/helperPreflightAudit.ts src/main/services/helper/helperReadinessAudit.ts src/main/services/helper/macosXpcHelperTransport.ts test/main/helperRegistration.test.ts test/main/helperPreflightAudit.test.ts test/main/helperReadinessAudit.test.ts test/main/helperClient.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b20-helper-xpc-enumerate-bridge-evidence.md
git commit -m "feat: gate helper xpc enumerate bridge evidence"
```

Result:

- Commit created with message
  `feat: gate helper xpc enumerate bridge evidence`.

## Rollback

Revert only the bridge evidence gate, tests, and documentation for Phase B20.
Do not revert the Phase B19 bridge implementation.
