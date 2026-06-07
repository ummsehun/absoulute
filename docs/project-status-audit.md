# Project Status Audit

Date: 2026-06-07

## Scope

This document records the current project phase map and a cold review of the
codebase state. It is based on local repository files, current uncommitted
changes, code graph output, and verification commands run on 2026-06-07. It was
updated after the first pre-helper architecture stabilization slice on
2026-06-07.

It does not claim product readiness, performance parity with external tools, or
macOS privileged-helper readiness.

## Phase Map

### Completed or Mostly Completed

Facts:

- The scan refactor TODO is fully checked off in `TODO.md`.
- Phase C exact-scan foundation is documented as complete enough to proceed in
  `docs/superpowers/specs/2026-06-06-phase-c-final-audit.md`.
- Phase C acceptance evidence includes preview/exact separation, exact scan
  traversal of cache/package/bundle/VCS paths, cause-specific coverage counters,
  permission refresh planning, and native volume-plan logging.

Remaining Phase C risk:

- Permission gaps still exist without macOS Full Disk Access.
- Exact scans over a real user home can be slow. The recorded `/Users/user`
  exact smoke took about `142.6s`.
- Permission-rescan behavior is covered by unit and contract tests, not by a
  full end-to-end macOS permission grant automation.

### Active Phase

Facts:

- The active phase is pre-helper architecture stabilization before continuing
  Phase B privileged-helper execution work.
- Current uncommitted changes include earlier helper protocol/preflight
  hardening plus the new architecture stabilization boundaries documented in
  `docs/superpowers/specs/2026-06-07-pre-helper-architecture-stabilization-design.md`.
- The default scan engine remains the unprivileged Rust native scanner.
- Helper-backed enumeration is gated by platform, exact deep scan mode, helper
  transport availability, explicit prototype opt-in, and registration
  preflight status.
- `bun run audit:helper-readiness` reports `status: "blocked"` with
  `canEnableHelperByDefault: false`.

Phase B is not complete.

### Remaining Phase B Work

Facts:

- Production bundle identifier is not confirmed.
- Team ID is not configured.
- Expected designated requirement is not configured.
- The helper listener signing requirement still uses placeholder identity
  evidence.
- `docs/helper-fda-validation-matrix.json` exists, but required FDA scenarios
  are not all passed.
- The helper must stay disabled by default until these gates are resolved.

Required remaining work:

1. Confirm production bundle identifier and helper label.
2. Configure real Team ID and expected designated requirement.
3. Rebuild helper with the real XPC/listener signing requirement.
4. Complete FDA validation matrix on the target macOS version.
5. Verify helper install/register/unregister behavior through
   `SMAppService.daemon(plistName:)`.
6. Validate peer identity at the IPC boundary.
7. Keep helper operations read-only and schema-bound.
8. Add or run end-to-end helper/FDA checks before enabling helper execution by
   default.

## Current Local Changes

Facts from `git status --short`, `git diff --stat`, and untracked files:

- Existing helper hardening changes are still present.
- New stabilization work added:
  - `docs/superpowers/specs/2026-06-07-pre-helper-architecture-stabilization-design.md`
  - `docs/superpowers/plans/2026-06-07-pre-helper-architecture-stabilization.md`
  - `docs/shared-contracts.md`
  - `scripts/audit-helper-readiness.ts`
  - `src/main/services/helper/helperReadinessAudit.ts`
  - `src/main/services/native/nativeScannerBinary.ts`
  - `src/main/services/native/nativeScannerProtocol.ts`
  - `src/main/services/scan/nativeStageHandlers.ts`
  - focused tests for helper readiness, helper planning, native binary
    resolution, native protocol parsing, native stage handling, and shared
    boundaries
- `cargo test` changes tracked native scanner target artifacts under
  `native/scanner/target/debug/...`; these are build output changes from
  verification and were not reverted.

Objective interpretation:

- The current change set hardens helper schema/preflight gates and reduces
  hotspot coupling before further helper work.
- It does not turn the privileged helper into the default scan path.

## LOC Review

Facts:

- Application/native source total inspected under `src/main`,
  `src/renderer/src`, `native/scanner/src`, and `native/macos-helper`: `14431`
  lines.
- Including tests and scripts inspected under `src`, `native`, `scripts`, and
  `test`: `23258` lines.
- There are 151 TypeScript/TSX/Rust/Swift files in the inspected app, native,
  scripts, and test paths.

Files over 500 lines:

| File | LOC |
| --- | ---: |
| None | 0 |

Files at or below 500 lines but still large:

| File | LOC |
| --- | ---: |
| `src/main/services/diskScanService.ts` | 500 |
| `native/macos-helper/enumerate/main.swift` | 500 |
| `src/main/services/scan/portableScanService.ts` | 491 |
| `src/main/services/native/nativeRustScannerClient.ts` | 483 |
| `src/main/services/scan/nativeScanOrchestrator.ts` | 463 |
| `src/main/services/scan/scanEventBus.ts` | 445 |
| `native/scanner/src/protocol.rs` | 443 |
| `src/renderer/src/hooks/useScanLogic.ts` | 437 |
| `src/renderer/src/utils/helpers.ts` | 431 |

Conclusion:

- The inspected production app/native files now satisfy a strict
  "all files at or below 500 LOC" standard.
- `nativeRustScannerClient.ts` is no longer over 500 LOC after extracting native
  protocol parsing and binary resolution.
- `DiskScanService` is no longer over 500 LOC after extracting scan job
  creation, native stage handlers, stat task coordination, and permission
  rescan stage execution.
- Renderer `helpers.ts` is no longer over 500 LOC after extracting path utility
  functions to `pathUtils.ts`.
- Several files are still large enough to require careful review, especially
  `DiskScanService`, `native/macos-helper/enumerate/main.swift`,
  `PortableScanService`, and `NativeScanOrchestrator`.

## Architecture Review

Facts:

- Code graph summary: 577 nodes, 4184 edges, 14 communities across 100 parsed
  files.
- Code graph risk score for the current context was low.
- One graph warning was reported: high coupling between `handler-register` and
  `utils-app`.
- Main hotspots include:
  - `DiskScanService`
  - `useScanLogic`
  - `registerIpcHandlers`
  - Rust `run_bfs_scan`
  - `PortableScanService.run`
  - native protocol parsing, now isolated in `nativeScannerProtocol.ts`

Facts from source structure:

- Scan architecture has visible boundaries: shared scan contract, main scan
  service, native scanner adapter, native scanner core, renderer state.
- Phase C moved policy constants into shared/domain contracts and passes policy
  inputs to native code rather than hard-coding all policy in Rust.
- Helper logic is currently behind `HelperClient`, `HelperTransport`, and
  `NativeScanOrchestrator` boundaries.
- Native scanner protocol parsing is now separated from native process/session
  lifecycle.
- Native scanner binary resolution and CPU hinting are now separated from the
  native process/session client.
- Native stage event handlers are now separated from `DiskScanService`.
- Scan job construction, portable stat task coordination, and native
  permission-rescan stage execution are now separated from `DiskScanService`.
- Renderer path utilities are now separated from renderer visualization helper
  functions.

Cold assessment:

- The architecture is not "hopelessly tangled"; there are real boundaries and
  a documented target architecture.
- It is also not clean. Scan lifecycle, aggregation, native orchestration,
  permission refresh, diagnostics, and fallback behavior still concentrate too
  much responsibility in several large modules.
- `DiskScanService` remains the largest architectural risk because it still
  coordinates job state, policy service, native stages, portable fallback,
  event emission, history, and permission refresh.
- The risk is lower than the previous baseline because native stage event
  mutation, scan job construction, stat task coordination, and permission
  rescan execution moved out of `DiskScanService`.
- `useScanLogic` is a renderer hotspot because it owns API subscription,
  scan actions, progress batching, warning summaries, window actions, and
  visualization-facing state in one hook.
- Rust traversal has been decomposed, but `run_bfs_scan` is still a large
  execution hub.

Opinion:

- The current architecture is serviceable for Phase B preparation if new helper
  work stays behind the existing helper boundary.
- It will become hard to maintain if helper lifecycle, registration UI,
  privileged scan execution, and permission refresh are added directly into
  `DiskScanService`, `registerIpcHandlers`, or `useScanLogic`.

## Shared Directory Review

Facts:

- `src/shared` totals 982 lines.
- Largest shared files:
  - `src/shared/schemas/scan.ts`: 294 lines
  - `src/shared/domain/scanPolicyContract.ts`: 239 lines
  - `src/shared/schemas/helperProtocol.ts`: 197 lines
  - `src/shared/domain/pathPolicy.ts`: 95 lines
- Shared code is consumed by main, preload, renderer, and tests.
- Shared schemas use zod and are tested.
- `src/shared/domain/pathPolicy.ts` and
  `src/shared/domain/scanPolicyContract.ts` import `node:path`.

Cold assessment:

- Shared is currently useful and mostly stable as a contract layer.
- It is not purely runtime-neutral because some shared domain files import
  Node's `node:path`.
- That is acceptable while shared consumers are Electron main/preload and a
  Vite/Electron renderer with compatible bundling, but it is a portability risk
  if shared code is expected to run in a strict browser-only runtime.
- `helperProtocol.ts` has improved because unknown helper schema fields are now
  rejected with strict zod objects.
- `test/main/sharedBoundary.test.ts` now prevents `src/shared` from importing
  Electron, main, renderer, or high-risk side-effectful runtime modules.
- `docs/shared-contracts.md` now distinguishes browser-neutral shared modules
  from Electron/Node-compatible shared domain modules.

Opinion:

- Shared should remain limited to schemas, constants, and pure policy contracts.
- Do not move orchestration, filesystem probing, Electron API behavior, helper
  lifecycle, or UI state into `src/shared`.

## Test Reliability Review

Verification run on 2026-06-07:

- `pnpm test`: passed, 44 files, 174 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests.
- Focused pre-helper stabilization tests passed:
  - `test/main/helperScanPlanner.test.ts`
  - `test/main/nativeScannerBinary.test.ts`
  - `test/main/nativeScannerProtocolParser.test.ts`
  - `test/main/nativeStageHandlers.test.ts`
  - `test/main/sharedBoundary.test.ts`
  - `test/main/helperReadinessAudit.test.ts`
- `bun run audit:helper-readiness` reported `status: "blocked"` and exited
  nonzero because real helper identity, FDA, and ServiceManagement evidence are
  missing.

Rust warning facts:

- `cargo test` emitted 6 dead-code warnings.
- Warnings include unused platform capability functions, unused
  `CoverageSummary`, and an unused `OutgoingMessage::Agg` variant.

Cold assessment:

- The current tests are credible for schema contracts, scan state transitions,
  helper gating, native protocol parsing, and small traversal-policy behavior.
- They are not enough to prove privileged-helper production readiness.
- They are not enough to prove macOS Full Disk Access behavior across target OS
  versions.
- They are not enough to prove real whole-disk performance.
- They are not enough to prove packaging/notarization/signing behavior unless
  dedicated packaging/signing jobs are run with real identity material.

Opinion:

- Test coverage is good for a pre-helper architecture refactor.
- Test coverage is insufficient for enabling privileged helper execution by
  default.
- The new helper readiness audit makes that insufficiency explicit instead of
  allowing a generic green test suite to imply helper readiness.
- Before Phase B is considered complete, helper/FDA/signing/packaging checks
  need to move from mostly contract tests to at least one real integration
  verification path.

## Phase B1 Helper Registration Evidence

Facts:

- Phase B1 is now scoped in
  `docs/superpowers/plans/2026-06-07-phase-b1-helper-registration-evidence.md`.
- `HelperReadinessReport` now includes structured `evidence` entries in
  addition to blocker strings.
- Readiness evidence covers helper identity, designated requirement, packaging
  entitlements, helper executable packaging, listener requirement metadata, FDA
  matrix status, and ServiceManagement registration status.
- `canEnableHelperByDefault` remains `false` even when readiness evidence is
  otherwise present.
- Existing helper registration tests already cover Team ID mismatch,
  designated-requirement mismatch, and missing LaunchDaemon packaging evidence.

Verification commands run for this Phase B1 slice:

- `pnpm test test/main/helperReadinessAudit.test.ts`: passed, 3 tests.
- `pnpm test test/main/helperRegistration.test.ts`: passed, 13 tests.
- `pnpm test`: passed, 44 files, 177 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-readiness`: reported `status: "blocked"`,
  `canEnableHelperByDefault: false`, and blocker-specific evidence entries;
  exited `1` as expected while external evidence is missing.

External blockers still missing:

- Real production Team ID.
- Real designated requirement derived from the production signing identity.
- Real listener requirement metadata generated with that Team ID.
- Full FDA validation matrix on the target macOS version.
- ServiceManagement registration evidence from the packaged app/helper.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase improves helper readiness auditability.
- It does not make the helper production-ready.
- It does not enable helper-backed scan execution by default.

## Phase B2 ServiceManagement Readiness

Facts:

- Phase B2 is scoped in
  `docs/superpowers/plans/2026-06-07-phase-b2-service-management-readiness.md`.
- `HelperReadinessReportInput.serviceManagementStatus` now accepts the full
  ServiceManagement probe state set used by
  `macosServiceManagementProbe.ts`: `registered`, `not-installed`,
  `pending-approval`, `not-implemented`, and `unknown`.
- Only `registered` is treated as ServiceManagement pass evidence.
- `pending-approval`, `not-installed`, `not-implemented`, and `unknown` keep
  readiness blocked with `service-management-not-registered`.
- `scripts/audit-helper-readiness.ts` now calls the existing
  `createMacOsServiceManagementProbeFromEnv()` boundary instead of hard-coding
  ServiceManagement status to `unknown`.
- If the probe throws unexpectedly, the audit script falls back to `unknown`
  and does not claim readiness.

Verification commands run for this Phase B2 slice:

- `pnpm test test/main/helperReadinessAudit.test.ts`: passed, 6 tests.
- `pnpm test test/main/helperReadinessAuditScript.test.ts`: passed, 1 test.
- `pnpm test`: passed, 45 files, 181 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-readiness`: reported `status: "blocked"`,
  `canEnableHelperByDefault: false`, and local
  `serviceManagementStatus: "not-implemented"` because no usable
  ServiceManagement probe evidence is currently available.

External blockers still missing:

- Real ServiceManagement registration evidence from a packaged app/helper.
- Real Team ID and designated requirement.
- Real listener requirement metadata generated from that Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase improves audit fidelity by distinguishing missing probe
  implementation from unknown status.
- It does not register the helper.
- It does not enable helper-backed scan execution by default.

## Phase B3 ServiceManagement Control Evidence

Facts:

- Phase B3 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b3-service-management-control-evidence.md`.
- `CommandMacOsServiceManagementController.register()` now accepts command
  output only when the parsed reason is exactly `register-succeeded`.
- `CommandMacOsServiceManagementController.unregister()` now accepts command
  output only when the parsed reason is exactly `unregister-succeeded`.
- Control operations also validate operation-specific success states:
  `register` accepts `registered` or `pending-approval`; `unregister` accepts
  only `not-installed`.
- Generic status-like output such as `enabled` or `not-registered` is rejected
  for control operations as
  `service-management-control-output-mismatch:<operation>:<reason>`.
- Generic `getStatus()` probe parsing remains unchanged.

Verification commands run for this Phase B3 slice:

- `pnpm test test/main/macosServiceManagementProbe.test.ts`: passed, 11 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 45 files, 185 tests.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-readiness`: reported `status: "blocked"`,
  `canEnableHelperByDefault: false`, and local
  `serviceManagementStatus: "not-implemented"`.

External blockers still missing:

- Real ServiceManagement registration evidence from a packaged app/helper.
- Real Team ID and designated requirement.
- Real listener requirement metadata generated from that Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase hardens command-control evidence without performing real
  registration.
- It does not make the helper production-ready.
- It does not enable helper-backed scan execution by default.

## Phase B4 Helper Stream Request Binding

Facts:

- Phase B4 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b4-helper-stream-request-binding.md`.
- `CommandMacOsHelperEnumerator` now wraps helper stream handlers with active
  request binding.
- Every helper event is parsed with `HelperEventSchema` and then checked so
  `event.requestId === request.requestId` before it is dispatched.
- Mismatched helper stream events now fail with
  `helper-enumerate-request-id-mismatch` and are not delivered to scan handlers.
- The change applies both to the default child-process stdout adapter and to
  injected runner implementations used in tests.

Verification commands run for this Phase B4 slice:

- `pnpm test test/main/helperClient.test.ts`: passed, 21 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 45 files, 186 tests.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-readiness`: reported `status: "blocked"`,
  `canEnableHelperByDefault: false`, and local
  `serviceManagementStatus: "not-implemented"`.

External blockers still missing:

- Production XPC peer identity validation.
- Real ServiceManagement registration evidence from a packaged app/helper.
- Real Team ID and designated requirement.
- Real listener requirement metadata generated from that Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase hardens helper stream correlation before helper-backed scan
  execution is expanded.
- It does not implement production XPC peer identity validation.
- It does not enable helper-backed scan execution by default.

## Phase B5 Helper Terminal Error Fallback

Facts:

- Phase B5 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b5-helper-terminal-error-fallback.md`.
- `NativeScanOrchestrator.runHelperStage()` now captures helper terminal
  `error` events before mapping them into native warning messages.
- If a helper stage finishes without `done` after a helper `error` event, the
  helper fallback reason now preserves the helper error code and message as
  `helper-error:<code>:<message>`.
- If helper enumeration rejects after emitting a helper `error`, that stored
  helper error reason still takes precedence over the lower-level transport
  failure reason.
- The existing native fallback behavior is preserved.
- Helper error events are still dispatched through the native warning adapter
  before fallback.

Verification commands run for this Phase B5 slice:

- `pnpm test test/main/nativeScanOrchestrator.test.ts`: passed, 15 tests.
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 45 files, 188 tests.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-readiness`: reported `status: "blocked"`,
  `canEnableHelperByDefault: false`, and local
  `serviceManagementStatus: "not-implemented"`.

External blockers still missing:

- Production XPC peer identity validation.
- Real ServiceManagement registration evidence from a packaged app/helper.
- Real Team ID and designated requirement.
- Real listener requirement metadata generated from that Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase improves fallback diagnostics for helper-backed scan stages.
- It does not disable native fallback.
- It does not enable helper-backed scan execution by default.

## Phase B6 Helper Control Request Envelopes

Facts:

- Phase B6 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b6-helper-control-request-envelopes.md`.
- `helperClient.ts` now exposes explicit builders for `health.check` and
  `version.get` helper request envelopes.
- The new control request builders keep `scanId` and `stageId` explicit because
  the current shared helper envelope schema requires those fields for every
  operation.
- Generated control requests are validated through
  `HelperRequestEnvelopeSchema` inside the builders.
- The helper remains disabled by default.

Verification commands run for this Phase B6 slice:

- `pnpm test test/main/helperClient.test.ts`: passed, 23 tests.
- `pnpm test`: passed, 45 files, 190 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-readiness`: reported `status: "blocked"`,
  `canEnableHelperByDefault: false`, and local
  `serviceManagementStatus: "not-implemented"`.

External blockers still missing:

- Production XPC peer identity validation.
- Real ServiceManagement registration evidence from a packaged app/helper.
- Real Team ID and designated requirement.
- Real listener requirement metadata generated from that Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase removes an ad hoc future IPC gap for helper control
  operations.
- It does not implement real XPC health/version transport calls.
- It does not enable helper-backed scan execution by default.

## Findings

### P1: Privileged Helper Is Still Blocked by Real Identity and FDA Evidence

Facts:

- Phase B docs list missing production bundle identity, Team ID, designated
  requirement, placeholder listener requirement, and incomplete FDA matrix.
- Current code keeps helper selection gated.

Impact:

- Enabling helper execution by default now would be premature.

Recommendation:

- Keep the helper disabled by default until identity, FDA, registration, and
  IPC validation are proven with real artifacts.

### P2: Some Core Modules Still Sit at the 500 LOC Boundary

Facts:

- No inspected production app/native file exceeds 500 lines.
- `diskScanService.ts` and `native/macos-helper/enumerate/main.swift` are
  exactly 500 lines.
- `nativeRustScannerClient.ts` and renderer `utils/helpers.ts` were reduced
  below 500 lines.

Impact:

- Changes in boundary-sized modules still have higher review cost and higher
  regression risk.

Recommendation:

- Continue decomposition only around real boundaries:
  - scan lifecycle state machine
  - native protocol parser/session adapter
  - renderer visualization tree utilities
  - permission rescan coordinator

### P2: Architecture Has Hotspots, Not a Complete Boundary Failure

Facts:

- Code graph identifies `DiskScanService`, `useScanLogic`,
  `registerIpcHandlers`, and Rust `run_bfs_scan` as hotspots.
- Existing boundaries still exist and are documented.

Impact:

- Phase B work can remain controlled, but only if it does not add more
  responsibilities to those hotspots.

Recommendation:

- Put helper lifecycle and helper-backed scan execution behind small main
  process services and map helper events back into the existing scan event
  stream.

### P2: Tests Are Strong at Contract Level but Weak at Real macOS Integration

Facts:

- Unit and contract tests pass.
- Full FDA grant automation and production signing/notarization validation are
  not proven by the current test run.

Impact:

- A green test suite does not mean privileged helper readiness.

Recommendation:

- Add explicit Phase B verification jobs for signed app packaging,
  SMAppService registration, helper peer identity validation, FDA matrix
  scenarios, helper fallback, and helper uninstall/update behavior.

## Bottom Line

Facts:

- The project is in a reasonable Phase B preparation state.
- Phase C scan semantics are documented as sufficiently complete.
- Current local changes are focused on helper hardening and pre-helper
  architecture stabilization.
- The current verification commands pass.
- Helper readiness remains blocked by design.

Opinion:

- The codebase is not clean enough to scale Phase B by simply adding logic to
  existing hotspots.
- It is clean enough to proceed if Phase B remains contract-first, helper-gated,
  and integration-tested before default enablement.
