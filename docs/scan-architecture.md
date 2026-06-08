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

`resolveScanIntent` still supports two semantic modes:

- `preview`: `accuracyMode = preview`, `deepPolicyPreset = responsive`.
- `exact`: `accuracyMode = full`, `deepPolicyPreset = exact`.

The renderer builds scan requests through `scanRequestFactory.ts`.
The user-facing `SCAN` action uses `buildDefaultScanRequest`, which sends
`performanceProfile = preview-first`, `accuracyMode = preview`, and
`deepPolicyPreset = responsive`. The responsive policy is now the main product
path: known cache, package-manager, build-output, and bundle directories are
represented as folder-level estimated items and are not deeply traversed.

Responsive and exact deep stages both set `deepBudgetMs = 0`, and the Rust
scanner only enforces a time limit when `timeBudgetMs > 0`. The quick pass
remains time-budgeted for fast first paint, while the deep pass is unbounded so
large top-level folders such as `/Users/user` and `/Applications` are not
deferred before their folder-level totals are accounted for.

Filesystem-root scans also use the folder-only blacklist. Native root stages
still disable the same-device restriction so mounted APFS/system volumes are not
silently counted as scope skips. Remaining omissions at `/` should come from OS
permission failures, hard blocked roots, the folder-only blacklist, or an
explicit time budget, and must be reported through coverage counters.

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

Native warnings with `E_PERMISSION` also mark coverage as elevation-required and
emit the same elevation-required event. This matters for filesystem-root scans:
some protected directories are only discovered when traversal reaches them, so
they cannot all be represented as preflight `permissionPrefixes`.

Traversal policy constants now start in `src/shared/domain/scanPolicyContract.ts`.
TypeScript traversal code consumes heavy directory names, package manager skip
names, bundle suffixes, cache prefixes, and responsive soft-skip path rules from
that contract. Native start messages carry `softSkipPathRules` to Rust, so the
Rust scanner no longer owns a separate hard-coded copy of the responsive path
rules.

The current helper can open macOS Full Disk Access settings and can report
whether a target is readable. When permission is granted, main process refreshes
effective access, rebuilds the path classifier, replaces `deniedPermissionRoots`,
and queues roots whose permission block was removed for a native deep rescan
stage. The native stage currently receives the refreshed plan only at a stage
boundary; it does not mutate an already running Rust queue in place.

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
  directory-level policy checks, estimate handling, event flush, timeout,
  pause, and cancel.
- `native/scanner/src/scan/aggregate/entry.rs`: entry-level policy checks and
  file/directory action classification.
- `scanTraversalPolicy.ts` and Rust `policy.rs`: policy execution is split by
  language, but responsive path-rule data is centralized in the shared contract
  and passed over the native protocol.
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

The common UI path starts with a single `SCAN` action using the `preview-first`
responsive policy. Separate exact actions are not part of the default UI.

Permission approval must trigger an effective-access refresh. After refresh, the
scanner must either resume with a new access plan or rescan affected roots. It
must not keep using stale `deniedPermissionRoots`.

## Refactoring Rules

1. Write or update tests before changing behavior.
2. Keep `preview` and `exact` behavior explicit in tests.
3. Move policy constants into a shared contract before deleting duplicate logic.
4. Keep Rust protocol backward compatible until both sides are changed.
5. Continue shrinking Rust `run_bfs_scan` after the first split into planner,
   policy, entry classifier, metadata reader, and emitter modules.
6. Treat macOS permission behavior as a state transition:
   `required -> settings opened -> readable probe -> access plan refreshed`.
7. Do not claim performance improvement from structural changes without a
   measured benchmark or smoke run.

## Performance Baseline

`scripts/bench-native-scan.ts` creates a repeatable local fixture under
`.tmp-tests/native-bench-fixture` and runs the native scanner against it. Use:

```bash
SCAN_BENCH_RUNS=3 bun run bench:native-scan
```

By default the benchmark builds the debug native scanner first. Set
`SCAN_BENCH_SKIP_BUILD=1` only when intentionally measuring an existing binary.

Current local smoke result after the metadata and entry-classifier pass:

- Binary: `native/scanner/target/debug/diskviz-scanner`
- Fixture entries scanned: `4344`
- Three-run wall time: average `111ms`, median `50ms`
- Rust reported elapsed time: `34-48ms`
- Result: exact, not estimated

This is a local regression baseline only. It does not prove parity with
CleanMyMac or any external scanner.

## Known Gaps

- No current benchmark proves parity with CleanMyMac or any external tool.
- Permission refresh is verified at the access-plan level, but no integration
  test simulates macOS granting permission while a native stage is already
  running.
- The benchmark fixture is synthetic and small; it is useful for regression, not
  for real whole-disk performance claims.
