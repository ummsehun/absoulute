# Phase B34 Helper Readiness CLI Probe Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:test-driven-development for code changes and request sub-agent
> review before committing this mini phase.

**Goal:** Make `audit-helper-readiness` accept the same explicit
ServiceManagement probe inputs as related helper audit scripts.

**Architecture:** Keep readiness semantics unchanged. Add CLI parsing for
`--platform`, `--resources-path`, and `--probe-bin` so standalone readiness
audits can reproduce ServiceManagement evidence without relying only on
Electron `process.resourcesPath` or ambient environment.

**Non-goals:**

- Do not mark ServiceManagement ready unless the probe reports `registered`.
- Do not enable helper defaults.
- Do not change bundle readiness semantics.
- Do not fake installed helper registration.

---

### Task 1: Add RED CLI Tests

**Files:**

- Modify: `test/main/helperReadinessAuditScript.test.ts`

- [x] **Step 1: Test explicit probe binary option**

Add a test that runs:

```bash
bun run scripts/audit-helper-readiness.ts --platform darwin --probe-bin <probe>
```

with a probe that reports `pending-approval`. Expected readiness status remains
blocked and `serviceManagementStatus` is `pending-approval`.

- [x] **Step 2: Test explicit resources path option**

Add a test that creates:

```text
<resources>/bin/service-management-probe-macos
```

and runs:

```bash
bun run scripts/audit-helper-readiness.ts --platform darwin --resources-path <resources>
```

with a probe that reports `not-installed`. Expected readiness status remains
blocked and `serviceManagementStatus` is `not-installed`.

Expected RED:

- Tests fail because `audit-helper-readiness` currently ignores these CLI
  options.

Result:

- RED confirmed: `pnpm test test/main/helperReadinessAuditScript.test.ts`
  failed because explicit `--probe-bin` and `--resources-path` still produced
  `serviceManagementStatus: "not-implemented"`.

### Task 2: Implement CLI Probe Options

**Files:**

- Modify: `scripts/audit-helper-readiness.ts`

- [x] **Step 1: Parse explicit CLI options**

Add local parsing for:

- `--platform`
- `--resources-path`
- `--probe-bin`

- [x] **Step 2: Pass options into ServiceManagement probe resolution**

Use `--probe-bin` to set `SCAN_HELPER_SM_PROBE_BIN` in the script env. Pass
`--platform` and `--resources-path` to `createMacOsServiceManagementProbeFromEnv`.

- [x] **Step 3: Preserve existing output behavior**

Keep `--out`, blocked exit code, and readiness JSON shape unchanged except for
more accurate `serviceManagementStatus`.

### Task 3: Verify And Document

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b34-helper-readiness-cli-probe-options.md`

- [x] **Step 1: Run focused tests**

```bash
pnpm test test/main/helperReadinessAuditScript.test.ts
pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts
```

- [x] **Step 2: Run audits**

```bash
pnpm audit:helper-readiness
pnpm audit:helper-readiness-bundle
```

Expected:

- Audits remain intentionally blocked.
- Standalone readiness audit can use explicit probe evidence when options are
  supplied by tests or users.

Result:

- `pnpm test test/main/helperReadinessAuditScript.test.ts` passed, 1 file and
  4 tests.
- `pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts`
  passed, 4 files and 18 tests.
- `pnpm audit:helper-readiness` remained intentionally blocked.
- `pnpm audit:helper-readiness-bundle` remained intentionally blocked.

- [x] **Step 3: Run full verification**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
```

Result:

- `pnpm test` passed, 52 files and 255 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.

### Task 4: Review And Commit

- [x] **Step 1: Request sub-agent review**

Ask the reviewer to check CLI parsing, readiness semantics, default helper
activation, and consistency with related helper audit scripts.

- [x] **Step 2: Address Critical and Important findings**

- [x] **Step 3: Commit**

```bash
git add scripts/audit-helper-readiness.ts test/main/helperReadinessAuditScript.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b34-helper-readiness-cli-probe-options.md
git commit -m "feat: add helper readiness probe options"
```

Result:

- Sub-agent `019ea2d3-1d6c-7493-ab61-c05eb15e73ce` reviewed B34.
- Critical: none.
- Important: none.
- Minor: none.
- Reviewer confirmed CLI parsing is consistent with related helper audit
  scripts, probe options are passed into ServiceManagement probe resolution,
  readiness semantics are not weakened, and helper default activation is not
  changed.
- Reviewer did not run tests; verification was performed locally in Task 3.
- Committed as `4ea7b20 feat: add helper readiness probe options`.

## Rollback

Revert only B34 CLI option parsing, tests, and documentation.
