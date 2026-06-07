# Phase B30 Readiness-Gated Default Helper Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the default helper transport move from disabled to XPC only when
static registration preflight evidence is ready, without requiring
`SCAN_HELPER_TRANSPORT=xpc`.

**Architecture:** Keep explicit `SCAN_HELPER_TRANSPORT=xpc` as an override for
prototype/manual work. Add a readiness-gated default path for macOS that creates
`MacOsXpcHelperTransport` only when registration preflight resolves ready from
the configured project root. The transport may still report unavailable until
ServiceManagement and control health evidence pass.

**Tech Stack:** Electron main process TypeScript, existing helper registration
preflight, Vitest.

**Non-goals:**

- Do not make current repo helper readiness pass.
- Do not enable helper-backed scans while registration preflight is blocked.
- Do not bypass ServiceManagement or XPC health availability checks.
- Do not fabricate production identity, FDA, signing, packaging, or
  notarization evidence.
- Do not change helper scan planner selection rules.

---

### Task 1: Add RED Default Transport Tests

**Files:**

- Modify: `test/main/helperClient.test.ts`

- [x] **Step 1: Assert blocked repo remains disabled by default**

Keep or add a default transport assertion proving an empty env still returns the
disabled transport:

```ts
const transport = createDefaultHelperTransport({}, "darwin");
await expect(transport.getStatus()).resolves.toMatchObject({
  available: false,
  reason: HELPER_DISABLED_REASON,
  transport: "disabled",
});
```

- [x] **Step 2: Assert ready static evidence selects XPC without env override**

Create a temp project root with:

- `electron-builder.json` containing hardened runtime, entitlements, helper
  extraFiles, and XPC enumerate extraResources.
- entitlement plist files.
- executable Mach-O-looking helper and XPC enumerate bridge files.
- listener requirement metadata for `ABCDE12345`.
- a complete FDA validation matrix.

Then assert:

```ts
const transport = createDefaultHelperTransport(
  {
    SCAN_HELPER_TEAM_ID: "ABCDE12345",
    SCAN_HELPER_DESIGNATED_REQUIREMENT: requirement,
    SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY: "true",
    SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY: "true",
    SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY: "true",
    SCAN_HELPER_FDA_VALIDATION_MATRIX_READY: "true",
  },
  "darwin",
  null,
  projectRoot,
);

await expect(transport.getStatus()).resolves.toMatchObject({
  transport: "xpc",
  registrationPreflight: {
    status: "ready",
  },
});
```

Run:

```bash
pnpm test test/main/helperClient.test.ts
```

Expected RED: the new test fails because `createDefaultHelperTransport()` does
not accept `projectRoot` and returns disabled unless `SCAN_HELPER_TRANSPORT=xpc`
is present.

Result:

- RED confirmed: `pnpm test test/main/helperClient.test.ts` failed because
  ready static evidence without `SCAN_HELPER_TRANSPORT=xpc` still returned the
  disabled transport.
- GREEN after implementation: `pnpm test test/main/helperClient.test.ts`
  passed, 1 file and 37 tests.

### Task 2: Implement Readiness-Gated Selection

**Files:**

- Modify: `src/main/services/helper/helperClient.ts`

- [x] **Step 1: Resolve registration preflight before transport selection**

Inside `createDefaultHelperTransport()`, resolve preflight input with a new
optional `projectRoot` argument:

```ts
const registrationPreflightInput =
  resolveHelperRegistrationPreflightInputFromEnv(env, projectRoot);
const registrationPreflight =
  resolveHelperRegistrationPreflight(registrationPreflightInput);
```

- [x] **Step 2: Preserve explicit xpc override**

Keep explicit `SCAN_HELPER_TRANSPORT=xpc` behavior unchanged.

- [x] **Step 3: Add readiness-gated default XPC path**

Allow XPC transport creation when:

```ts
const explicitXpcTransport = env[HELPER_TRANSPORT_ENV] === "xpc";
const readinessGatedXpcTransport =
  platform === "darwin" && registrationPreflight.status === "ready";
```

Return disabled only when neither condition is true:

```ts
if (!explicitXpcTransport && !readinessGatedXpcTransport) {
  return new DisabledHelperTransport(HELPER_DISABLED_REASON);
}
```

Pass the already-resolved `registrationPreflightInput` into
`MacOsXpcHelperTransport`.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b30-readiness-gated-default-helper-transport.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B30 section stating:

- Default transport can choose XPC only when static registration preflight is
  ready.
- Current repo remains disabled/blocked by default.
- ServiceManagement and control health still determine actual availability.
- Helper-backed scans remain gated by planner and readiness.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/main/helperClient.test.ts test/main/helperScanPlanner.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm build
cargo test --manifest-path native/scanner/Cargo.toml
pnpm audit:helper-readiness-bundle
pnpm audit:helper-readiness
```

Expected:

- tests, typecheck, lint, build, and Rust tests pass.
- readiness bundle and helper readiness remain intentionally blocked in the
  current repo.

Result:

- `pnpm test test/main/helperClient.test.ts test/main/helperScanPlanner.test.ts`
  passed: 2 files, 45 tests.
- `pnpm test` passed: 52 files, 246 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed with the
  existing Rust dead-code warnings.
- `pnpm audit:helper-readiness-bundle` printed blocked bundle readiness and
  exited 1 as intended.
- `pnpm audit:helper-readiness` printed blocked readiness and exited 1 as
  intended.

### Task 4: Review And Commit

**Files:**

- All files changed by Tasks 1-3.

- [x] **Step 1: Request sub-agent code review**

Ask the reviewer to inspect only Phase B30 for:

- default helper activation regressions in the current blocked repo.
- XPC transport selection without ready registration preflight.
- bypassing ServiceManagement/control health availability checks.
- projectRoot evidence accidentally ignored or hard-coded to cwd in tests.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Result:

- Sub-agent review reported no Critical, Important, or Minor findings.
- Review approved the change because blocked repo defaults remain disabled,
  explicit `SCAN_HELPER_TRANSPORT=xpc` still works, `projectRoot` is used for
  evidence resolution, and ServiceManagement/control health availability gates
  are not bypassed.

- [x] **Step 3: Commit**

```bash
git add src/main/services/helper/helperClient.ts test/main/helperClient.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b30-readiness-gated-default-helper-transport.md
git commit -m "feat: gate default helper transport by readiness"
```

## Rollback

Revert only the readiness-gated default transport selection, tests, and B30
documentation. Do not revert explicit `SCAN_HELPER_TRANSPORT=xpc` support or
B29 availability gating.
