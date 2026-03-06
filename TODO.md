# Scan Refactor TODO

## P0 Stability

- [x] Remove `Finalizing...` deadlock
- [x] Add explicit scan completion event
- [x] Clear `scanId` in renderer on completion
- [x] Verify `LandingView -> VisualizationView` transition after completion
- [x] Add completion/cancel/failure state transition coverage
- [x] Remove startup-time `~/Library` permission prompt
- [x] Change default `optInProtected` to `false`
- [x] Remove default `elevationPolicy: "auto"`
- [x] Request permission only when the user actually chooses a protected path
- [x] Stop repeated permission UX in dev/preview flows
- [x] Redesign protected path policy
- [x] Split `~/Library` handling into narrower subpaths
- [x] Separate `absolute block`, `opt-in required`, and `soft-skip` responsibilities
- [x] Separate FDA-required paths from the removed helper-based flow

## P1 Structure

- [x] Decide whether the privilege helper should be wired into the scan path
- [x] Remove helper install/status code because the helper was not actually used
- [x] Resolve the "native exists but is effectively unused" state
- [x] Finish decomposing `diskScanService.ts`
- [x] Extract `PortableScanService`
- [x] Extract `NativeScanOrchestrator`
- [x] Extract `ScanPolicyService`
- [x] Extract `ScanProgressEmitter`
- [x] Extract `ScanDiagnosticsEmitter`
- [x] Decompose `aggregate.rs`
- [x] Extract walker module from `aggregate.rs`
- [x] Extract policy filter from `aggregate.rs`
- [x] Extract metadata batch processor from `aggregate.rs`
- [x] Extract progress/coverage emitter from `aggregate.rs`
- [x] Extract path normalization utilities from `aggregate.rs`
- [x] Reorganize `shared/platform/domain` boundaries
- [x] Remove preload-side manual coercion duplication where zod schema already exists
- [x] Make platform path rules a single shared-domain source of truth
- [x] Unify renderer/main/native contract types

## P2 Algorithm Consistency

- [x] Define `preview` and `exact` modes unambiguously
- [x] Remove conflicting combinations such as `full + responsive`
- [x] Lock `preview` to fast estimation and `exact` to full traversal without soft-skip
- [x] Replace quick estimates with deep exact values during scan convergence
- [x] Redesign large-directory policy
- [x] Document handling rules for KakaoTalk container, browser storage, caches, and app support
- [x] Document `skip`, `estimate`, and `full traverse` criteria
- [x] Fix UI behavior where the last hot path looks like a stuck path

## Test Expansion

- [x] Add completion event regression coverage
- [x] Add permission request condition coverage
- [x] Add native/helper wiring coverage
- [x] Add deep soft-skip and estimate regression coverage
- [x] Add large container path performance coverage
