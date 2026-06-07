# Phase B60 Privileged Helper Production App ID Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the privileged helper build honor production app bundle identity
evidence so listener requirement metadata can match production preflight input.

**Architecture:** Keep helper label and Mach service name unchanged. Use
`SCAN_HELPER_APP_BUNDLE_ID` only for the expected client signing requirement
embedded in generated Swift source and written to requirement metadata.

**Tech Stack:** Bun build script, Swift source generation, Vitest.

---

### Task 1: Add RED Build Coverage

**Files:**

- Modify: `test/main/macosPrivilegedHelperCli.test.ts`

- [x] **Step 1: Assert build script reads app bundle id evidence**

Add source-level assertions that `scripts/build-macos-privileged-helper.ts`
references `SCAN_HELPER_APP_BUNDLE_ID` and passes an effective app bundle id
into `buildHelperCodeSigningRequirement`.

- [x] **Step 2: Assert generated metadata uses production app bundle id**

Extend the explicit project-root fake `swiftc` build test to set:

```ts
SCAN_HELPER_TEAM_ID: "ABCDE12345"
SCAN_HELPER_APP_BUNDLE_ID: "com.acme.diskvisualizer"
```

Then assert the generated `.requirement.json` contains:

```json
{
  "ready": true,
  "teamId": "ABCDE12345",
  "appBundleIdentifier": "com.acme.diskvisualizer",
  "requirement": "identifier \"com.acme.diskvisualizer\" and anchor apple generic and certificate leaf[subject.OU] = \"ABCDE12345\""
}
```

- [x] **Step 3: Assert generated Swift source uses production app bundle id**

Read `.tmp/swift-generated/privileged-helper/main.swift` from the artifact root
and assert it contains:

```swift
let expectedClientBundleIdentifier = "com.acme.diskvisualizer"
```

- [x] **Step 4: Run focused tests to verify RED**

Run:

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts
```

Expected: FAIL because the build script currently ignores
`SCAN_HELPER_APP_BUNDLE_ID`.

Observed RED:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` failed before the
  implementation because the build script still wrote the development bundle id
  into listener requirement metadata and generated source.

### Task 2: Implement App Bundle ID-Aware Helper Build

**Files:**

- Modify: `native/macos-helper/privileged-helper/main.swift`
- Modify: `scripts/build-macos-privileged-helper.ts`

- [x] **Step 1: Add Swift bundle id placeholder**

Add:

```swift
let expectedClientBundleIdentifier = "APP_BUNDLE_ID_NOT_CONFIGURED"
```

and build `allowedClientRequirement` from that variable instead of the literal
development bundle id.

- [x] **Step 2: Resolve effective app bundle id in build script**

Read `SCAN_HELPER_APP_BUNDLE_ID`; use it only when it is non-empty and not the
development `com.example` identifier. Otherwise keep the development id as the
placeholder fallback.

- [x] **Step 3: Generate matching Swift source and metadata**

Replace both `TEAMID_NOT_CONFIGURED` and `APP_BUNDLE_ID_NOT_CONFIGURED` in the
generated Swift source. Write `appBundleIdentifier` to requirement metadata.
Call `buildHelperCodeSigningRequirement(teamId, effectiveAppBundleId)`.

- [x] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperRegistration.test.ts
pnpm typecheck
```

Expected: PASS.

Observed GREEN:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts
  test/main/helperRegistration.test.ts` passed, 2 files and 36 tests.
- `pnpm typecheck` passed.
- `pnpm build:native:privileged-helper` passed after changing the generated
  Swift source path to `.tmp/swift-generated/privileged-helper/main.swift`.
  This matters because Swift top-level executable statements are valid in
  `main.swift` when compiling multiple source files.
- Metadata readiness now requires both a valid Team ID and a production app
  bundle id. A Team ID without `SCAN_HELPER_APP_BUNDLE_ID` writes metadata with
  `ready: false`.

### Task 3: Document, Review, Verify, Commit

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b60-privileged-helper-production-app-id-build.md`

- [x] **Step 1: Document status**

Document that production app bundle id evidence can now be embedded into helper
listener requirement metadata. This does not choose the actual production Team
ID or register the helper.

- [x] **Step 2: Run sub-agent code review**

Ask the review sub-agent to check:

- production app id is used only for client requirement;
- helper label/Mach service stays stable;
- invalid or missing app id does not create false readiness;
- metadata and generated Swift source stay consistent.

Review result:

- Critical: none.
- Important: ensure the new generated Swift source
  `.tmp/swift-generated/privileged-helper/main.swift` is included in the commit
  together with deletion of the old tracked
  `.tmp/swift-generated/privileged-helper-main.swift`.
- Minor: none.

- [x] **Step 3: Run verification**

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
- Readiness audit remains blocked until real production inputs are provided.

Observed:

- `pnpm test` passed, 55 files and 325 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `pnpm build:native:privileged-helper` passed.
- `pnpm audit:helper-preflight --project-root .
  --confirm-packaging-entitlements --confirm-privileged-helper-executable
  --confirm-helper-xpc-enumerate-bridge --confirm-fda-validation-matrix`
  reported `status: "blocked"` with install blockers for missing Team ID,
  production bundle identifier, designated requirement, and listener
  requirement.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  exited 1 with `status: "blocked"` and `canEnableHelperByDefault: false`.

- [ ] **Step 4: Commit**

Run:

```bash
git add native/macos-helper/privileged-helper/main.swift scripts/build-macos-privileged-helper.ts test/main/macosPrivilegedHelperCli.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b60-privileged-helper-production-app-id-build.md
git diff --cached --check
git commit -m "feat: build helper listener requirement for production app id"
```
