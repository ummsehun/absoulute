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

## Phase B7 Helper Enumerate Operation Allowlist

Facts:

- Phase B7 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b7-helper-enumerate-operation-allowlist.md`.
- `CommandMacOsHelperEnumerator.enumerate()` now rejects helper request
  envelopes whose operation is not `scan.enumerate` before replay registration
  or runner dispatch.
- Non-enumerate envelopes fail with
  `helper-enumerate-unsupported-operation:<operation>`.
- The existing replay guard and request-id event binding remain in place.
- The helper remains disabled by default.

Verification commands run for this Phase B7 slice:

- `pnpm test test/main/helperClient.test.ts`: passed, 24 tests.
- `pnpm test`: passed, 45 files, 191 tests.
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

- This mini phase hardens the main-process enumerate adapter operation
  allowlist before helper-backed scan execution expands.
- It does not implement real XPC health/version transport calls.
- It does not enable helper-backed scan execution by default.

## Phase B8 Helper Terminal Event Guard

Facts:

- Phase B8 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b8-helper-terminal-event-guard.md`.
- `CommandMacOsHelperEnumerator` now tracks helper stream terminal state inside
  its request-bound handler wrapper.
- After the first `done` or `error` event, later helper events fail with
  `helper-enumerate-event-after-terminal`.
- The first terminal event is still dispatched to scan handlers.
- The existing operation allowlist, replay guard, event schema validation, and
  request-id binding remain in place.
- The helper remains disabled by default.

Verification commands run for this Phase B8 slice:

- `pnpm test test/main/helperClient.test.ts`: passed, 26 tests.
- `pnpm test`: passed, 45 files, 193 tests.
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

- This mini phase hardens helper stream terminal semantics before
  helper-backed scan execution expands.
- It does not implement real XPC health/version transport calls.
- It does not enable helper-backed scan execution by default.

## Phase B9 Helper Ready And Terminal Audit Log

Facts:

- Phase B9 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b9-helper-ready-terminal-audit-log.md`.
- `NativeScanOrchestrator.runHelperStage()` now records
  `native_helper_scan_ready` when a helper `ready` event arrives.
- The ready log includes helper version, request ID, operation, root path,
  volume policy, and planned roots.
- Helper `done` and `error` events now record `native_helper_scan_terminal`.
- Terminal logs include request ID, operation, root path, volume policy,
  planned roots, and terminal status.
- The helper remains disabled by default.

Verification commands run for this Phase B9 slice:

- `pnpm test test/main/nativeScanOrchestrator.test.ts`: passed, 15 tests.
- `pnpm test`: passed, 45 files, 193 tests.
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

- This mini phase improves helper-backed scan audit evidence for helper version
  and terminal status.
- It does not implement real XPC health/version transport calls.
- It does not enable helper-backed scan execution by default.

## Phase B10 Helper Terminal Audit Counts

Facts:

- Phase B10 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b10-helper-terminal-audit-counts.md`.
- `NativeScanOrchestrator.runHelperStage()` now keeps helper-stage audit
  counters derived from helper stream events.
- `native_helper_scan_terminal` now includes:
  - `entryCount`
  - `permissionFailureCount`
  - `tccFailureCount`
  - `ioFailureCount`
  - `scopeRejectionCount`
  - `cancellationCount`
- Counts are local to the helper-backed stage and do not change scan
  aggregation semantics.
- The helper remains disabled by default.

Verification commands run for this Phase B10 slice:

- `pnpm test test/main/nativeScanOrchestrator.test.ts`: passed, 15 tests.
- `pnpm test`: passed, 45 files, 193 tests.
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

- This mini phase improves helper terminal audit evidence for event-derived
  counts required by the Phase B logging spec.
- It does not implement real XPC health/version transport calls.
- It does not enable helper-backed scan execution by default.

## Phase B11 Helper Request Correlation

Facts:

- Phase B11 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b11-helper-request-correlation.md`.
- `NativeScanOrchestrator.runHelperStage()` now generates the helper
  `requestId` before calling `helperClient.enumerate()`.
- The orchestrator now derives `traversalPolicyPlanId` from scan ID, stage ID,
  and deep policy preset before helper dispatch.
- The same `requestId` and `traversalPolicyPlanId` are passed to the helper
  request and recorded in helper start, ready, and terminal audit logs.
- Helper request correlation remains local to the helper-backed stage and does
  not move scan policy ownership into the helper.
- The helper remains disabled by default.

Verification commands run for this Phase B11 slice:

- `pnpm test test/main/nativeScanOrchestrator.test.ts`: passed, 15 tests.
- `pnpm test`: passed, 45 files, 193 tests.
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

- This mini phase improves helper request audit correlation for Phase B
  logging and policy-plan traceability.
- It does not implement real XPC health/version transport calls.
- It does not enable helper-backed scan execution by default.

## Phase B12 Helper Control Command Transport

Facts:

- Phase B12 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b12-helper-control-command-transport.md`.
- `macosHelperControlCommand.ts` now defines a separate helper control command
  boundary for `health.check` and `version.get` requests.
- The helper control command boundary rejects `scan.enumerate` requests before
  invoking the command runner.
- Control command events are validated with the shared helper event schema and
  are bound to the request ID before health/version evidence is accepted.
- `MacOsXpcHelperTransport.getVersion()` can now delegate to configured helper
  control evidence and still returns `null` when no control command is
  available.
- `MacOsXpcHelperTransport.healthCheck()` can now mark the XPC channel check as
  pass only when the control command succeeds; registration/FDA blockers still
  keep the helper unavailable.
- `createDefaultHelperTransport()` resolves packaged `helper-control-macos`
  resources on macOS only when XPC transport is explicitly requested.
- `native/macos-helper/control/main.swift` provides a prototype Swift control
  CLI for health/version requests.
- `package.json` now includes `build:native:helper-control`.
- `electron-builder.json` now packages `helper-control-macos` from
  `resources/bin`.
- The helper remains disabled by default.

Verification commands run for this Phase B12 slice:

- `pnpm test test/main/helperClient.test.ts`: passed, 33 tests.
- `pnpm test test/main/helperPackaging.test.ts`: passed, 7 tests.
- `bun run build:native:helper-control`: passed and produced
  `resources/bin/helper-control-macos`.
- `resources/bin/helper-control-macos` accepted a `version.get` request and
  emitted matching `ready` and `done` events.
- `pnpm test`: passed, 45 files, 201 tests.
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

- This mini phase makes health/version command evidence executable and
  auditable through the main-process helper transport boundary.
- This is still prototype command evidence, not proof of production XPC
  identity or default helper readiness.
- It does not enable helper-backed scan execution by default.

## Phase B13 Helper Readiness Evidence Guidance

Facts:

- Phase B13 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b13-helper-readiness-evidence-guidance.md`.
- `HelperReadinessEvidence` now supports diagnostic `guidance` metadata.
- Readiness guidance lists stable required inputs and artifacts for each
  blocker evidence key.
- `audit:helper-readiness` now prints guidance for Team ID, designated
  requirement, FDA matrix, packaging entitlements, privileged helper
  executable, listener requirement, and ServiceManagement evidence.
- Guidance is diagnostic only; it does not change blocker calculation,
  readiness status, or helper default activation.
- The helper remains disabled by default.

Verification commands run for this Phase B13 slice:

- `pnpm test test/main/helperReadinessAudit.test.ts`: passed, 6 tests.
- `pnpm test test/main/helperReadinessAuditScript.test.ts
  test/main/helperReadinessAudit.test.ts`: passed, 2 files, 7 tests.
- `pnpm test`: passed, 45 files, 201 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-readiness`: reported `status: "blocked"`,
  `canEnableHelperByDefault: false`, and emitted guidance metadata for failed
  evidence entries.

External blockers still missing:

- Production XPC peer identity validation.
- Real ServiceManagement registration evidence from a packaged app/helper.
- Real Team ID and designated requirement.
- Real listener requirement metadata generated from that Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase reduces ambiguity in the remaining external evidence work.
- It does not make any external evidence pass.
- It does not enable helper-backed scan execution by default.

## Phase B14 Helper Preflight Remediation Actions

Facts:

- Phase B14 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b14-helper-preflight-remediation-actions.md`.
- `HelperPreflightAudit` now includes a diagnostic `remediation` array.
- Each remediation item is derived from the current blocker list and includes
  the blocker, description, and applicable commands, required inputs, and
  required artifacts.
- Remediation guidance covers Team ID, designated requirement, packaging
  entitlements, privileged helper executable, listener requirement metadata,
  and FDA matrix blockers.
- Remediation is diagnostic only; it does not change blocker calculation,
  `installReady`, `enumerateReady`, strict exit codes, or helper default
  activation.
- The helper remains disabled by default.

Verification commands run for this Phase B14 slice:

- `pnpm test test/main/helperPreflightAudit.test.ts`: passed, 6 tests.
- `pnpm test`: passed, 45 files, 201 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: printed blocker-specific remediation actions.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.

External blockers still missing:

- Production XPC peer identity validation.
- Real ServiceManagement registration evidence from a packaged app/helper.
- Real Team ID and designated requirement.
- Real listener requirement metadata generated from that Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase makes the preflight audit actionable for the remaining
  install/enumerate evidence work.
- It does not make any external evidence pass.
- It does not enable helper-backed scan execution by default.

## Phase B15 Privileged Helper XPC Control Surface

Facts:

- Phase B15 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b15-privileged-helper-xpc-control-surface.md`.
- `native/macos-helper/privileged-helper/main.swift` now defines an
  Objective-C-compatible `DiskVisualizerPrivilegedHelperProtocol`.
- The privileged helper protocol exposes only `healthCheck` and `getVersion`
  reply methods.
- The listener still configures the caller code-signing requirement before
  resuming the service.
- Placeholder `TEAMID_NOT_CONFIGURED` builds explicitly invalidate and reject
  connections instead of accepting a placeholder identity.
- Real Team ID builds can export the health/version interface, set the exported
  object, resume the XPC connection, and return `true`.
- The privileged helper still does not expose scan enumeration APIs.
- The helper remains disabled by default.

Verification commands run for this Phase B15 slice:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts`: passed, 3 tests.
- `pnpm build:native:privileged-helper`: passed.
- `pnpm test`: passed, 45 files, 202 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight with placeholder
  `TEAMID_NOT_CONFIGURED` listener metadata.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.

External blockers still missing:

- Production XPC peer identity validation with a real Team ID.
- Real ServiceManagement registration evidence from a packaged app/helper.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase replaces the reject-all privileged helper placeholder with a
  minimal read-only XPC control surface.
- It does not wire a production Electron/Node XPC client.
- It does not expose privileged scan enumeration.
- It does not enable helper-backed scan execution by default.

## Phase B16 Helper XPC Control Probe

Facts:

- Phase B16 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b16-helper-xpc-control-probe.md`.
- `native/macos-helper/control/main.swift` now connects to
  `com.example.diskvisualizer.privileged-helper` with `NSXPCConnection`.
- The packaged `helper-control-macos` command now probes the Phase B15
  privileged helper XPC control surface instead of emitting a local simulated
  control response.
- The control command still validates the existing helper request envelope and
  accepts only `health.check` and `version.get`.
- The control command emits existing helper protocol `ready`, `done`, and
  `error` events for TypeScript transport consumption.
- The control command does not expose `scan.enumerate` or helper scan
  traversal APIs.
- The main app helper transport remains opt-in and evidence-gated.
- The helper remains disabled by default.

Verification commands run for this Phase B16 slice:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts`: passed, 4 tests.
- `pnpm test test/main/helperClient.test.ts`: passed, 33 tests.
- `pnpm test test/main/helperClient.test.ts
  test/main/macosPrivilegedHelperCli.test.ts`: passed, 2 files, 37 tests.
- `pnpm build:native:helper-control`: passed.
- `pnpm test`: passed, 45 files, 203 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight with placeholder
  `TEAMID_NOT_CONFIGURED` listener metadata.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.

External blockers still missing:

- Installed privileged helper ServiceManagement evidence.
- Production XPC peer identity validation with a real Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase replaces local helper-control simulation with a real Mach
  service XPC probe for health/version.
- It still does not implement privileged scan enumeration over XPC.
- It does not make readiness pass without external production evidence.
- It does not enable helper-backed scan execution by default.

## Phase B17 Privileged Helper Enumerate Request Boundary

Facts:

- Phase B17 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b17-privileged-helper-enumerate-request-boundary.md`.
- `native/macos-helper/privileged-helper/main.swift` now adds a
  `scan.enumerate` XPC method to `DiskVisualizerPrivilegedHelperProtocol`.
- The new method accepts a JSON helper request envelope and returns
  newline-delimited helper protocol JSON events as a reply string.
- The privileged helper now strictly decodes and validates `scan.enumerate`
  request shape, including schema version, ids, nonce, operation allowlist,
  scan mode, accuracy mode, volume policy, permission policy, max depth, emit
  policy, normalized absolute paths, and planned root containment.
- Valid requests currently return `ready` followed by `error` with
  `E_HELPER_INTERNAL`, because privileged helper traversal is intentionally not
  implemented in this mini phase.
- Invalid requests return `error` with `E_INVALID_REQUEST`.
- Placeholder `TEAMID_NOT_CONFIGURED` builds still reject XPC connections before
  exporting the service.
- The helper remains disabled by default.

Verification commands run for this Phase B17 slice:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts`: passed, 4 tests.
- `pnpm build:native:privileged-helper`: passed.
- `pnpm test`: passed, 45 files, 203 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight with placeholder
  `TEAMID_NOT_CONFIGURED` listener metadata.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.

External blockers still missing:

- Privileged helper traversal implementation for `scan.enumerate`.
- Installed privileged helper ServiceManagement evidence.
- Production XPC peer identity validation with a real Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase creates the privileged helper XPC request boundary for future
  read-only scans.
- It does not yet move directory traversal into the privileged helper process.
- It does not make readiness pass without external production evidence.
- It does not enable helper-backed scan execution by default.

## Phase B18 Privileged Helper Read-Only Traversal

Facts:

- Phase B18 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b18-privileged-helper-readonly-traversal.md`.
- `native/macos-helper/privileged-helper/enumerateTraversal.swift` now contains
  the privileged helper read-only traversal implementation.
- `native/macos-helper/privileged-helper/main.swift` remains under the 500 LOC
  stabilization target and delegates valid `scan.enumerate` requests to
  `enumeratePrivileged`.
- The privileged helper now emits read-only traversal helper protocol events:
  `entry_batch`, `progress`, `coverage`, `warn`, and `done`.
- Traversal respects `maxDepth`, `sameDeviceOnly`, and batch sizing.
- Permission failures are reported as `E_HELPER_PERMISSION`, IO failures as
  `E_IO`, and cross-device skips as `E_SCOPE`.
- `scripts/build-macos-privileged-helper.ts` now compiles both generated
  `main.swift` and `enumerateTraversal.swift`.
- The helper remains disabled by default and readiness remains blocked without
  production evidence.

Verification commands run for this Phase B18 slice:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts`: passed, 5 tests.
- `pnpm build:native:privileged-helper`: passed.
- `pnpm test`: passed, 45 files, 204 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight with placeholder
  `TEAMID_NOT_CONFIGURED` listener metadata.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.
- LOC check:
  - `native/macos-helper/privileged-helper/main.swift`: 338
  - `native/macos-helper/privileged-helper/enumerateTraversal.swift`: 209

External blockers still missing:

- Main-process XPC bridge for invoking privileged helper `scan.enumerate`.
- Installed privileged helper ServiceManagement evidence.
- Production XPC peer identity validation with a real Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase moves read-only traversal behavior into the privileged helper
  process.
- It still returns traversal events as a single newline-delimited XPC reply
  string; streaming XPC remains later work.
- It does not make readiness pass without external production evidence.
- It does not enable helper-backed scan execution by default.

## Phase B19 Helper XPC Enumerate Bridge

Facts:

- Phase B19 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b19-helper-xpc-enumerate-bridge.md`.
- `native/macos-helper/xpc-enumerate/main.swift` adds a packaged
  `helper-xpc-enumerate-macos` bridge.
- The bridge reads the existing helper request envelope from stdin, connects to
  `com.example.diskvisualizer.privileged-helper` with `NSXPCConnection`, calls
  `enumerate(_:withReply:)`, and writes the helper's newline-delimited event
  reply to stdout.
- `src/main/services/helper/macosHelperEnumerateCommand.ts` now prefers the
  packaged `helper-xpc-enumerate-macos` bridge when present.
- `SCAN_HELPER_ENUMERATE_BIN` remains an explicit override.
- `helper-enumerate-macos` remains packaged as a local prototype fallback.
- `electron-builder.json` now packages `helper-xpc-enumerate-macos`.
- `package.json` now includes `build:native:helper-xpc-enumerate`.
- The helper remains disabled by default and readiness remains blocked without
  production evidence.

Verification commands run for this Phase B19 slice:

- `pnpm test test/main/macosPrivilegedHelperCli.test.ts
  test/main/helperPackaging.test.ts test/main/helperClient.test.ts`: passed, 3
  files, 48 tests.
- `pnpm build:native:helper-xpc-enumerate`: passed.
- `pnpm test`: passed, 45 files, 207 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight with placeholder
  `TEAMID_NOT_CONFIGURED` listener metadata.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.
- LOC check:
  - `native/macos-helper/xpc-enumerate/main.swift`: 191

External blockers still missing:

- Installed privileged helper ServiceManagement evidence.
- Production XPC peer identity validation with a real Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase gives the main-process helper transport a packaged command
  path that can call the privileged helper `scan.enumerate` XPC method.
- It does not make readiness pass without external production evidence.
- It does not enable helper-backed scan execution by default.

## Phase B20 Helper XPC Enumerate Bridge Evidence

Facts:

- Phase B20 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b20-helper-xpc-enumerate-bridge-evidence.md`.
- `helper-xpc-enumerate-macos` is now an explicit helper registration,
  preflight, and readiness evidence item.
- `resolveHelperXpcEnumerateBridgeEvidence` requires the bridge artifact to be
  a file, executable, Mach-O, and packaged by `electron-builder.json`
  `extraResources` into `bin`.
- `SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY` is required before bridge artifact
  evidence becomes effective preflight evidence.
- `audit:helper-preflight` now reports separate `artifactEvidence`,
  `confirmations`, and `effectiveEvidence` for
  `helperXpcEnumerateBridge`.
- Missing bridge evidence blocks enumerate readiness.
- Install readiness remains separate from enumerate readiness; the app-side XPC
  enumerate bridge does not block ServiceManagement install preflight by
  itself.
- The helper remains disabled by default and readiness remains blocked without
  production identity, FDA, and ServiceManagement evidence.

Verification commands run for this Phase B20 slice:

- `pnpm test test/main/helperRegistration.test.ts
  test/main/helperPreflightAudit.test.ts test/main/helperReadinessAudit.test.ts`:
  passed, 3 files, 28 tests.
- `pnpm test test/main/helperClient.test.ts test/main/helperRegistration.test.ts
  test/main/helperPreflightAudit.test.ts test/main/helperReadinessAudit.test.ts`:
  passed, 4 files, 62 tests.
- `pnpm test`: passed, 45 files, 211 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight. Artifact evidence
  detected `helperXpcEnumerateBridge: true`, but effective evidence remained
  false because `SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY` was not set.
- `pnpm audit:helper-readiness`: reported `status: "blocked"`,
  `canEnableHelperByDefault: false`, and failed `xpc-enumerate-bridge`
  evidence guidance.
- LOC check:
  - `src/main/services/helper/helperRegistration.ts`: 459
  - `src/main/services/helper/helperPreflightAudit.ts`: 416
  - `src/main/services/helper/helperReadinessAudit.ts`: 187
  - `src/main/services/helper/macosXpcHelperTransport.ts`: 249

External blockers still missing:

- Explicit production confirmation for helper packaging/bridge evidence.
- Installed privileged helper ServiceManagement evidence.
- Production XPC peer identity validation with a real Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase makes the B19 bridge visible to the helper readiness gate.
- It does not make readiness pass from artifact presence alone.
- It does not enable helper-backed scan execution by default.

## Phase B21 ServiceManagement Probe Binary Evidence

Facts:

- Phase B21 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b21-service-management-probe-binary-evidence.md`.
- `resolveMacOsServiceManagementProbeBinary` now returns a path only when the
  candidate exists, is a file, and has an executable bit.
- The executable-file guard applies to both `SCAN_HELPER_SM_PROBE_BIN` and the
  packaged `<resourcesPath>/bin/service-management-probe-macos` fallback.
- Executable script probes remain supported for tests and manual audit
  fixtures.
- Missing or non-executable probe/control paths now fall back to
  `NotImplementedMacOsServiceManagementProbe` or `null` controller instead of
  being selected as usable ServiceManagement evidence.
- The Swift `SMAppService` probe implementation was not changed.
- The helper remains disabled by default and readiness remains blocked without
  real ServiceManagement registration, production identity, and FDA evidence.

Verification commands run for this Phase B21 slice:

- `pnpm test test/main/macosServiceManagementProbe.test.ts`: passed, 1 file,
  11 tests before review, then 12 tests after addressing review feedback.
- `pnpm test test/main/helperReadinessAuditScript.test.ts
  test/main/helperClient.test.ts test/main/macosServiceManagementProbe.test.ts`:
  passed, 3 files, 46 tests.
- `pnpm test`: passed, 45 files, 210 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight while production
  identity/FDA confirmations remain missing.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.

External blockers still missing:

- Installed privileged helper ServiceManagement evidence.
- Production XPC peer identity validation with a real Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase prevents placeholder or typo probe paths from entering the
  ServiceManagement probe/control path.
- It does not make ServiceManagement registered.
- It does not enable helper-backed scan execution by default.

## Phase B22 Helper Plan Registration Blockers

Facts:

- Phase B22 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b22-helper-plan-registration-blockers.md`.
- `ScanHelperPlanSchema` now accepts optional `registrationBlockers`.
- `NativeScanOrchestrator` now copies helper registration preflight blocker
  codes into `NativeHelperPlanMessage.registrationBlockers` when blockers are
  present.
- Existing helper plan label formatting remains stable and ignores this
  diagnostic metadata.
- Helper plan engine selection did not change.
- The helper remains disabled by default and readiness remains blocked without
  real ServiceManagement registration, production identity, and FDA evidence.

Verification commands run for this Phase B22 slice:

- `pnpm test test/main/nativeScanOrchestrator.test.ts
  test/main/scanDiagnostics.test.ts test/renderer/helperPlan.test.ts`: passed,
  3 files, 21 tests.
- `pnpm test`: passed, 45 files, 212 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight while production
  identity/FDA confirmations remain missing.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.

External blockers still missing:

- Installed privileged helper ServiceManagement evidence.
- Production XPC peer identity validation with a real Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase makes helper fallback diagnostics more explainable to
  renderer/diagnostics consumers.
- It does not make helper readiness pass.
- It does not enable helper-backed scan execution by default.

## Phase B23 Helper Prototype Audit Registration Blockers

Facts:

- Phase B23 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b23-helper-prototype-audit-registration-blockers.md`.
- `summarizeHelperPrototypeAudit` now returns `registrationBlocked` and
  `registrationBlockers`.
- The blocker summary is read from the latest helper plan, matching existing
  `engine`, `transport`, and `prototypeEnumerate` summary behavior.
- `registrationBlockers` uses the stable blocker codes already carried by the
  helper plan.
- Helper scan selection did not change.
- Helper readiness gates did not change.
- The helper remains disabled by default and readiness remains blocked without
  real ServiceManagement registration, production identity, and FDA evidence.

Verification commands run for this Phase B23 slice:

- `pnpm test test/main/helperPrototypeAuditSummary.test.ts`: passed, 1 file,
  2 tests before review, then 3 tests after addressing review feedback.
- `pnpm test`: passed, 45 files, 213 tests before review, then 214 tests after
  addressing review feedback.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `cargo test --manifest-path native/scanner/Cargo.toml`: passed, 8 tests,
  with the existing 6 Rust dead-code warnings.
- `pnpm audit:helper-preflight`: reported blocked preflight while production
  identity/FDA confirmations remain missing.
- `pnpm audit:helper-readiness`: reported `status: "blocked"` and
  `canEnableHelperByDefault: false`.

External blockers still missing:

- Installed privileged helper ServiceManagement evidence.
- Production XPC peer identity validation with a real Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase makes helper prototype audit output retain the concrete
  registration blockers that explain native fallback.
- It does not make helper readiness pass.
- It does not enable helper-backed scan execution by default.

## Phase B24 Helper Audit Output Files

Facts:

- Phase B24 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b24-helper-audit-output-files.md`.
- `scripts/audit-helper-preflight.ts` now accepts `--out <path>`.
- `scripts/audit-helper-readiness.ts` now accepts `--out <path>`.
- Both scripts print the same JSON to stdout as before.
- Both scripts write the same JSON payload to the requested UTF-8 output file
  and create parent directories as needed.
- `--out` without a file path now fails explicitly instead of being silently
  ignored.
- Generated audit JSON should be written to repo-external paths such as
  `/tmp/...` unless a caller intentionally wants an untracked local artifact.
- Preflight strict exit semantics did not change.
- Readiness blocked exit semantics did not change.
- No generated audit JSON files are committed.
- Helper readiness gates did not change.
- The helper remains disabled by default and readiness remains blocked without
  real ServiceManagement registration, production identity, and FDA evidence.

Verification commands run for this Phase B24 slice:

- `pnpm test test/main/helperAuditOutput.test.ts
  test/main/helperReadinessAuditScript.test.ts
  test/main/helperPreflightAudit.test.ts` passed after implementation: 3 files,
  14 tests.
- `bun run scripts/audit-helper-preflight.ts --out` failed explicitly with
  `--out requires an output file path`.
- `pnpm test` passed: 46 files, 220 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-preflight` printed `status: "blocked"` and exited 0.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.
- Direct `--out` checks wrote `/tmp/luie-helper-audit-b24/preflight.json` and
  `/tmp/luie-helper-audit-b24/readiness.json`; both parsed as JSON and retained
  the intended blocked statuses.
- Sub-agent review found no Critical or Important issues. Minor feedback about
  missing `--out` values and generated artifact path guidance was addressed.

External blockers still missing:

- Installed privileged helper ServiceManagement evidence.
- Production XPC peer identity validation with a real Team ID.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase gives Phase B audits durable file artifacts without changing
  readiness semantics.
- It does not make helper readiness pass.
- It does not enable helper-backed scan execution by default.

## Phase B25 Helper FDA Matrix Audit

Facts:

- Phase B25 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b25-helper-fda-matrix-audit.md`.
- `src/main/services/helper/helperFdaValidationMatrix.ts` now exposes
  `buildHelperFdaMatrixAudit`.
- `scripts/audit-helper-fda-matrix.ts` prints the FDA matrix audit JSON to
  stdout.
- `package.json` now exposes `audit:helper-fda-matrix`.
- The FDA matrix audit supports `--project-root <path>` for isolated matrix
  checks.
- The FDA matrix audit supports `--out <path>` and writes the same JSON payload
  to the requested UTF-8 output file.
- The audit reports `status: "ready"` only when the target macOS version is
  concrete, every required FDA scenario is passed with evidence, and no required
  scenario is failed.
- No generated audit JSON files are committed.
- Helper readiness gates did not change.
- The current repo FDA matrix remains blocked with `targetMacOS: "pending"`,
  `passedScenarioCount: 0`, six missing passed scenarios, and six scenarios
  missing evidence.
- The helper remains disabled by default and readiness remains blocked without
  real ServiceManagement registration, production identity, and FDA evidence.

Verification commands run for this Phase B25 slice:

- `pnpm test test/main/helperFdaValidationMatrix.test.ts
  test/main/helperFdaMatrixAuditScript.test.ts` passed after implementation:
  2 files, 11 tests.
- `pnpm audit:helper-fda-matrix` printed `status: "blocked"`,
  `targetMacOS: "pending"`, `passedScenarioCount: 0`, and exited 1 as intended.
- Direct `--out` check wrote `/tmp/luie-helper-audit-b25/fda-matrix.json`;
  the file parsed as JSON and retained `status: "blocked"`,
  `targetMacOSReady: false`, six missing passed scenarios, and six scenarios
  missing evidence.
- `bun run scripts/audit-helper-fda-matrix.ts --out` failed explicitly with
  `--out requires an output file path`.
- `pnpm test` passed: 47 files, 226 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-preflight` printed `status: "blocked"` and exited 0.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.
- Sub-agent review found no Critical or Important issues. Minor feedback about
  `--out` error consistency and CLI ready/missing-argument coverage was
  addressed.

External blockers still missing:

- Full FDA validation matrix on the target macOS version.
- Installed privileged helper ServiceManagement evidence.
- Production XPC peer identity validation with a real Team ID.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase makes FDA validation blockers independently auditable and
  file-retainable.
- It does not record real FDA evidence.
- It does not make helper readiness pass.
- It does not enable helper-backed scan execution by default.

## Phase B26 Helper ServiceManagement Audit

Facts:

- Phase B26 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b26-helper-service-management-audit.md`.
- `src/main/services/helper/macosServiceManagementProbe.ts` now exposes
  `buildHelperServiceManagementAudit`.
- `scripts/audit-helper-service-management.ts` prints ServiceManagement audit
  JSON to stdout.
- `package.json` now exposes `audit:helper-service-management`.
- The ServiceManagement audit supports `--probe-bin <path>` for explicit probe
  binary evidence.
- The ServiceManagement audit supports `--resources-path <path>` for packaged
  resources-path checks.
- The ServiceManagement audit supports `--platform <platform>` for deterministic
  test coverage.
- The ServiceManagement audit supports `--out <path>` and writes the same JSON
  payload to the requested UTF-8 output file.
- The audit reports `status: "ready"` only when the probe reports
  `serviceManagementStatus: "registered"`.
- The audit does not register or unregister the helper.
- No generated audit JSON files are committed.
- Helper readiness gates did not change.
- Current unqualified `pnpm audit:helper-service-management` remains blocked
  because this dev runtime has no Electron `process.resourcesPath` probe
  evidence.
- With `--resources-path resources`, the packaged probe binary is executable and
  resolves, but the current ServiceManagement status is `not-installed` with
  reason `not-found`, so readiness remains blocked.
- The helper remains disabled by default and readiness remains blocked without
  real ServiceManagement registration, production identity, and FDA evidence.

Verification commands run for this Phase B26 slice:

- `pnpm test test/main/macosServiceManagementProbe.test.ts
  test/main/helperServiceManagementAuditScript.test.ts` passed after
  implementation: 2 files, 18 tests.
- `pnpm audit:helper-service-management` printed `status: "blocked"`,
  `probeBinaryReady: false`, `serviceManagementStatus: "not-implemented"`, and
  exited 1 as intended.
- Direct `--resources-path resources --out` check wrote
  `/tmp/luie-helper-audit-b26/service-management.json`; the file parsed as JSON
  and retained `status: "blocked"`, `probeBinaryReady: true`,
  `serviceManagementStatus: "not-installed"`, and reason `not-found`.
- `pnpm test` passed: 48 files, 232 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-fda-matrix` printed `status: "blocked"` and exited 1 as
  intended.
- `pnpm audit:helper-preflight` printed `status: "blocked"` and exited 0.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.
- Sub-agent review found no Critical or Important issues. Minor feedback about
  injected probe path evidence was addressed by requiring executable file
  evidence before reporting `probeBinaryReady: true`.

External blockers still missing:

- Installed privileged helper ServiceManagement registration evidence.
- Full FDA validation matrix on the target macOS version.
- Production XPC peer identity validation with a real Team ID.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase makes ServiceManagement registration blockers independently
  auditable and file-retainable.
- It does not install, register, or unregister the helper.
- It does not make helper readiness pass.
- It does not enable helper-backed scan execution by default.

## Phase B27 Helper Identity Audit

Facts:

- Phase B27 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b27-helper-identity-audit.md`.
- `src/main/services/helper/helperIdentityAudit.ts` now exposes
  `buildHelperIdentityAudit`.
- `scripts/audit-helper-identity.ts` prints identity audit JSON to stdout.
- `package.json` now exposes `audit:helper-identity`.
- The identity audit supports `--project-root <path>` for isolated metadata
  checks.
- The identity audit supports `--team-id <team-id>` and
  `--designated-requirement <requirement>` for explicit production evidence
  checks.
- The identity audit supports `--out <path>` and writes the same JSON payload
  to the requested UTF-8 output file.
- The audit reports `status: "ready"` only when Team ID, designated
  requirement, and listener requirement metadata all match.
- The audit does not invent or record a production Team ID.
- No generated audit JSON files are committed.
- Helper readiness gates did not change.
- Current repo identity remains blocked because Team ID and designated
  requirement are absent, while listener metadata still contains
  `TEAMID_NOT_CONFIGURED`.
- The helper remains disabled by default and readiness remains blocked without
  real ServiceManagement registration, production identity, and FDA evidence.

Verification commands run for this Phase B27 slice:

- `pnpm test test/main/helperIdentityAudit.test.ts
  test/main/helperIdentityAuditScript.test.ts` passed after implementation:
  2 files, 6 tests.
- `pnpm audit:helper-identity` printed `status: "blocked"`,
  `teamIdReady: false`, `designatedRequirementReady: false`,
  `listenerRequirementReady: false`, and exited 1 as intended.
- Direct `--out` check wrote `/tmp/luie-helper-audit-b27/identity.json`; the
  file parsed as JSON and retained `status: "blocked"` with
  `team-id-missing`, `designated-requirement-missing`, and
  `privileged-helper-listener-requirement-missing`.
- `pnpm test` passed: 50 files, 238 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-service-management` printed `status: "blocked"` and
  exited 1 as intended.
- `pnpm audit:helper-fda-matrix` printed `status: "blocked"` and exited 1 as
  intended.
- `pnpm audit:helper-preflight` printed `status: "blocked"` and exited 0.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.

External blockers still missing:

- Production Team ID and designated requirement evidence.
- Listener requirement metadata generated from the production Team ID.
- Installed privileged helper ServiceManagement registration evidence.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase makes identity blockers independently auditable and
  file-retainable.
- It does not record real production identity.
- It does not make helper readiness pass.
- It does not enable helper-backed scan execution by default.

## Phase B28 Helper Readiness Bundle Audit

Facts:

- Phase B28 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b28-helper-readiness-bundle-audit.md`.
- `src/main/services/helper/helperReadinessBundle.ts` now exposes
  `buildHelperReadinessBundle`.
- `scripts/audit-helper-readiness-bundle.ts` prints combined helper readiness
  bundle JSON to stdout.
- `package.json` now exposes `audit:helper-readiness-bundle`.
- The bundle includes identity, FDA matrix, ServiceManagement, preflight, and
  readiness reports in one artifact.
- The bundle supports `--project-root <path>`, `--team-id <team-id>`,
  `--designated-requirement <requirement>`, `--probe-bin <path>`,
  `--resources-path <path>`, `--platform <platform>`, and `--out <path>`.
- The top-level bundle `status` and `canEnableHelperByDefault` are copied from
  the existing helper readiness report.
- The bundle does not invent new readiness rules.
- The bundle does not record production Team ID, designated requirement,
  ServiceManagement registration, or FDA evidence.
- No generated audit JSON files are committed.
- Current bundle output remains `status: "blocked"` and
  `canEnableHelperByDefault: false`.
- Current component statuses are all blocked: identity, FDA matrix,
  ServiceManagement, preflight, and readiness.
- Current top-level blockers are `designated-requirement-missing`,
  `fda-validation-matrix-missing`, `helper-xpc-enumerate-bridge-missing`,
  `packaging-entitlements-missing`, `privileged-helper-executable-missing`,
  `privileged-helper-listener-requirement-missing`,
  `service-management-not-registered`, and `team-id-missing`.
- Helper readiness gates did not change.
- The helper remains disabled by default and readiness remains blocked without
  real ServiceManagement registration, production identity, and FDA evidence.

Verification commands run for this Phase B28 slice:

- `pnpm test test/main/helperReadinessBundle.test.ts
  test/main/helperReadinessBundleScript.test.ts` passed after implementation:
  2 files, 5 tests.
- Direct `--out` check wrote
  `/tmp/luie-helper-audit-b28/readiness-bundle.json`; the file parsed as JSON
  and retained `status: "blocked"`, `canEnableHelperByDefault: false`, all
  component statuses blocked, and 8 readiness blockers.
- `pnpm test` passed: 52 files, 243 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness-bundle` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, all component statuses blocked, and exited
  1 as intended.
- `pnpm audit:helper-identity` printed `status: "blocked"` and exited 1 as
  intended.
- `pnpm audit:helper-service-management` printed `status: "blocked"` and
  exited 1 as intended.
- `pnpm audit:helper-fda-matrix` printed `status: "blocked"` and exited 1 as
  intended.
- `pnpm audit:helper-preflight` printed `status: "blocked"` and exited 0.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.

External blockers still missing:

- Production Team ID and designated requirement evidence.
- Listener requirement metadata generated from the production Team ID.
- Installed privileged helper ServiceManagement registration evidence.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase makes the helper readiness evidence set retainable as one
  bundle.
- It does not make helper readiness pass.
- It does not enable helper-backed scan execution by default.

## Phase B29 Helper XPC Availability Gate

Facts:

- Phase B29 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b29-helper-xpc-availability-gate.md`.
- `src/main/services/helper/helperLifecycle.ts` now marks caller identity and
  full-disk-access checks as pass when registration preflight is ready.
- `src/main/services/helper/macosXpcHelperTransport.ts` now allows
  `healthCheck()` to report `available: true` only after the helper control
  health check succeeds and every XPC availability check is pass.
- `MacOsXpcHelperTransport.getStatus()` remains conservative before control
  health evidence and still reports `available: false`.
- The availability predicate requires ready registration preflight, ready
  lifecycle state, ServiceManagement pass, helper install pass, caller identity
  pass, full-disk-access pass, and XPC channel pass.
- The current repo still reports helper readiness as blocked.
- Helper-backed scans are not enabled by default.
- No production Team ID, designated requirement, FDA, ServiceManagement,
  signing, packaging, or notarization evidence is recorded by this phase.

Verification commands run for this Phase B29 slice:

- `pnpm test test/main/helperClient.test.ts` passed after implementation:
  1 file, 36 tests.
- `pnpm test test/main/helperClient.test.ts test/main/helperScanPlanner.test.ts`
  passed: 2 files, 44 tests.
- `pnpm test` passed: 52 files, 245 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness-bundle` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, all component statuses blocked, and exited
  1 as intended.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.

External blockers still missing:

- Production Team ID and designated requirement evidence.
- Listener requirement metadata generated from the production Team ID.
- Installed privileged helper ServiceManagement registration evidence.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase removes an internal availability blocker that would have kept
  the helper unavailable even after readiness evidence and control health were
  available.
- It still keeps the helper disabled by default in the current repo.
- It does not make helper readiness pass.

## Phase B30 Readiness-Gated Default Helper Transport

Facts:

- Phase B30 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b30-readiness-gated-default-helper-transport.md`.
- `src/main/services/helper/helperClient.ts` now resolves registration preflight
  before choosing the default helper transport.
- Explicit `SCAN_HELPER_TRANSPORT=xpc` support is preserved.
- Without explicit transport override, default XPC transport selection is now
  allowed only on macOS when static registration preflight resolves ready.
- `createDefaultHelperTransport()` now accepts an optional `projectRoot` so
  tests and packaged contexts can evaluate static helper evidence outside cwd.
- The current repo still resolves default helper transport as disabled because
  registration preflight remains blocked.
- ServiceManagement registration and control health still determine actual
  helper availability after XPC transport selection.
- Helper scan planner rules did not change.
- Helper-backed scans are not enabled by default in the current repo.
- No production Team ID, designated requirement, FDA, ServiceManagement,
  signing, packaging, or notarization evidence is recorded by this phase.

Verification commands run for this Phase B30 slice:

- `pnpm test test/main/helperClient.test.ts` passed after implementation:
  1 file, 37 tests.
- `pnpm test test/main/helperClient.test.ts test/main/helperScanPlanner.test.ts`
  passed: 2 files, 45 tests.
- `pnpm test` passed: 52 files, 246 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness-bundle` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, all component statuses blocked, and exited
  1 as intended.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.

External blockers still missing:

- Production Team ID and designated requirement evidence.
- Listener requirement metadata generated from the production Team ID.
- Installed privileged helper ServiceManagement registration evidence.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase removes the manual transport env requirement after static
  helper readiness evidence is ready.
- It still keeps the helper disabled by default in the current repo.
- It does not make helper readiness pass.

## Phase B31 Helper Health Planning

Facts:

- Phase B31 is scoped in
  `docs/superpowers/plans/2026-06-08-phase-b31-helper-health-planning.md`.
- `src/main/services/scan/nativeScanOrchestrator.ts` now probes helper
  `healthCheck()` before planning only for exact deep macOS scan stages.
- Quick, preview, responsive, and non-macOS scans still avoid helper selection
  through the existing planner gates.
- Planning now uses one captured platform value for both helper health probing
  and helper plan resolution.
- The helper planner rules did not change.
- Registration preflight blockers still force native fallback.
- Current repo helper readiness remains blocked.
- Helper-backed production scans remain blocked on external production evidence.

Verification commands run for this Phase B31 slice:

- `pnpm test test/main/nativeScanOrchestrator.test.ts` passed after
  implementation and review feedback: 1 file, 19 tests.
- `pnpm test test/main/nativeScanOrchestrator.test.ts
  test/main/helperClient.test.ts test/main/helperScanPlanner.test.ts` passed:
  3 files, 64 tests.
- `pnpm test` passed: 52 files, 249 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness-bundle` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, all component statuses blocked, and exited
  1 as intended.
- `pnpm audit:helper-readiness` printed `status: "blocked"`,
  `canEnableHelperByDefault: false`, and exited 1 as intended.

External blockers still missing:

- Production Team ID and designated requirement evidence.
- Listener requirement metadata generated from the production Team ID.
- Installed privileged helper ServiceManagement registration evidence.
- Full FDA validation matrix on the target macOS version.
- Production signing, packaging, and notarization evidence.

Cold assessment:

- This mini phase connects B29 health-based availability to real scan planning.
- It still keeps helper-backed production scans blocked in the current repo.
- It does not make helper readiness pass.

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

## Phase B32 Helper Entry Adapter Exactness

Date: 2026-06-08

Facts:

- Helper `entry_batch` events now omit `symlink` and `other` entries at the
  main-process adapter boundary before native aggregation.
- Helper `file` entries still map to counted size observations.
- Helper `dir` entries still map to zero-size, zero-count directory visibility
  markers.
- This matches the Rust native scanner policy that skips symlinks and
  non-file/non-directory entries before metadata aggregation.
- This phase does not change helper readiness gates, helper transport defaults,
  helper registration, signing, notarization, or FDA evidence.
- Production helper-backed scans remain blocked in the current repository.

Verification:

- `pnpm test test/main/helperEventAdapter.test.ts` passed, 1 file and 8 tests.
- `pnpm test test/main/helperEventAdapter.test.ts test/main/nativeScanOrchestrator.test.ts`
  passed, 2 files and 27 tests.
- `pnpm test` passed, 52 files and 251 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness-bundle` and `pnpm audit:helper-readiness`
  remain intentionally blocked with `canEnableHelperByDefault: false`.

Interpretation:

- This improves helper result exactness.
- It is not evidence that the privileged helper is ready for default production
  scanning.

## Phase B33 Helper Readiness Evidence State

Date: 2026-06-08

Facts:

- Helper readiness evidence now distinguishes `artifactReady`,
  `confirmationReady`, and `effectiveReady` for registration/preflight-backed
  evidence items.
- The standalone readiness audit and readiness bundle now pass preflight
  artifact/confirmation/effective evidence into the readiness report.
- The current repo shows local artifacts for packaging entitlements,
  privileged helper executable, and XPC enumerate bridge, but the required
  explicit approval inputs are still missing.
- `canEnableHelperByDefault` remains `false`.
- Helper readiness remains blocked.

Verification:

- RED was confirmed with focused tests before implementation.
- `pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundle.test.ts`
  passed, 3 files and 13 tests.
- `pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts`
  passed, 4 files and 16 tests.
- `pnpm audit:helper-readiness` and `pnpm audit:helper-readiness-bundle`
  remain intentionally blocked and now show artifact/confirmation/effective
  state on readiness evidence.
- `pnpm test` passed, 52 files and 253 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.

Interpretation:

- This phase reduces ambiguity in the helper readiness blockers.
- It does not satisfy production Team ID, designated requirement,
  ServiceManagement registration, FDA validation, signing, packaging approval,
  or notarization evidence.

## Phase B34 Helper Readiness CLI Probe Options

Date: 2026-06-08

Facts:

- `audit-helper-readiness` now accepts `--platform`, `--resources-path`, and
  `--probe-bin`.
- The standalone readiness audit can now reproduce ServiceManagement probe
  evidence the same way the ServiceManagement and readiness-bundle audit scripts
  can.
- Tests cover explicit probe binary and explicit packaged resources path
  behavior.
- Readiness semantics are unchanged: ServiceManagement remains blocked unless
  the probe reports `registered`.
- `canEnableHelperByDefault` remains `false`.

Verification:

- RED was confirmed before implementation: explicit probe CLI options still
  produced `serviceManagementStatus: "not-implemented"`.
- `pnpm test test/main/helperReadinessAuditScript.test.ts` passed, 1 file and
  4 tests.
- `pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundle.test.ts test/main/helperReadinessBundleScript.test.ts`
  passed, 4 files and 18 tests.
- `pnpm audit:helper-readiness` and `pnpm audit:helper-readiness-bundle`
  remain intentionally blocked.
- `pnpm test` passed, 52 files and 255 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.

Interpretation:

- This phase improves helper readiness audit reproducibility.
- It does not prove that the privileged helper is installed, approved, or ready
  for default production scanning.

## Phase B35 Helper ServiceManagement Control Script

Date: 2026-06-08

Facts:

- Added `scripts/control-helper-service-management.ts`.
- Added package script `control:helper-service-management`.
- The script supports `--operation register|unregister`, `--confirm`,
  `--platform`, `--resources-path`, `--probe-bin`, `--project-root`, and
  `--out`.
- The script refuses to call register/unregister without `--confirm`.
- Confirmed `register` is blocked before invoking the controller when install
  preflight evidence is missing.
- Confirmed `unregister` can invoke the ServiceManagement controller and report
  the controller result.
- This phase does not auto-register the helper from readiness audits and does
  not change helper default activation.

Verification:

- RED was confirmed before implementation because the control script did not
  exist.
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
  and `pnpm audit:helper-readiness-bundle` remain intentionally blocked.
- Sub-agent review found no Critical, Important, or Minor issues.

Interpretation:

- This phase adds a safer manual path for producing ServiceManagement
  register/unregister evidence.
- It does not prove the helper is installed or approved on the current machine.

## Phase B36 Helper FDA Recorder CLI Options

Date: 2026-06-08

Facts:

- `record-helper-fda-scenario` now supports `--project-root`.
- `record-helper-fda-scenario` now supports `--out` through the shared audit
  output helper.
- `--list` also respects the selected project root.
- Tests record and list FDA matrix data only under temporary project roots.
- The real `docs/helper-fda-validation-matrix.json` remains pending and is not
  marked ready.

Verification:

- RED was confirmed before implementation because the old recorder ignored
  `--project-root`, did not write `--out`, and read the real repo matrix for
  `--list`.
- The RED run briefly modified the real FDA matrix as a test side effect; this
  was restored before commit.
- `pnpm test test/main/helperFdaScenarioRecorderScript.test.ts` passed, 1 file
  and 3 tests.
- `pnpm test test/main/helperFdaScenarioRecorderScript.test.ts test/main/helperFdaValidationMatrix.test.ts test/main/helperFdaMatrixAuditScript.test.ts`
  passed, 3 files and 14 tests.
- `pnpm audit:helper-fda-matrix` remains intentionally blocked with
  `targetMacOS: "pending"` and zero passed scenarios.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  remains intentionally blocked.
- Initial `pnpm test` surfaced recurring ServiceManagement probe timeout
  failures unrelated to the FDA recorder change. Focused ServiceManagement
  tests passed, and rerunning `pnpm test` passed with 54 files and 261 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.

Interpretation:

- This phase makes FDA validation evidence recording safer to rehearse and
  easier to audit.
- It does not complete the FDA validation matrix or enable helper production
  scanning.

## Phase B37 ServiceManagement Probe Timeout

Date: 2026-06-08

Facts:

- The default ServiceManagement command probe timeout was raised from 2 seconds
  to 10 seconds.
- The timeout now has a named constant:
  `MACOS_SERVICE_MANAGEMENT_PROBE_TIMEOUT_MS`.
- Explicit `timeoutMs` options still override the default.
- ServiceManagement readiness semantics are unchanged.
- Helper default activation remains disabled.

Verification:

- RED was confirmed before implementation: focused tests expected 10 seconds
  while production still used 2 seconds.
- `pnpm test test/main/macosServiceManagementProbe.test.ts` passed, 1 file and
  15 tests.
- `pnpm test test/main/macosServiceManagementProbe.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperClient.test.ts`
  passed, 4 files and 60 tests.
- `pnpm test` passed, 54 files and 262 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  and `pnpm audit:helper-readiness-bundle` remain intentionally blocked.
- Sub-agent review found no Critical, Important, or Minor issues.

Interpretation:

- This phase reduces false `not-implemented` ServiceManagement evidence caused
  by short command timeouts under parallel test or system load.
- It does not prove helper registration, approval, or production scan readiness.

## Phase B38 Helper Preflight Project Root

Date: 2026-06-08

Facts:

- `audit-helper-preflight` now accepts `--project-root <path>`.
- The script passes the selected project root into the existing
  `buildHelperPreflightAudit` path.
- `--project-root` without a value now fails explicitly with
  `missing value for --project-root`.
- `--project-root` followed by another option, such as `--out`, also fails as a
  missing value.
- Existing `--out` behavior is preserved.
- Preflight readiness semantics are unchanged.
- Helper default activation remains disabled.

Verification so far:

- RED was confirmed before implementation:
  - the script read real repo listener metadata instead of temporary
    `--project-root` metadata;
  - `--project-root` without a value exited `0` instead of failing.
- `pnpm test test/main/helperPreflightAuditScript.test.ts test/main/helperPreflightAudit.test.ts`
  passed, 2 files and 11 tests.
- `pnpm test test/main/helperPreflightAuditScript.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperFdaMatrixAuditScript.test.ts`
  passed, 5 files and 18 tests.
- `pnpm test` passed, 55 files and 265 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  and `pnpm audit:helper-readiness-bundle` remain intentionally blocked.
- Sub-agent review found no Critical issues. One Important CLI edge case was
  fixed before commit: option-looking `--project-root` values are now rejected.

Interpretation:

- This phase makes preflight evidence reproducible against isolated or packaged
  project roots, matching the other helper audit scripts.
- It does not provide production Team ID, designated requirement, FDA, or
  ServiceManagement evidence.

## Phase B39 Privileged Helper Build Project Root

Date: 2026-06-08

Facts:

- `build-macos-privileged-helper` now accepts `--project-root <path>`.
- The selected project root is used for:
  - `native/macos-helper/privileged-helper/main.swift`;
  - `native/macos-helper/privileged-helper/enumerateTraversal.swift`;
  - `resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper`;
  - the generated `.requirement.json` listener metadata;
  - `.tmp/swift-module-cache`;
  - `.tmp/swift-generated/privileged-helper-main.swift`.
- The actual `swiftc` compile input is the selected root's generated Swift
  source, not a second generated copy under `/tmp`.
- When `--project-root` is absent, the script keeps using `process.cwd()`.
- `--project-root` without a value now fails explicitly with
  `missing value for --project-root`.
- Helper signing/readiness semantics are unchanged.
- Helper default activation remains disabled.

Verification so far:

- RED was confirmed before implementation:
  - the script ignored `--project-root` and did not write helper artifacts under
    the explicit artifact root;
  - `--project-root` without a value exited `0` instead of failing.
- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` passed, 1 file and 9
  tests.
- `pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperPreflightAuditScript.test.ts`
  passed, 4 files and 19 tests.
- `pnpm test` passed, 55 files and 268 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  and `pnpm audit:helper-readiness-bundle` remain intentionally blocked.
- Sub-agent review found no Critical issues. One Important issue was fixed:
  the script no longer compiles a second generated Swift source outside the
  selected project root.
- Follow-up sub-agent review found no Critical, Important, or Minor issues.

Interpretation:

- This phase lets privileged helper executable and listener requirement metadata
  generation be rehearsed in isolated roots without writing into the live repo.
- It does not provide a production Team ID or prove production helper
  installation/readiness.

## Phase B40 Helper XPC Enumerate Build Project Root

Date: 2026-06-08

Facts:

- `build-macos-helper-xpc-enumerate` now accepts `--project-root <path>`.
- The selected project root is used for:
  - `native/macos-helper/xpc-enumerate/main.swift`;
  - `resources/bin/helper-xpc-enumerate-macos`;
  - `.tmp/swift-module-cache`.
- When `--project-root` is absent, the script keeps using `process.cwd()`.
- `--project-root` without a value, or followed by another option-looking
  value, fails explicitly with `missing value for --project-root`.
- Helper XPC enumerate bridge protocol/readiness semantics are unchanged.
- Helper default activation remains disabled.

Verification so far:

- RED was confirmed before implementation:
  - the script ignored `--project-root` and did not write
    `helper-xpc-enumerate-macos` under the explicit artifact root;
  - missing-value forms exited `0` instead of failing.
- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` passed, 1 file and 12
  tests.
- `pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperReadinessAudit.test.ts`
  passed, 4 files and 26 tests.
- `pnpm test` passed, 55 files and 271 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  and `pnpm audit:helper-readiness-bundle` remain intentionally blocked.
- Sub-agent review reported no Critical, Important, or Minor findings. The
  review was static and did not rerun tests.

Interpretation:

- This phase lets the app-side helper XPC enumerate bridge artifact be rehearsed
  in isolated roots without writing into the live repo.
- It does not provide production approval evidence or enable helper scanning by
  default.

## Phase B41 ServiceManagement Probe Build Project Root

Date: 2026-06-08

Facts:

- `build-macos-service-management-probe` now accepts `--project-root <path>`.
- The selected project root is used for:
  - `native/macos-helper/service-management-probe/main.swift`;
  - `resources/bin/service-management-probe-macos`;
  - `.tmp/swift-module-cache`.
- When `--project-root` is absent, the script keeps using `process.cwd()`.
- `--project-root` without a value, or followed by another option-looking
  value, fails explicitly with `missing value for --project-root`.
- ServiceManagement probe/readiness semantics are unchanged.
- No helper register/unregister action is performed.
- Helper default activation remains disabled.

Verification so far:

- RED was confirmed before implementation:
  - the script ignored `--project-root` and did not write
    `service-management-probe-macos` under the explicit artifact root;
  - missing-value forms exited `0` instead of failing.
- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` passed, 1 file and 15
  tests.
- `pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/macosServiceManagementProbe.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperReadinessAuditScript.test.ts`
  passed, 4 files and 38 tests.
- `pnpm test` passed, 55 files and 274 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  and `pnpm audit:helper-readiness-bundle` remain intentionally blocked.

Interpretation:

- This phase lets the ServiceManagement probe artifact be rehearsed in isolated
  roots without writing into the live repo.
- It does not provide real ServiceManagement registration or approval evidence.

## Phase B42 Helper Control Build Project Root

Date: 2026-06-08

Facts:

- `build-macos-helper-control` now accepts `--project-root <path>`.
- The selected project root is used for:
  - `native/macos-helper/control/main.swift`;
  - `resources/bin/helper-control-macos`;
  - `.tmp/swift-module-cache`.
- When `--project-root` is absent, the script keeps using `process.cwd()`.
- `--project-root` without a value, or followed by another option-looking
  value, fails explicitly with `missing value for --project-root`.
- Helper control protocol/readiness semantics are unchanged.
- No helper register/unregister action is performed.
- Helper default activation remains disabled.

Verification so far:

- RED was confirmed before implementation:
  - the script ignored `--project-root` and did not write
    `helper-control-macos` under the explicit artifact root;
  - missing-value forms exited `0` instead of failing.
- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` passed, 1 file and 18
  tests.
- `pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperClient.test.ts test/main/helperServiceManagementControlScript.test.ts test/main/helperPackaging.test.ts`
  passed, 4 files and 66 tests.
- `pnpm test` passed, 55 files and 277 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  and `pnpm audit:helper-readiness-bundle` remain intentionally blocked.

Interpretation:

- This phase lets the helper control command artifact be rehearsed in isolated
  roots without writing into the live repo.
- It does not provide real helper registration, approval, or readiness evidence.

## Phase B43 Helper Enumerate Build Project Root

Date: 2026-06-08

Facts:

- `build-macos-helper-enumerate` now accepts `--project-root <path>`.
- The selected project root is used for:
  - `native/macos-helper/enumerate/main.swift`;
  - `resources/bin/helper-enumerate-macos`;
  - `.tmp/swift-module-cache`.
- When `--project-root` is absent, the script keeps using `process.cwd()`.
- `--project-root` without a value, or followed by another option-looking
  value, fails explicitly with `missing value for --project-root`.
- Helper enumerate protocol/traversal/readiness semantics are unchanged.
- Helper default activation remains disabled.

Verification so far:

- RED was confirmed before implementation:
  - the script ignored `--project-root` and did not write
    `helper-enumerate-macos` under the explicit artifact root;
  - missing-value forms exited `0` instead of failing.
- `pnpm test test/main/macosPrivilegedHelperCli.test.ts` passed, 1 file and 21
  tests.
- `pnpm test test/main/macosPrivilegedHelperCli.test.ts test/main/helperPackaging.test.ts test/main/macosHelperEnumerateCli.test.ts test/main/helperClient.test.ts`
  passed, 4 files and 73 tests.
- `pnpm test` passed, 55 files and 280 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  and `pnpm audit:helper-readiness-bundle` remain intentionally blocked.

Interpretation:

- This phase lets the standalone helper enumerate artifact be rehearsed in
  isolated roots without writing into the live repo.
- It does not provide real helper registration, approval, FDA evidence, or
  default helper scanning.

## Phase B44 ServiceManagement Control Option Values

Date: 2026-06-08

Facts:

- `control-helper-service-management` now rejects option-looking values for
  valued CLI options.
- `--project-root --resources-path <path>` fails explicitly with
  `missing value for --project-root`.
- `--probe-bin --resources-path <path>` fails explicitly with
  `missing value for --probe-bin`.
- Shared audit `--out` parsing now rejects option-looking values with
  `--out requires an output file path`.
- Existing confirmation, register/unregister, preflight, and readiness
  semantics are unchanged.
- Helper default activation remains disabled.

Verification so far:

- RED was confirmed before implementation:
  - option-looking values were consumed as ordinary values;
  - the script returned structured blocked output with empty stderr instead of
    a missing-value error.
- A sub-agent review found that shared `--out` parsing had the same
  option-looking value gap; RED coverage was added before fixing it.
- `pnpm test test/main/helperServiceManagementControlScript.test.ts` passed, 1
  file and 5 tests.
- `pnpm test test/main/helperAuditOutput.test.ts test/main/helperServiceManagementControlScript.test.ts`
  passed, 2 files and 11 tests after the `--out` parser fix.
- `pnpm test test/main/helperServiceManagementControlScript.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/macosServiceManagementProbe.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts`
  passed, 5 files and 31 tests.
- `pnpm test test/main/helperAuditOutput.test.ts test/main/helperServiceManagementControlScript.test.ts test/main/helperServiceManagementAuditScript.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperFdaMatrixAuditScript.test.ts`
  passed, 8 files and 33 tests after the shared `--out` parser fix.
- `pnpm test` passed, 55 files and 284 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  and `pnpm audit:helper-readiness-bundle` remain intentionally blocked.
- Follow-up sub-agent review reported no Critical, Important, or Minor
  findings after the shared `--out` parser fix. The review was static and did
  not rerun tests.

Interpretation:

- This phase closes another ambiguous helper control CLI input path before real
  ServiceManagement registration is attempted.
- It does not provide ServiceManagement registration, production identity, FDA
  evidence, or default helper scanning.

## Phase B45 Readiness Pass Evidence Completeness

Date: 2026-06-08

Facts:

- `buildHelperReadinessReport` now emits pass evidence for every preflight/FDA
  gate when the readiness report has no blockers.
- Ready pass evidence includes:
  - team ID;
  - designated requirement;
  - packaging entitlements;
  - privileged helper executable;
  - listener requirement metadata;
  - FDA validation matrix;
  - XPC enumerate bridge;
  - ServiceManagement registration.
- Blocked readiness reports keep their existing blocker-focused evidence shape.
- `canEnableHelperByDefault` remains `false`.
- Helper default activation remains disabled.

Verification so far:

- RED was confirmed before implementation:
  - a fully ready report emitted only `service-management` pass evidence.
- The first implementation was narrowed after focused tests showed it added
  pass evidence to blocked reports too.
- `pnpm test test/main/helperReadinessAudit.test.ts` passed, 1 file and 8
  tests.
- `pnpm test test/main/helperReadinessAudit.test.ts test/main/helperReadinessBundle.test.ts test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperPreflightAudit.test.ts test/main/helperRegistration.test.ts`
  passed, 6 files and 40 tests.
- Initial `pnpm test` failed with timeout/resource symptoms across unrelated
  files; those failed files passed in focused groups, and a second `pnpm test`
  passed, 55 files and 284 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  and `pnpm audit:helper-readiness-bundle` remain intentionally blocked.
- Sub-agent review reported no Critical, Important, or Minor findings. The
  review was static and did not rerun tests.

Interpretation:

- This phase makes future ready helper audits prove every readiness gate that
  passed, instead of only reporting ServiceManagement success.
- It does not remove the current external blockers or enable default helper
  scanning.

## Phase B46 Readiness CLI Identity Root Options

Date: 2026-06-08

Facts:

- `audit-helper-readiness` now accepts `--project-root <path>`.
- `audit-helper-readiness` now accepts `--team-id <team-id>` and
  `--designated-requirement <requirement>`.
- Explicit identity options are overlaid into the audit environment for that
  script invocation only.
- The explicit project root is used for preflight evidence and registration
  input resolution.
- `--project-root`, `--team-id`, and `--designated-requirement` reject missing
  or option-looking values.
- Readiness semantics, ServiceManagement probing semantics, and
  `canEnableHelperByDefault: false` are unchanged.
- Helper default activation remains disabled.

Verification so far:

- RED was confirmed before implementation:
  - explicit identity/root options were ignored;
  - `--project-root` missing values did not produce a missing-value error.
- `pnpm test test/main/helperReadinessAuditScript.test.ts` passed, 1 file and
  9 tests.
- `pnpm test test/main/helperReadinessAuditScript.test.ts test/main/helperReadinessBundleScript.test.ts test/main/helperIdentityAuditScript.test.ts test/main/helperPreflightAuditScript.test.ts test/main/helperReadinessAudit.test.ts test/main/helperReadinessBundle.test.ts test/main/helperRegistration.test.ts`
  passed, 7 files and 44 tests.
- `pnpm test` passed, 55 files and 289 tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- `cargo test --manifest-path native/scanner/Cargo.toml` passed. Existing Rust
  dead-code warnings remain.
- `pnpm audit:helper-readiness --platform darwin --resources-path resources`
  and `pnpm audit:helper-readiness-bundle` remain intentionally blocked.
- Sub-agent review reported no Critical, Important, or Minor findings. The
  review was static and did not rerun tests.

Interpretation:

- This phase lets the single readiness audit CLI rehearse production identity
  and metadata evidence in isolated roots, matching the readiness bundle path.
- It does not remove current FDA, artifact approval, or ServiceManagement
  blockers, and it does not enable default helper scanning.
