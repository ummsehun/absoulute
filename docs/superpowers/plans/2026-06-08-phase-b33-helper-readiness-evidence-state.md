# Phase B33 Helper Readiness Evidence State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:test-driven-development for code changes and request sub-agent
> review before committing this mini phase.

**Goal:** Make helper readiness output distinguish artifact evidence,
human/env confirmation evidence, and effective readiness for each blocker that
depends on both local files and explicit approval.

**Architecture:** Keep readiness semantics blocked unless effective evidence is
ready. Add optional diagnostic state to readiness evidence items so the audit
can explain cases where artifacts exist but explicit production approval inputs
are missing.

**Non-goals:**

- Do not enable the helper by default.
- Do not weaken readiness gates.
- Do not infer production approval from local artifacts alone.
- Do not fake Team ID, designated requirement, FDA, signing, notarization, or
  ServiceManagement registration evidence.

---

### Task 1: Add RED Evidence State Tests

**Files:**

- Modify: `test/main/helperReadinessAudit.test.ts`
- Modify: `test/main/helperReadinessAuditScript.test.ts`
- Modify: `test/main/helperReadinessBundle.test.ts`

- [x] **Step 1: Unit-test split evidence state**

Add a test proving an XPC enumerate bridge blocker can report:

- `artifactReady: true`
- `confirmationReady: false`
- `effectiveReady: false`

while the report remains blocked and `canEnableHelperByDefault` remains false.

- [x] **Step 2: Script-test current repo diagnostic output**

Add script coverage proving `audit-helper-readiness` includes evidence state for
artifact-backed blockers when artifacts exist but confirmation env vars are
missing.

- [x] **Step 3: Bundle-test propagated preflight evidence**

Add bundle coverage proving `readiness.evidence` receives the same
artifact/confirmation/effective split from the preflight audit.

Expected RED:

- Tests fail because `HelperReadinessEvidence` currently has no diagnostic
  artifact/confirmation/effective state.

Result:

- RED confirmed: focused tests failed because readiness evidence items lacked
  `artifactReady`, `confirmationReady`, and `effectiveReady`.

### Task 2: Implement Evidence State

**Files:**

- Modify: `src/main/services/helper/helperReadinessAudit.ts`
- Modify: `src/main/services/helper/helperReadinessBundle.ts`
- Modify: `scripts/audit-helper-readiness.ts`

- [x] **Step 1: Extend evidence shape**

Add optional booleans:

- `artifactReady`
- `confirmationReady`
- `effectiveReady`

- [x] **Step 2: Accept preflight evidence state**

Allow `buildHelperReadinessReport()` to receive preflight
`artifactEvidence`, `confirmations`, and `effectiveEvidence`.

- [x] **Step 3: Populate state for mapped readiness evidence**

For mapped helper registration blockers, attach the available preflight evidence
state by evidence key. Keep service-management behavior unchanged unless a later
phase adds equivalent probe evidence details.

- [x] **Step 4: Wire scripts and bundle**

Pass `buildHelperPreflightAudit()` output into readiness report construction in
both the standalone readiness script and readiness bundle.

### Task 3: Verify And Document

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b33-helper-readiness-evidence-state.md`

- [x] **Step 1: Run focused and related tests**

```bash
pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts
pnpm audit:helper-readiness
pnpm audit:helper-readiness-bundle
```

Expected:

- Tests pass.
- Audits remain intentionally blocked.
- Readiness evidence shows artifact/confirmation/effective state where
  preflight evidence is available.

Result:

- `pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundle.test.ts`
  passed, 3 files and 13 tests.
- `pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts`
  passed, 4 files and 16 tests.
- `pnpm audit:helper-readiness` remained intentionally blocked and showed
  artifact-backed blockers such as `xpc-enumerate-bridge` with
  `artifactReady: true`, `confirmationReady: false`, and
  `effectiveReady: false`.
- `pnpm audit:helper-readiness-bundle` remained intentionally blocked and
  propagated the same readiness evidence state.

- [x] **Step 2: Run full verification**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
```

Expected:

- All pass. Existing Rust dead-code warnings may remain.

Result:

- `pnpm test` passed, 52 files and 253 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.

### Task 4: Review And Commit

- [x] **Step 1: Request sub-agent review**

Ask the reviewer to check that this phase only improves diagnostics, does not
weaken readiness gates, and does not enable helper defaults.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit.

- [x] **Step 3: Commit**

```bash
git add src/main/services/helper/helperReadinessAudit.ts src/main/services/helper/helperReadinessBundle.ts scripts/audit-helper-readiness.ts test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b33-helper-readiness-evidence-state.md
git commit -m "feat: explain helper readiness evidence state"
```

Result:

- Sub-agent `019ea2d3-1d6c-7493-ab61-c05eb15e73ce` reviewed B33.
- Critical: none.
- Important: none.
- Minor: none.
- Reviewer confirmed this phase only improves diagnostics, preserves readiness
  and blocker semantics, keeps default helper enablement false, and maps
  readiness evidence state to the matching preflight fields.
- Reviewer did not run tests; verification was performed locally in Task 3.
- Committed as `95cbf9d feat: explain helper readiness evidence state`.

## Rollback

Revert only B33 readiness evidence state diagnostics, tests, and documentation.
Do not revert earlier helper readiness gates or scan planning work.
