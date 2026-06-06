# CleanMyMac-Style Scanning Design

Date: 2026-06-06

## Goal

Move the scanner toward CleanMyMac-style coverage in two phases:

1. Phase C: make exact scans trustworthy without a privileged helper.
2. Phase B: add a privileged helper only after exact scan semantics, coverage
   reporting, and permission UX are correct.

This document does not claim parity with CleanMyMac. CleanMyMac has an installed
and running privileged helper at
`/Library/PrivilegedHelperTools/com.macpaw.CleanMyMac5.Agent`; this project does
not currently have that architecture.

## Current Evidence

Recent `/Users/user` native scan logs showed:

- `blockedByPolicy`: 922
- `blockedByPermission`: 133
- `skippedByScope`: 0
- `queueDepth`: 1905 at the 9 second deep budget
- `estimated`: true

Policy skip samples were mainly development and cache paths:

- `node_modules`
- `.nvm`, `.npm`, `.pyenv`, `.cargo`, `.rustup`, `.android`, `.cache`
- `.pnpm-store`, `.gradle`
- `~/Library/Caches`
- app bundles such as `~/Applications/Claude Code URL Handler.app`

Permission blocks were mainly macOS privacy-protected paths:

- `~/.Trash`
- `~/Pictures/Photos Library.photoslibrary`
- `~/Library/Messages`
- `~/Library/Mail`
- `~/Library/Safari`
- `~/Library/Containers`
- `~/Library/Group Containers`
- `~/Library/Application Support` protected subtrees

The current problem is not one bug. It is a mix of preview policy, macOS TCC
permissions, and bounded scan time.

## Non-Goals

- Do not use private CleanMyMac internals.
- Do not run third-party privileged helpers.
- Do not claim full disk parity until measured with logs and benchmarks.
- Do not make preview scans exact by default.
- Do not hide policy skips behind a generic "estimated" label.
- Do not implement a privileged helper until the signing, install, update, and
  uninstall model is specified and tested.

## Phase C: Exact Scan Foundation

Phase C keeps the scanner inside the current app/native-process model. Its goal
is to make scan semantics honest and predictable before adding root privileges.

### Scan Modes

The app must expose two separate scan contracts:

- Preview scan:
  - fast first result
  - responsive deep policy
  - time budget allowed
  - policy skips allowed
  - `estimated=true` is expected
- Exact scan:
  - accuracy-first result
  - exact deep policy
  - no responsive soft skips
  - no package/cache/bundle skip policy
  - no deep time budget by default
  - `estimated=true` only when cancelled, permission-blocked, scope-blocked, or
    explicitly budgeted

The implementation must prevent ambiguous combinations such as
`accuracyMode=full` with `deepPolicyPreset=responsive`.

Exact mode is not the same thing as "everything is readable." It means the app
does not intentionally omit responsive policy paths. OS permissions, hard
blocked roots, user cancellation, and explicit budgets can still prevent full
coverage and must be reported as separate causes.

### Policy Rules

Preview policy can keep skipping expensive paths such as `node_modules`,
toolchain caches, browser caches, app bundles, and package stores.

Exact policy must traverse those paths unless one of these hard reasons applies:

- OS permission failure
- explicit protected root block
- scope restriction requested by the scan plan
- user cancellation
- explicit exact budget selected by the user

Exact mode must not use `softSkipPrefixes`, `softSkipPathRules`,
`skipDirSuffixes`, or package-manager basename skips.

### Coverage Model

Coverage must be reported as separate causes:

- `blockedByPolicy`: app policy blocked or preview soft-skipped paths
- `blockedByPermission`: macOS permission or filesystem permission failures
- `skippedByScope`: same-device or volume-plan exclusions
- `deferredByBudget`: time-budget deferrals
- `queueDepth`: remaining directories when the stage ends
- `policySkipSamples`: sample paths for policy-caused skips
- `permissionSamples`: sample paths for permission blocks

The UI and logs must show these causes separately. A large `blockedByPolicy`
count in exact mode is a bug unless every counted path is explained by a hard
blocked root or another non-responsive policy category.

### Permission UX

The app must treat macOS permission as a state transition:

```text
required
  -> settings opened
  -> readable probe
  -> access plan refreshed
  -> affected roots rescanned
```

The scanner must not keep stale `permissionPrefixes` after permission changes.
When permission is granted, the main process should refresh access and rescan
only the affected roots instead of restarting unrelated work.

### Volume Planning

The scan plan must distinguish:

- user home scan: `/Users/user`
- filesystem root scan: `/`
- data volume scan: `/System/Volumes/Data`
- external volume scan: `/Volumes/<name>`

For filesystem root scans, the native stage should not use same-device scoping.
For normal directory scans, same-device scoping remains the default unless the
user requests volume crossing.

### Acceptance Criteria

Phase C is done when:

- Preview scan still returns quickly and can be estimated.
- Exact scan over a synthetic fixture traverses cache, package, bundle, and VCS
  directories.
- Exact scan over `/Users/user` has no responsive policy skips.
- Exact scan logs permission-blocked paths separately from policy skips.
- Exact scan reports `estimated=true` only for a concrete cause.
- Permission approval can be followed by an access refresh and targeted rescan.
- The scanner log is sufficient to explain every nonzero skip counter.

## Phase B: Privileged Helper

Phase B adds a privileged helper only after Phase C has made scan semantics
stable. The helper is for filesystem access, not policy ownership.

### Helper Responsibility

The helper should do only low-level privileged work:

- enumerate directories
- read metadata
- report permission and IO failures
- stream records back to the main app

The helper must not own UI state, scan policy, aggregation policy, or user
preferences.

### Main App Responsibility

The main app remains authoritative for:

- scan intent
- path policy
- volume plan
- permission UX
- aggregation
- progress and coverage events
- audit logging

### IPC Boundary

The helper boundary should be explicit and narrow:

```text
Main App
  -> signed request: scan stage, root, volume policy, policy plan id
Privileged Helper
  -> stream: entries, metadata, permission failures, IO failures, terminal status
Main App
  -> aggregation, coverage, UI events, logs
```

The helper should not accept arbitrary shell commands or arbitrary file writes.
Requests must be structured and validated.

### Security Requirements

The helper implementation must include:

- code signing and designated requirement validation
- one launchd job owned by the app bundle
- request allowlist by operation type
- root path normalization and policy validation before traversal
- no user-controlled command execution
- no writable output paths controlled by untrusted input
- explicit uninstall/update behavior
- audit logs for privileged scan requests

### Full Disk Access

Root privileges do not automatically bypass macOS privacy protections. Full Disk
Access remains relevant for paths such as Mail, Messages, Safari, Photos, and
Group Containers.

The app must continue to detect and explain TCC-related failures even after a
helper exists.

The exact TCC responsibility boundary for the helper must be validated on the
target macOS versions before implementation is considered complete. The design
must not assume that Full Disk Access granted to the GUI app automatically
covers a separately installed privileged helper.

### Acceptance Criteria

Phase B is done when:

- helper install/update/uninstall works in development and signed builds
- the main app can request a read-only scan from the helper
- helper requests are rejected when the client identity is invalid
- root and volume scans can enumerate paths unavailable to the unprivileged app
- TCC-protected paths still produce explicit permission coverage when FDA is not
  granted
- the app can explain whether an omission came from app policy, helper
  filesystem permissions, TCC privacy controls, scope, cancellation, or budget
- logs can distinguish helper permission failure, TCC failure, policy skip, and
  IO failure

## Proposed Implementation Order

1. Add scan intent tests for preview versus exact.
2. Make exact mode disable all responsive soft skips in TypeScript options.
3. Make native exact mode ignore responsive path rules, basename skips, cache
   prefixes, and bundle suffix skips.
4. Add coverage samples for permission blocks, policy skips, and budget
   deferrals.
5. Surface coverage causes in renderer state and UI.
6. Add exact rescan command for the selected root.
7. Strengthen permission refresh and targeted rescan.
8. Add volume planner tests for `/`, `/System/Volumes/Data`, and `/Volumes/*`.
9. Write privileged helper threat model and protocol spec.
10. Validate the helper/FDA boundary on the target macOS versions.
11. Prototype helper with read-only directory enumeration.
12. Add signing, identity validation, and update/uninstall behavior.

## Test Strategy

Phase C tests:

- scan option normalization unit tests
- native protocol tests for exact mode policy inputs
- Rust policy tests proving exact mode does not soft-skip responsive paths
- integration tests using synthetic fixtures with:
  - `node_modules`
  - `.git`
  - `.cache`
  - `.app`
  - permission-denied directories
- renderer state tests for coverage cause display

Phase B tests:

- helper threat model review
- helper IPC contract tests
- client identity rejection tests
- path normalization and root allowlist tests
- TCC/FDA behavior tests or documented manual verification on target macOS
  versions
- helper read-only traversal fixture tests
- signed-build smoke test before release

## Risks

- R1 Exact scans can be slow and memory-heavy if aggregation is not bounded.
- R2 Exact scans can make the UI look stalled if progress and cancellation are
  not stage-aware.
- R3 Full Disk Access behavior varies by OS version and user approval state.
- R4 Full Disk Access may need separate validation for the GUI app and any
  installed helper process.
- R5 Privileged helper work requires signing and notarization discipline.
- R6 The current `electron-builder.json` has no macOS entitlements,
  notarization, helper bundle, or launchd installation model.
- R7 A helper with broad filesystem access is a security-sensitive component.
- R8 UI must avoid presenting permission-protected omissions as app bugs.
- R9 Cross-volume scans can accidentally traverse huge external, network, or
  virtual volumes unless the volume plan is explicit.
- R10 Existing logs now explain policy skip samples, but permission sample
  coverage is still weaker than policy skip sample coverage.

## Risk Mitigation Plan

| Risk | Mitigation | Phase |
| --- | --- | --- |
| R1 | Keep exact aggregation streaming and bounded; add large fixture benchmarks before broad UI rollout. | C |
| R2 | Emit stage-aware progress, queue depth, current path, cancellation state, and exact scan warning text. | C |
| R3 | Treat FDA as a runtime state, not a build-time assumption; keep readable probes. | C/B |
| R4 | Add a dedicated helper/FDA validation matrix before helper implementation. | B preflight |
| R5 | Add signing, notarization, and helper install docs before prototype ships. | B preflight |
| R6 | Add mac entitlements and packaging design before helper code is considered mergeable. | B preflight |
| R7 | Require a helper threat model, operation allowlist, and identity validation tests. | B |
| R8 | Surface omission causes separately in UI and logs. | C |
| R9 | Build an explicit volume planner and never treat `/` as an implicit "scan everything blindly" request. | C |
| R10 | Add `permissionSamples` to native diagnostics and renderer coverage state. | C |

## Detailed Phase C Direction

Phase C should be implemented as a sequence of small, testable changes.

### C1 Intent Contract

Create a single scan intent contract with these canonical outputs:

- `semanticMode`: `preview` or `exact`
- `policyPreset`: `responsive` or `exact`
- `budgetPolicy`: `bounded` or `unbounded`
- `skipPolicy`: `responsive` or `minimal`
- `volumePolicy`: `same-device`, `root-cross-device`, or `explicit-volumes`

All renderer and main-process scan starts should pass through this contract.
Tests must prove that exact mode cannot accidentally keep responsive skip inputs.

### C2 Native Policy Inputs

For exact native stages, main process must send:

- `softSkipPathRules: []`
- `softSkipPrefixes: []`
- `skipDirSuffixes: []`
- no package/cache basename skip list
- `timeBudgetMs: 0` unless the user explicitly selected a bounded exact scan

For preview native stages, keep responsive policy enabled.

### C3 Coverage Samples

Native diagnostics should carry bounded samples for:

- `policySkipSamples`
- `permissionSamples`
- `scopeSkipSamples`
- `budgetDeferredSamples`

The sample arrays should be capped to avoid log bloat. The current
`policySkipSamples` cap is 25; use the same cap for the other categories unless
benchmarks show a problem.

### C4 Renderer Coverage UI

The UI should present coverage as separate causes:

- "Skipped by preview policy"
- "Blocked by macOS permission"
- "Skipped by volume scope"
- "Deferred by time budget"
- "Remaining queue"

Exact scan UI must warn when exactness is blocked by permission or scope. It
must not call an exact scan complete if the terminal event is still estimated.

### C5 Permission Refresh

Permission refresh must be explicit:

1. collect blocked permission samples
2. open Full Disk Access settings
3. probe representative blocked paths
4. rebuild access plan
5. clear resolved permission prefixes
6. enqueue targeted exact rescan for affected roots

The scan job should record which roots are waiting for permission refresh so the
UI can explain why a rescan is available.

### C6 Volume Planner

Add a planner before native execution:

- `/Users/user`: same-device by default
- `/`: cross APFS/system mounted volumes, but still obey hard blocked roots
- `/System/Volumes/Data`: explicit data-volume scan
- `/Volumes/<name>`: explicit external-volume scan

The planner should report planned roots before execution so logs and UI can show
what is actually being scanned.

### C7 Benchmarks

Benchmarks should include:

- synthetic exact fixture with `node_modules`, `.git`, `.cache`, `.app`, and
  permission-denied directories
- real `/Users/user` preview smoke
- real `/Users/user` exact smoke
- root preview smoke

Success should be based on coverage counters and logs first, then speed.

## Detailed Phase B Direction

Phase B starts only after Phase C acceptance criteria pass.

### B0 Preflight Gates

Do not write helper implementation code until these are documented:

- macOS signing identity strategy
- hardened runtime and entitlement needs
- notarization path
- helper install/update/uninstall path
- helper/FDA validation matrix
- helper threat model

The current `electron-builder.json` only packages app files and native scanner
resources. It does not define entitlements, notarization, privileged helper
bundling, or launchd installation. That is a blocker for production helper work.

### B1 Helper Shape

The first helper should be read-only and narrow:

- input: root path, scan id, stage id, volume policy, request nonce
- output: directory entries, metadata records, permission failures, IO failures,
  terminal status
- forbidden: shell execution, arbitrary writes, delete operations, chmod/chown,
  moving files, cleaning files

The helper should not implement cleanup features in this project phase.

### B2 Identity and Authorization

The helper must validate the client before accepting a request:

- caller identity
- code signing requirement
- expected bundle identifier
- request operation allowlist
- normalized root path

Invalid clients must receive a structured rejection and the event must be logged.

### B3 TCC/FDA Validation Matrix

Validate these cases on target macOS versions:

- unsigned dev app without FDA
- signed dev app without FDA
- signed dev app with FDA
- installed helper without FDA
- installed helper with app FDA
- installed helper with any required helper-specific FDA behavior

The output must record whether protected paths fail as TCC, POSIX permission,
policy, or IO.

### B4 Migration Strategy

Keep the current unprivileged native scanner as the default until helper scans
are proven. Add helper as an engine option:

- `native_rust`: current unprivileged scanner
- `native_rust_privileged`: helper-backed scanner

The app should fall back to unprivileged exact scan if helper install or identity
validation fails.

### B5 Release Gate

Helper-backed scans cannot be considered release-ready until:

- signed app build succeeds
- helper install succeeds
- helper identity checks reject invalid clients
- uninstall removes helper artifacts
- FDA behavior is documented for the target macOS version
- logs distinguish app policy, helper permission, TCC, IO, scope, and budget

## Immediate Next Work

Implement Phase C in this order:

1. Add tests that exact mode sends no responsive skip inputs to native.
2. Add native `permissionSamples`, `scopeSkipSamples`, and
   `budgetDeferredSamples`.
3. Expose coverage samples through diagnostics and terminal coverage payloads.
4. Add renderer state/UI for skip causes and exact scan estimated reasons.
5. Add exact rescan action that uses unbounded exact policy for the selected
   root.
6. Add volume planner tests and logging.
7. Run `/Users/user` preview and exact smoke scans and compare coverage.

## Decision

Proceed with Phase C first. Do not start privileged helper implementation until
exact scan semantics, coverage reporting, and permission refresh are reliable.

After Phase C passes acceptance criteria, proceed to Phase B.
