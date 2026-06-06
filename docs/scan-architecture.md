# Scan Architecture

This document fixes the current scan pipeline before further refactoring. It is
based on the current codebase, not on intended behavior.

## Current Pipeline

The active UI path starts in `src/renderer/src/hooks/useScanLogic.ts`.

```text
Renderer useScanLogic
  -> preload electronAPI.scanStart
  -> main registerIpcHandlers
  -> ScanManager.start
  -> DiskScanService.startScan
  -> DiskScanService.runScan
  -> native_rust: NativeScanOrchestrator.runStage
  -> native/scanner Rust process
  -> stdout JSON line events
  -> nativeRustScannerClient.parseNativeScannerLine
  -> DiskScanService.createNativeStageHandlers
  -> ScanPolicyService + ScanAggregator + ScanEventBus
  -> renderer event listeners
```

`DiskScanService.startScan` owns scan creation. It resolves root path policy,
creates a `ScanJob`, attaches a `ScanAggregator`, selects native or portable
engine, and starts async execution.

`ScanManager` owns UI-facing lifecycle gates. It prevents concurrent starts and
keeps an independent `ScanLifecycleState` map.

`ScanEventBus` owns event fan-out and derives progress, coverage, diagnostics,
perf samples, quick-ready, and terminal events from the mutable `ScanJob`.

## Current Native Protocol

The native scanner is not a Node addon. It is a Rust executable launched by
`createNativeScannerSession`.

Main process sends JSON lines to stdin:

- `start`: starts one quick or deep stage.
- `pause`: sets the shared pause flag.
- `resume`: clears the shared pause flag.
- `cancel`: sets the shared cancel flag.

Rust sends JSON lines to stdout:

- `agg`: single aggregate item.
- `agg_batch`: aggregate item batch.
- `progress`: scanned count, queued directory count, elapsed time, current path.
- `coverage`: blocked/skipped counters and elevation flag.
- `diagnostics`: files/sec, stage time, queue depth, hot path, policy counters.
- `elevation_required`: first permission-gated path for the stage.
- `quick_ready`: quick-stage readiness signal.
- `warn`: recoverable scanner warning.
- `done`: terminal stage signal.

The TypeScript parser clamps malformed counters and ignores unknown lines. A
native stage is considered complete only after `done`.

## Current Scan Modes

`resolveScanIntent` reduces scan inputs to two semantic modes:

- `preview`: `accuracyMode = preview`, `deepPolicyPreset = responsive`.
- `exact`: `accuracyMode = full`, `deepPolicyPreset = exact`.

The renderer currently calls `startScanForPath(..., "exact")` for normal scan
actions and always sends `scanMode = native_rust`, `elevationPolicy = manual`,
and `allowNodeFallback = false`.

That makes the common path an exact native scan. In exact mode,
`resolveScanOptions` sets `deepBudgetMs = 0`, and the Rust scanner only enforces
a time limit when `timeBudgetMs > 0`. Therefore the current common path has an
unbounded deep stage.

## Current Permission Model

Path policy is split across these files:

- `src/shared/domain/pathPolicy.ts`: protected path lists and path matching.
- `src/main/core/securityPolicy.ts`: preflight root evaluation and effective
  access probing.
- `src/main/services/scan/scanTraversalPolicy.ts`: TypeScript traversal skips
  and native skip-prefix generation.
- `native/scanner/src/scan/aggregate/policy.rs`: Rust traversal skips.
- `src/main/services/security/macosPrivilegeHelper.ts`: macOS settings opener
  and readable probe.

The preflight gate computes `EffectivePathAccess`, including
`deniedPermissionRoots`. `NativeScanOrchestrator` passes those denied roots to
Rust as `permissionPrefixes`. Rust treats those prefixes as blocked and emits
permission coverage/elevation events.

The current helper can open macOS Full Disk Access settings and can report
whether a target is readable. It does not update an active native stage after
permission is granted.

## Current State Ownership

State is real, but ownership is fragmented.

- `DiskScanService.jobs`: mutable execution state and scan data.
- `ScanJob`: counters, flags, aggregator, classifier, engine, stage, options.
- `ScanManager.scanStates`: separate lifecycle gate state.
- `ScanEventBus`: derives event state from `ScanJob` and mutates event timers.
- `useScanLogic`: renderer state, pending visual deltas, warning summary,
  active root, scan terminal, elevation state.

The target architecture must keep a single authoritative state transition model
for scan lifecycle and separate it from rendering/cache/aggregation state.

## Current Hotspots

Code graph inspection identified these current hotspots:

- `DiskScanService`: scan creation, engine selection, fallback, native event
  handling, portable dependencies, stat task scheduling, finalization.
- `native/scanner/src/scan/aggregate/walker.rs::run_bfs_scan`: queue walking,
  policy checks, metadata dispatch, estimate handling, event emission, timeout,
  pause, and cancel.
- `scanTraversalPolicy.ts` and Rust `policy.rs`: duplicated skip and protected
  traversal rules.
- `useScanLogic`: renderer state, start request shaping, event ingestion,
  visual batching, elevation handling, and window actions.

## Target Architecture

The scanner should move toward these boundaries:

```text
shared scan contract
  -> intent normalization
  -> permission/access plan
  -> traversal policy plan

main scan app service
  -> scan lifecycle state machine
  -> engine selection
  -> permission reconciliation
  -> event publication

native scanner adapter
  -> process lifecycle
  -> JSON protocol validation
  -> stage execution

native scanner core
  -> planner
  -> walker
  -> metadata reader
  -> emitter
```

The common UI path should start with `preview-first` responsive scan. Exact scan
must remain available as explicit recheck, not as the default start action.

Permission approval must trigger an effective-access refresh. After refresh, the
scanner must either resume with a new access plan or rescan affected roots. It
must not keep using stale `deniedPermissionRoots`.

## Refactoring Rules

1. Write or update tests before changing behavior.
2. Keep `preview` and `exact` behavior explicit in tests.
3. Move policy constants into a shared contract before deleting duplicate logic.
4. Keep Rust protocol backward compatible until both sides are changed.
5. Split Rust `run_bfs_scan` by extracting pure planning/policy helpers first,
   then move side-effecting walker/metadata/emitter responsibilities.
6. Treat macOS permission behavior as a state transition:
   `required -> settings opened -> readable probe -> access plan refreshed`.
7. Do not claim performance improvement from structural changes without a
   measured benchmark or smoke run.

## Known Gaps

- No current benchmark proves parity with CleanMyMac or any external tool.
- No current unit tests cover the Rust scanner protocol end to end.
- No current test proves permission approval recomputes `deniedPermissionRoots`.
- No current architecture test prevents the renderer from forcing exact scans.
