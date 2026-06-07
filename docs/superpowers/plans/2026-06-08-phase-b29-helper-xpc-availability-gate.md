# Phase B29 Helper XPC Availability Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the macOS XPC helper transport to report `available: true` only
after real readiness inputs and a successful helper control health check are
present.

**Architecture:** Keep the default helper disabled and keep `getStatus()`
conservative. `healthCheck()` is the only method that may upgrade the transport
to available because it proves the XPC control path responded. The upgrade is
allowed only when registration preflight is ready, ServiceManagement is
registered, helper install evidence passes, caller identity/FDA checks are not
failing, and the XPC channel check is pass.

**Tech Stack:** Electron main process TypeScript, Vitest, existing helper
transport/lifecycle services.

**Non-goals:**

- Do not enable helper-backed scans by default.
- Do not make current repo readiness pass.
- Do not bypass registration preflight, FDA, ServiceManagement, or identity
  blockers.
- Do not fabricate production Team ID, designated requirement, FDA, signing, or
  registration evidence.
- Do not change helper enumerate event mapping.

---

### Task 1: Add RED Availability Gate Tests

**Files:**

- Modify: `test/main/helperClient.test.ts`

- [x] **Step 1: Assert successful health check can make XPC transport available**

Add a test near the existing helper control health/version coverage:

```ts
it("reports xpc transport available only after ready preflight and health check pass", async () => {
  const transport = new MacOsXpcHelperTransport(
    {
      getStatus: async () => ({
        state: "registered",
        reason: "registered",
      }),
    },
    {
      identity: {
        teamId: "ABCDE12345",
        designatedRequirement:
          'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
      },
      packagingEntitlementsReady: true,
      privilegedHelperExecutableReady: true,
      helperXpcEnumerateBridgeReady: true,
      privilegedHelperListenerRequirementReady: true,
      fdaValidationMatrixReady: true,
    },
    {
      control: {
        healthCheck: async () => ({
          helperVersion: "test-control-helper",
        }),
        getVersion: async () => "test-control-helper",
      },
    },
  );

  await expect(transport.healthCheck()).resolves.toMatchObject({
    available: true,
    lifecycle: {
      state: "ready",
      checks: {
        "service-management": "pass",
        "helper-install": "pass",
        "caller-identity": "pass",
        "full-disk-access": "pass",
        "xpc-channel": "pass",
      },
    },
    transport: "xpc",
  });
});
```

- [x] **Step 2: Assert getStatus remains conservative**

Add a paired test proving status is not available until a control health check
runs:

```ts
it("keeps xpc getStatus unavailable before control health evidence", async () => {
  const transport = new MacOsXpcHelperTransport(
    {
      getStatus: async () => ({
        state: "registered",
        reason: "registered",
      }),
    },
    {
      identity: {
        teamId: "ABCDE12345",
        designatedRequirement:
          'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
      },
      packagingEntitlementsReady: true,
      privilegedHelperExecutableReady: true,
      helperXpcEnumerateBridgeReady: true,
      privilegedHelperListenerRequirementReady: true,
      fdaValidationMatrixReady: true,
    },
  );

  await expect(transport.getStatus()).resolves.toMatchObject({
    available: false,
    lifecycle: {
      state: "not-implemented",
      checks: {
        "service-management": "pass",
        "helper-install": "pass",
        "caller-identity": "pass",
        "full-disk-access": "pass",
        "xpc-channel": "fail",
      },
    },
    transport: "xpc",
  });
});
```

Run:

```bash
pnpm test test/main/helperClient.test.ts
```

Expected RED: the first new test fails because `healthCheck()` still returns
`available: false` and lifecycle state `not-implemented` after XPC channel pass.

Result:

- RED confirmed: `pnpm test test/main/helperClient.test.ts` failed because
  `healthCheck()` still returned `available: false`, lifecycle state
  `not-implemented`, and caller identity/FDA checks `unknown` after XPC channel
  pass.
- GREEN after implementation: `pnpm test test/main/helperClient.test.ts`
  passed, 1 file and 36 tests.

### Task 2: Implement Availability Resolution

**Files:**

- Modify: `src/main/services/helper/helperLifecycle.ts`
- Modify: `src/main/services/helper/macosXpcHelperTransport.ts`

- [x] **Step 1: Mark ready preflight checks as pass**

Update `createMacOsXpcLifecycle()` so a ready registration preflight records
caller identity and FDA checks as pass:

```ts
const preflightReady = input.registrationPreflight?.status === "ready";
```

Then set:

```ts
"caller-identity": preflightBlocked
  ? resolveCallerIdentityCheck(preflightBlockers)
  : preflightReady ? "pass" : "unknown",
"full-disk-access": preflightBlocked
  ? resolveFullDiskAccessCheck(preflightBlockers)
  : preflightReady ? "pass" : "unknown",
```

- [x] **Step 2: Add helper availability predicate**

Add a small local helper in `macosXpcHelperTransport.ts`:

```ts
function isXpcHelperAvailable(status: HelperClientStatus): boolean {
  return status.registrationPreflight?.status === "ready"
    && status.lifecycle?.state === "ready"
    && status.lifecycle.checks["service-management"] === "pass"
    && status.lifecycle.checks["helper-install"] === "pass"
    && status.lifecycle.checks["caller-identity"] === "pass"
    && status.lifecycle.checks["full-disk-access"] === "pass"
    && status.lifecycle.checks["xpc-channel"] === "pass";
}
```

- [x] **Step 3: Upgrade healthCheck result only after channel pass**

When the control health check succeeds and `canAcceptXpcChannelEvidence(status)`
is true, return a status whose lifecycle is ready and whose availability is
derived from `isXpcHelperAvailable()`:

```ts
const lifecycle = {
  ...status.lifecycle,
  state: "ready" as const,
  reason: "xpc-channel-ready",
  checks: {
    ...status.lifecycle.checks,
    "xpc-channel": "pass" as const,
  },
};
const readyStatus = {
  ...status,
  lifecycle,
  reason: lifecycle.reason,
};
return {
  ...readyStatus,
  available: isXpcHelperAvailable(readyStatus),
};
```

Keep all existing failure paths returning unavailable.

### Task 3: Document And Verify

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b29-helper-xpc-availability-gate.md`

- [x] **Step 1: Document facts and limits**

Add a Phase B29 section stating:

- XPC helper availability can become true only after control health evidence.
- `getStatus()` remains conservative before a health check.
- Current repo readiness remains blocked.
- Helper-backed scans are still not enabled by default.

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
  passed: 2 files, 44 tests.
- `pnpm test` passed: 52 files, 245 tests.
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

Ask the reviewer to inspect only Phase B29 for:

- helper default activation regressions.
- false-positive `available: true` without XPC control health evidence.
- bypassing identity, FDA, registration preflight, or ServiceManagement gates.
- helper scan planner selecting helper in the current blocked repo.

- [x] **Step 2: Address Critical and Important findings**

Fix valid Critical and Important findings before commit. Address Minor findings
when they reduce ambiguity without widening scope.

Result:

- Sub-agent review reported no Critical, Important, or Minor findings.
- Review approved the change because `getStatus()` remains unavailable,
  `healthCheck()` requires control health plus all readiness checks, default
  transport remains disabled without `SCAN_HELPER_TRANSPORT=xpc`, and the scan
  planner still falls back when registration preflight is blocked.

- [x] **Step 3: Commit**

```bash
git add src/main/services/helper/helperLifecycle.ts src/main/services/helper/macosXpcHelperTransport.ts test/main/helperClient.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b29-helper-xpc-availability-gate.md
git commit -m "feat: gate xpc helper availability"
```

## Rollback

Revert only the XPC helper availability predicate, health check readiness state
upgrade, tests, and B29 documentation. Do not change helper readiness audit
semantics or default helper transport selection.
