# Phase B56 Helper Control Peer Validation Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require explicit XPC control health peer-validation evidence before
the macOS helper transport can become available.

**Architecture:** Keep static preflight and ServiceManagement gates unchanged.
The privileged helper `health.check` response reports that the request reached a
listener guarded by the configured code-signing requirement. The control bridge
preserves this evidence in the helper ready event, and the TypeScript XPC
transport refuses to mark `caller-identity` as pass when the evidence is absent.

**Tech Stack:** Swift Foundation XPC helper/control binaries, Electron main
process TypeScript, Zod shared helper protocol schema, Vitest source/contract
tests.

**Non-goals:**

- Do not enable helper-backed scans by default.
- Do not make current helper readiness pass.
- Do not fabricate production identity, Team ID, FDA, or ServiceManagement
  evidence.
- Do not replace Apple code-signing checks with app-level string checks.

---

### Task 1: Add RED Peer Evidence Tests

**Files:**

- Modify: `test/main/helperClient.test.ts`
- Modify: `test/main/macosPrivilegedHelperCli.test.ts`

- [x] **Step 1: Require peer validation from successful health control events**

Update the `runs helper health and version control requests through a dedicated
control command` test so the health `ready` event includes:

```ts
peerValidation: "listener-code-signing-requirement",
```

Then assert:

```ts
await expect(control.healthCheck(...)).resolves.toMatchObject({
  helperVersion: "test-control-helper",
  peerValidation: "listener-code-signing-requirement",
});
```

- [x] **Step 2: Keep XPC transport unavailable when health peer evidence is missing**

Add a test near the XPC availability tests:

```ts
it("keeps xpc transport unavailable when control health lacks peer validation evidence", async () => {
  const transport = new MacOsXpcHelperTransport(
    {
      getStatus: async () => ({
        state: "registered",
        reason: "registered",
      }),
    },
    {
      identity: {
        appBundleIdentifier: TEST_APP_BUNDLE_IDENTIFIER,
        teamId: TEST_TEAM_ID,
        designatedRequirement: TEST_DESIGNATED_REQUIREMENT,
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
    available: false,
    lifecycle: {
      state: "not-implemented",
      checks: {
        "caller-identity": "fail",
        "xpc-channel": "pass",
      },
    },
    reason: "helper-control-peer-validation-missing",
  });
});
```

- [x] **Step 3: Assert Swift helper/control source carries peer evidence**

Extend the privileged helper/control source tests to require:

```ts
expect(source).toContain("peerValidation");
expect(source).toContain("listener-code-signing-requirement");
```

- [x] **Step 4: Run focused tests to verify RED**

Run:

```bash
pnpm test test/main/helperClient.test.ts test/main/macosPrivilegedHelperCli.test.ts
```

Expected: FAIL because the ready event schema/result and Swift source do not
preserve peer validation evidence yet.

Result: RED confirmed. The focused test run failed because control results did
not preserve `peerValidation`, missing peer evidence still allowed
`available: true`, and Swift helper/control source did not contain the peer
validation fields.

### Task 2: Implement Peer Evidence Propagation

**Files:**

- Modify: `src/shared/schemas/helperProtocol.ts`
- Modify: `src/main/services/helper/macosHelperControlCommand.ts`
- Modify: `src/main/services/helper/macosXpcHelperTransport.ts`
- Modify: `native/macos-helper/privileged-helper/main.swift`
- Modify: `native/macos-helper/control/main.swift`

- [x] **Step 1: Extend helper ready events**

Add optional:

```ts
peerValidation: z.literal("listener-code-signing-requirement").optional(),
```

to `HelperReadyEventSchema`.

- [x] **Step 2: Preserve peer evidence in the control command**

Add:

```ts
peerValidation?: "listener-code-signing-requirement";
```

to `MacOsHelperControlResult`, capture it from `ready` events, and return it
from `runControlRequest()`.

- [x] **Step 3: Require health evidence before availability upgrade**

In `MacOsXpcHelperTransport.healthCheck()`, store the health result. If
`peerValidation` is missing, return an unavailable status with:

```ts
reason: "helper-control-peer-validation-missing"
checks["caller-identity"]: "fail"
checks["xpc-channel"]: "pass"
```

Only set `available: true` when peer evidence is present and the existing gates
also pass.

- [x] **Step 4: Emit peer evidence from Swift health check**

Change privileged helper `healthCheck` to return a bounded JSON string:

```json
{"helperVersion":"dev-privileged-helper-0.1.0","peerValidation":"listener-code-signing-requirement"}
```

Update the control bridge to parse this JSON for `health.check` and include
`peerValidation` in the emitted ready event.

- [x] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
pnpm test test/main/helperClient.test.ts test/main/macosPrivilegedHelperCli.test.ts
```

Expected: PASS.

Result: GREEN confirmed. `pnpm test test/main/helperClient.test.ts
test/main/macosPrivilegedHelperCli.test.ts` passed with 2 files and 59 tests.
`pnpm typecheck` also passed after the implementation.

### Task 3: Document, Review, Verify, Commit

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b56-helper-control-peer-validation-evidence.md`

- [x] **Step 1: Document status**

Record that control health now requires runtime peer-validation evidence before
helper availability, while readiness remains blocked without production
identity/FDA/ServiceManagement evidence.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm audit:helper-readiness --platform darwin --resources-path resources
```

Expected:

- Tests/typecheck/lint/build pass.
- Readiness audit exits 1 with `status: "blocked"` and
  `canEnableHelperByDefault: false`.

Result before review follow-up:

- `pnpm test`: passed, 55 files and 318 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`:
  exited 1 as intended with `status: "blocked"` and
  `canEnableHelperByDefault: false`.

- [x] **Step 3: Run sub-agent code review**

Ask the review sub-agent to check:

- missing peer evidence still allowing `available: true`
- helper readiness false positives
- helper protocol schema compatibility
- Swift control parsing mistakes

Review result:

- Critical: none.
- Important: none.
- Minor: Swift `health.check` JSON decode failure could surface as
  `E_INVALID_REQUEST` instead of the intended invalid health response path.
  Fixed by wrapping `JSONDecoder().decode(HealthCheckResponse.self, from:)` and
  throwing `XpcProbeError.invalidHealthResponse`.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/shared/schemas/helperProtocol.ts src/main/services/helper/macosHelperControlCommand.ts src/main/services/helper/macosXpcHelperTransport.ts native/macos-helper/privileged-helper/main.swift native/macos-helper/control/main.swift test/main/helperClient.test.ts test/main/macosPrivilegedHelperCli.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b56-helper-control-peer-validation-evidence.md
git diff --cached --check
git commit -m "feat: require helper peer validation evidence"
```
