# Phase B61 Helper Build CLI Identity Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `scripts/build-macos-privileged-helper.ts` accept explicit
production identity options so the same Team ID and app bundle id can be passed
through build, preflight, and ServiceManagement control commands.

**Architecture:** Keep environment variable support as the default automation
path. Add `--team-id` and `--app-bundle-id` as explicit CLI overrides for the
build script only, matching the argument style already used by preflight and
ServiceManagement control scripts. Do not change helper label, Mach service
name, ServiceManagement registration, or helper default activation.

**Tech Stack:** Bun build script, Swift source generation, Vitest.

---

### Task 1: Add RED CLI Coverage

**Files:**

- Modify: `test/main/macosPrivilegedHelperCli.test.ts`

- [ ] **Step 1: Add explicit CLI identity test**

Add a test next to `builds privileged helper artifacts under an explicit
project root` that invokes:

```ts
const result = spawnSync(
  "bun",
  [
    "run",
    buildScriptPath,
    "--project-root",
    artifactRoot,
    "--team-id",
    "ABCDE12345",
    "--app-bundle-id",
    "com.acme.diskvisualizer",
  ],
  {
    cwd: cwdRoot,
    env: {
      ...process.env,
      FAKE_SWIFTC_ARGS_LOG: argsLogPath,
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
      SCAN_HELPER_TEAM_ID: "ZZZZZ99999",
      SCAN_HELPER_APP_BUNDLE_ID: "com.other.diskvisualizer",
    },
    encoding: "utf8",
  },
);
```

Assert:

```ts
expect(result.status).toBe(0);
expect(fs.readFileSync(artifactGeneratedSourcePath, "utf8")).toContain(
  'let expectedClientTeamId = "ABCDE12345"',
);
expect(fs.readFileSync(artifactGeneratedSourcePath, "utf8")).toContain(
  'let expectedClientBundleIdentifier = "com.acme.diskvisualizer"',
);
expect(
  JSON.parse(fs.readFileSync(`${artifactOutputPath}.requirement.json`, "utf8")),
).toEqual({
  appBundleIdentifier: "com.acme.diskvisualizer",
  ready: true,
  requirement:
    'identifier "com.acme.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
  teamId: "ABCDE12345",
});
```

This proves CLI options override environment values for reproducible manual
production builds.

- [ ] **Step 2: Add missing value tests**

Add tests that run:

```ts
["run", buildScriptPath, "--team-id", "--project-root", process.cwd()]
["run", buildScriptPath, "--app-bundle-id", "--project-root", process.cwd()]
```

Expected stderr:

```text
missing value for --team-id
missing value for --app-bundle-id
```

- [ ] **Step 3: Verify RED**

Run:

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts
```

Expected: FAIL because the build script currently ignores `--team-id` and
`--app-bundle-id`.

### Task 2: Implement CLI Identity Overrides

**Files:**

- Modify: `scripts/build-macos-privileged-helper.ts`

- [ ] **Step 1: Resolve CLI options**

Add:

```ts
const cliTeamId = resolveOptionalArg(rawArgs, "--team-id");
const cliAppBundleIdentifier = resolveOptionalArg(rawArgs, "--app-bundle-id");
const teamId = cliTeamId ?? process.env[HELPER_TEAM_ID_ENV]?.trim();
const appBundleIdentifier = cliAppBundleIdentifier
  ?? process.env[HELPER_APP_BUNDLE_ID_ENV]?.trim();
```

Use the existing `resolveOptionalArg` helper so missing values throw the same
clear error style used by `--project-root`.

- [ ] **Step 2: Keep existing safety semantics**

Do not relax validation:

```ts
const hasProductionAppBundleId =
  isProductionAppBundleIdentifier(appBundleIdentifier);
const effectiveTeamId = isValidAppleTeamIdText(teamId)
  ? teamId
  : "TEAMID_NOT_CONFIGURED";
const effectiveAppBundleId = hasProductionAppBundleId
  ? appBundleIdentifier
  : DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER;
```

Metadata `ready` must remain:

```ts
ready: isValidAppleTeamIdText(teamId) && hasProductionAppBundleId
```

- [ ] **Step 3: Verify GREEN**

Run:

```bash
pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperRegistration.test.ts
pnpm typecheck
```

Expected: PASS.

### Task 3: Document, Review, Verify, Commit

**Files:**

- Modify: `docs/project-status-audit.md`
- Modify:
  `docs/superpowers/plans/2026-06-08-phase-b61-helper-build-cli-identity-options.md`

- [ ] **Step 1: Document status**

Document that helper build identity can now be passed either by environment or
explicit CLI options. State that this does not supply the real production Team
ID, register the helper, grant FDA, or fix the observed 3 GB scan symptom.

- [ ] **Step 2: Run sub-agent code review**

Ask the review sub-agent to check:

- CLI options override env only for build identity inputs;
- missing value handling is consistent with existing scripts;
- metadata `ready` still requires valid Team ID and production app bundle id;
- helper label/Mach service and default activation remain unchanged.

- [ ] **Step 3: Run verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm build:native:privileged-helper
pnpm audit:helper-readiness --platform darwin --resources-path resources
```

Expected:

- Tests/typecheck/lint/build pass.
- Readiness audit remains blocked until real production inputs and runtime
  evidence are provided.

- [ ] **Step 4: Commit**

Run:

```bash
git add scripts/build-macos-privileged-helper.ts test/main/macosPrivilegedHelperCli.test.ts docs/project-status-audit.md docs/superpowers/plans/2026-06-08-phase-b61-helper-build-cli-identity-options.md
git diff --cached --check
git commit -m "feat: add helper build identity cli options"
```
