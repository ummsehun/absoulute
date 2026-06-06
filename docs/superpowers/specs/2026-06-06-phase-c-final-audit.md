# Phase C Final Audit

Date: 2026-06-06

## Scope

This audit checks whether Phase C has enough evidence to proceed to Phase B
privileged-helper design and implementation.

Source criteria:

- `docs/superpowers/specs/2026-06-06-cleanmymac-style-scanning-design.md`
- current repository state at commit `63853a1` plus this audit document
- current local verification commands listed below

## Verification Commands

All commands below passed on 2026-06-06:

- `bun run lint`
- `bun run test`
- `bun run typecheck`
- `bun run build`
- `cargo test --manifest-path native/scanner/Cargo.toml`
- `SCAN_SMOKE_SKIP_BUILD=1 bun run smoke:native-scan -- /Users/user`

## Acceptance Criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| Preview scan still returns quickly and can be estimated. | Passed | `/Users/user` smoke preview completed in `1515ms`, reported `estimated=true`, scanned `8384` paths. |
| Exact scan over a synthetic fixture traverses cache, package, bundle, and VCS directories. | Passed | `test/main/nativeScannerProtocol.test.ts` verifies exact native deep scan emits files under `node_modules`, `.git`, `.cache`, and `.app`, with `blockedByPolicy=0`, empty `policySkipSamples`, and `estimated=false`. |
| Exact scan over `/Users/user` has no responsive policy skips. | Passed | `/Users/user` smoke exact had `blockedByPolicy=0`, `softSkippedByPolicy=0`, `deferredByBudget=0`, and empty `policySkipSamples`/`budgetDeferredSamples`. |
| Exact scan logs permission-blocked paths separately from policy skips. | Passed | Native diagnostics expose `permissionSamples`, `policySkipSamples`, `scopeSkipSamples`, and `budgetDeferredSamples`. `/Users/user` exact smoke had permission samples while policy samples stayed empty. |
| Exact scan reports `estimated=true` only for a concrete cause. | Passed for current exact path | Synthetic exact fixture reported `estimated=false`; `/Users/user` exact smoke reported `estimated=false`. Preview remains intentionally estimated. |
| Permission approval can be followed by access refresh and targeted rescan. | Passed at state/contract level | `scanPermissionAccess` refreshes denied roots, rebuilds classifier, and queues `pendingPermissionRescanRoots`; `DiskScanService` runs native deep stages for pending roots; diagnostics now expose `permissionRescan.pendingRoots`, `activeRoot`, and `completedRoots`. |
| Scanner log is sufficient to explain every nonzero skip counter. | Passed for Phase C counters | Native diagnostics and logs now separate policy, permission, scope, budget-deferred, volume-plan, and permission-rescan events. |

## Current `/Users/user` Smoke Result

Latest command:

```bash
SCAN_SMOKE_SKIP_BUILD=1 bun run smoke:native-scan -- /Users/user
```

Observed result:

- Preview elapsed: `1515ms`
- Preview `estimated`: `true`
- Preview scanned: `8384`
- Preview policy skips: `48`
- Preview permission warnings: `27`
- Exact elapsed: `142578ms`
- Exact `estimated`: `false`
- Exact scanned: `1108995`
- Exact policy skips: `0`
- Exact permission blocks: `140`
- Exact scope skips: `0`
- Exact IO warnings: `2`
- Exact responsive skips: `false`
- Exact permission gaps: `true`
- Exact scope gaps: `false`

## Facts

- Exact scan semantics are now separated from preview semantics.
- Exact native deep stages receive no responsive skip inputs.
- Rust exact traversal no longer omits responsive skip fixture paths.
- Native diagnostics carry cause-specific skip samples.
- Renderer scan HUD and result footer expose skip causes and exact recheck.
- Native volume planning is explicit and logged before stage execution.
- Permission refresh queues targeted rescan roots and exposes rescan state.
- `/Users/user` exact scan is not fast enough to treat as a user-friendly default.
- `/Users/user` exact scan still has macOS permission gaps without broader access.

## Remaining Risks

- Permission gaps are still real. Phase C can explain and rescan after access
  refresh, but it cannot read protected paths without macOS permission.
- Exact `/Users/user` scan took about `142.6s` in the latest smoke run. That is
  acceptable as an explicit exact recheck, not as the default scan path.
- IO warning samples are counted in smoke output but do not yet have a dedicated
  sample bucket equivalent to permission/policy/scope/budget samples.
- The permission-rescan behavior is covered by unit/contract tests, not by a
  full end-to-end macOS permission grant automation.

## Decision

Phase C is sufficiently complete to proceed to Phase B privileged-helper design.

The helper must not take over policy ownership. Phase B should implement only
low-level, read-only enumeration support with explicit identity validation,
request scoping, audit logging, install/update/uninstall behavior, and fallback
to unprivileged exact scanning.

## Next Phase B Entry Tasks

1. Write the helper threat model and protocol spec.
2. Validate the helper/FDA boundary on the target macOS version.
3. Prototype read-only directory enumeration behind a main-process interface.
4. Add signing and identity validation before any privileged execution path is
   enabled by default.
