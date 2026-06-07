# Pre-Helper Architecture Stabilization Design

Date: 2026-06-07

## Status

Ready for review before implementation planning.

This document defines the phase that must be completed before privileged helper
execution can be considered safe to continue. It is based on:

- `docs/project-status-audit.md`
- `docs/superpowers/specs/2026-06-06-phase-c-final-audit.md`
- `docs/superpowers/specs/2026-06-06-helper-threat-model-protocol.md`
- current local worktree state on 2026-06-07

## Goal

Stabilize the architecture before continuing privileged-helper work. The phase
ends only when the four audit areas below are complete enough that adding helper
execution will not increase existing architectural coupling.

The four areas are:

1. Phase B helper gate readiness.
2. Architecture and LOC hotspot reduction.
3. `src/shared` contract stability.
4. Test reliability for the helper-preparation boundary.

## Non-Goals

- Do not enable privileged helper execution by default.
- Do not add delete, cleanup, write, chmod, chown, or arbitrary command helper
  operations.
- Do not move scan policy ownership into the helper.
- Do not move main-process orchestration or renderer state into `src/shared`.
- Do not chase a full repository rewrite.
- Do not claim CleanMyMac parity.

## Priority Rule

Architecture contamination prevention is the first priority.

If a change would make helper readiness better but also increases coupling in
`DiskScanService`, `registerIpcHandlers`, `useScanLogic`, or shared contracts,
the change must be split so the new responsibility lands behind a focused
boundary first.

## Current Facts

- Phase C exact scan semantics are documented as sufficient to proceed toward
  helper design.
- Phase B is not complete.
- The default engine is still the unprivileged Rust native scanner.
- The current helper path is gated by exact deep scan mode, platform, helper
  transport, explicit prototype opt-in, and registration preflight.
- Current uncommitted work hardens helper schema validation and registration
  preflight checks.
- The codebase fails a strict all-production-files-under-500-LOC rule.
- `DiskScanService`, `nativeRustScannerClient`, renderer `helpers.ts`,
  `useScanLogic`, `registerIpcHandlers`, and Rust `run_bfs_scan` are the main
  hotspots.
- `src/shared` is useful as a schema/domain contract layer but is not fully
  runtime-neutral because some shared domain files import `node:path`.
- Current unit and contract tests pass, but they do not prove helper/FDA,
  signing, notarization, or whole-disk performance readiness.

## Phase Exit Criteria

This phase is complete only when all criteria are satisfied.

### 1. Helper Gate Readiness

Required outcomes:

- Helper execution remains disabled by default.
- Helper selection is decided by one small main-process planning boundary.
- Helper registration status, FDA matrix status, identity evidence, and
  prototype transport opt-in are represented as explicit data, not implicit
  checks scattered through scan orchestration.
- Helper fallback reasons are stable enum values that can be tested and logged.
- Production identity gaps stay blocking:
  - production bundle identifier not confirmed
  - Team ID missing
  - expected designated requirement missing
  - listener signing requirement still placeholder
  - FDA matrix not fully passed

Acceptance evidence:

- Tests prove each blocker keeps helper execution unavailable.
- Tests prove exact deep scan can select helper only when every gate is
  satisfied or when the explicit prototype override is active for the intended
  development path.
- Logs expose helper plan and fallback reason without exposing raw privileged
  internals to renderer state.

### 2. Architecture and LOC Hotspot Reduction

Required outcomes:

- New helper work must not add responsibilities to `DiskScanService`.
- `DiskScanService` must move toward scan lifecycle coordination only. At this
  phase, the minimum acceptable improvement is to extract at least one coherent
  responsibility from it without changing scan behavior.
- `nativeRustScannerClient` must separate line parsing/protocol validation from
  process/session lifecycle.
- Renderer `useScanLogic` must not be the place where new helper lifecycle UI
  state accumulates.
- Files over 500 LOC must either be reduced under 500 LOC in this phase or
  documented as explicit temporary exceptions with a named next split. A
  temporary exception is acceptable only when the file does not grow during this
  phase.

Required first splits:

- Extract native scanner protocol parsing from
  `src/main/services/native/nativeRustScannerClient.ts` into a focused module.
- Extract scan finalization or native stage handler construction from
  `DiskScanService` into a focused main-process service.
- Extract renderer scan event subscription from `useScanLogic` into a hook only
  if helper-facing renderer state is added in this phase. If no renderer helper
  state is added, record `useScanLogic` as a temporary exception and keep it
  from growing.

Acceptance evidence:

- Existing tests still pass.
- New tests cover the extracted boundary before production code changes.
- No newly created production file exceeds 300 LOC.
- No existing hotspot grows without an explicit compensating extraction.

### 3. Shared Contract Stability

Required outcomes:

- `src/shared` remains limited to schemas, constants, and pure domain contracts.
- No Electron, filesystem probing, helper lifecycle, scan orchestration, or UI
  state enters `src/shared`.
- Helper protocol schemas stay strict and reject unknown fields.
- Shared policy contracts must be the source of truth for policy data that both
  main and native paths need.
- Any shared module that imports `node:*` must be treated as Electron/Node
  compatible, not browser-neutral.

Acceptance evidence:

- A shared boundary test or static check prevents importing main, renderer, or
  Electron modules from `src/shared`.
- Tests cover helper protocol strictness and volume policy consistency.
- Documentation names which shared modules are browser-neutral and which are
  Node-compatible only.

### 4. Test Reliability

Required outcomes:

- Current unit and contract tests remain green.
- Typecheck and lint remain green.
- Rust tests remain green.
- Rust dead-code warnings are either removed or documented as intentional with
  a cleanup issue in this phase.
- Helper readiness is not inferred from generic unit tests. It must have named
  verification commands or scripts.

Required verification commands for this phase:

```bash
pnpm test
pnpm typecheck
pnpm lint
cargo test --manifest-path native/scanner/Cargo.toml
```

Additional helper readiness checks:

- A script or documented manual checklist must cover:
  - FDA matrix scenario status.
  - SMAppService registration status.
  - helper executable packaging evidence.
  - designated requirement evidence.
  - fallback when helper is unavailable.

Acceptance evidence:

- The helper readiness check reports `blocked` until real identity and FDA
  evidence exist.
- Test documentation clearly states what is proven and what is not proven.

## Architecture Boundaries

### Main Process

Allowed responsibilities:

- Scan lifecycle coordination.
- Engine selection using explicit planner output.
- Permission refresh coordination.
- Event fan-out through existing scan event channels.
- Helper registration and status calls through a dedicated helper boundary.

Disallowed responsibilities:

- Embedding helper transport details in scan lifecycle code.
- Repeating helper protocol validation outside the shared schema and helper
  transport boundary.
- Sending helper-internal state directly to renderer.

### Helper Boundary

Allowed responsibilities:

- Status, health, register, unregister, version, and read-only enumerate calls.
- Mapping helper events into existing native-scan-shaped messages.
- Reporting stable fallback reasons.

Disallowed responsibilities:

- Owning scan policy.
- Owning aggregation.
- Owning renderer state.
- Accepting arbitrary commands or file write paths.

### Shared

Allowed responsibilities:

- IPC channel constants.
- zod schemas.
- scan intent normalization.
- pure path/policy contracts.
- helper protocol contracts.

Disallowed responsibilities:

- Electron APIs.
- Node filesystem reads/writes.
- helper lifecycle side effects.
- process environment reads.
- renderer hooks or UI helpers.

## Implementation Order

The implementation must proceed in this order:

1. Freeze helper gates and add tests around explicit planner decisions.
2. Extract one native protocol boundary from `nativeRustScannerClient`.
3. Extract one scan orchestration responsibility from `DiskScanService`.
4. Recalculate LOC and document remaining temporary exceptions.
5. Add shared boundary checks and shared runtime-neutrality documentation.
6. Add helper readiness verification script or checklist.
7. Re-run full verification and update `docs/project-status-audit.md`.

The order matters because it prevents helper-specific changes from being mixed
into already-large orchestration files.

## Completion Definition

This phase is done only when:

- All four audit areas meet their exit criteria.
- The default helper path remains disabled.
- Full verification commands pass.
- The project status audit is updated with new LOC, architecture, shared, and
  test evidence.
- A reviewer can inspect helper readiness from planner tests and readiness
  output without reading `DiskScanService` internals.

After this phase, the project may continue to privileged helper implementation
only if the helper gate still reports blocked for missing production evidence
and the architecture has a clear boundary for adding the real helper transport.

This means the phase does not end by enabling the helper. It ends by proving
that helper implementation can continue without adding policy, lifecycle, IPC,
or renderer-state responsibilities to existing hotspots.
