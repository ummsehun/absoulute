# Phase B35 Helper ServiceManagement Control Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:test-driven-development for code changes and request sub-agent
> review before committing this mini phase.

**Goal:** Add a safe standalone script for explicit ServiceManagement
`register`/`unregister` control evidence.

**Architecture:** Keep all macOS ServiceManagement execution behind the existing
`MacOsServiceManagementControl` implementation. The new script must be
confirmation-gated and must not invoke register/unregister unless `--confirm`
is present. Registration must also respect install preflight blockers before
calling the controller.

**Non-goals:**

- Do not auto-register the helper from readiness audits.
- Do not weaken install preflight gates.
- Do not enable helper defaults.
- Do not fake ServiceManagement registration evidence.

---

### Task 1: Add RED Control Script Tests

**Files:**

- Add: `test/main/helperServiceManagementControlScript.test.ts`

- [x] **Step 1: Require explicit confirmation**

Add a test proving `register` without `--confirm` exits blocked and does not
invoke the probe/controller binary.

- [x] **Step 2: Block register before install preflight is ready**

Add a test proving confirmed `register` exits blocked before invoking the
controller when install preflight evidence is missing.

- [x] **Step 3: Allow confirmed unregister**

Add a test proving confirmed `unregister` invokes the controller and returns the
unregister result.

Expected RED:

- Tests fail because the control script does not exist.

Result:

- RED confirmed: `pnpm test test/main/helperServiceManagementControlScript.test.ts`
  failed because the control script did not exist and produced no JSON output.

### Task 2: Implement Control Script

**Files:**

- Add: `scripts/control-helper-service-management.ts`
- Modify: `package.json`

- [x] **Step 1: Parse script options**

Support:

- `--operation register|unregister`
- `--confirm`
- `--platform`
- `--resources-path`
- `--probe-bin`
- `--project-root`
- `--out`

- [x] **Step 2: Confirmation-gate control operations**

Return blocked JSON and exit 1 when `--confirm` is absent. Do not create a
controller or call the binary in that case.

- [x] **Step 3: Apply install preflight before register**

For `register`, build helper preflight evidence and use install strict mode.
If install preflight is blocked, return blocked JSON and exit 1 without calling
the controller.

- [x] **Step 4: Invoke controller only after gates**

Use `createMacOsServiceManagementControllerFromEnv()` with explicit env,
platform, and resources path.

- [x] **Step 5: Add package script**

Add:

```json
"control:helper-service-management": "bun run scripts/control-helper-service-management.ts"
```

### Task 3: Verify And Document

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b35-helper-service-management-control-script.md`

- [x] **Step 1: Run focused tests**

```bash
pnpm test test/main/helperServiceManagementControlScript.test.ts test/main/macosServiceManagementProbe.test.ts
```

- [x] **Step 2: Run related helper tests**

```bash
pnpm test test/main/helperClient.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts
```

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
- Control script is available but remains confirmation-gated.

Result:

- `pnpm test test/main/helperServiceManagementControlScript.test.ts` passed,
  1 file and 3 tests.
- `pnpm test test/main/helperServiceManagementControlScript.test.ts test/main/macosServiceManagementProbe.test.ts`
  passed, 2 files and 17 tests.
- `pnpm test test/main/helperClient.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts`
  passed, 4 files and 48 tests.
- `pnpm test` passed, 53 files and 258 tests.
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

Ask the reviewer to check confirmation gating, register preflight blocking,
unregister behavior, script JSON output, package script, and default helper
activation.

- [x] **Step 2: Address Critical and Important findings**

- [x] **Step 3: Commit**

```bash
git add scripts/control-helper-service-management.ts package.json test/main/helperServiceManagementControlScript.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b35-helper-service-management-control-script.md
git commit -m "feat: add helper service management control script"
```

Result:

- Sub-agent `019ea2d3-1d6c-7493-ab61-c05eb15e73ce` reviewed B35.
- Critical: none.
- Important: none.
- Minor: none.
- Reviewer confirmed `--confirm` gating prevents controller invocation,
  confirmed `register` is blocked before controller invocation when install
  preflight is not ready, confirmed `unregister` behavior is acceptable for
  cleanup, package script is correct, and helper default activation/readiness
  gates are not weakened.
- Reviewer did not run tests; verification was performed locally in Task 3.
- Committed as `4ac42e8 feat: add helper service management control script`.

## Rollback

Revert only the B35 control script, package script, tests, and documentation.
