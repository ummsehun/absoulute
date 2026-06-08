# Renderer Code Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical bugs, state race conditions, dead code, and maintainability issues identified in the renderer and scan service layers.

**Architecture:** Changes are isolated to 5 files: `scanRequestFactory.ts`, `useScanLogic.ts`, `LandingView.tsx`, `App.tsx`, `scanRuntimeOptions.ts`. No new files needed except adding one CSS keyframe to `styles.css`. All fixes are backward-compatible — no schema or IPC contract changes.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (CSS-based, no config file), Vitest, Electron renderer

---

## Total Issues Being Fixed

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | 🔴 Bug | `scanRequestFactory.ts` | `buildPreviewScanRequest` identical to `buildDefaultScanRequest` |
| 2 | 🔴 Bug | `LandingView.tsx:127` | `toLocaleString() \|\| 0` fallback never triggers |
| 3 | 🟡 Risk | `useScanLogic.ts:281-284` | `aggregateRef` / `aggregateSizes` not reset atomically |
| 4 | 🟡 Risk | `useScanLogic.ts:296` | `scanId: "scan-preflight"` fake scanId leaks into typed field |
| 5 | 🔵 Nit | `useScanLogic.ts:308` | `startScan` dead code (identical to `oneClickScan`) |
| 6 | 🔵 Nit | `useScanLogic.ts:400-402` | `breadcrumbPaths` memo has redundant deps |
| 7 | 🔵 Nit | `useScanLogic.ts:398` | `visualizationRoot` not memoized |
| 8 | 🔵 Nit | `App.tsx:34` | `Object.keys(aggregateSizes)` allocates on every render |
| 9 | 🔵 Nit | `scanRuntimeOptions.ts:121-134` | Triple-repeated condition for `deepSkip*` |
| 10 | 🔵 Nit | `scanRequestFactory.ts` | Hardcoded emit/concurrency values duplicate `scanRuntimeOptions` constants |
| 11 | 🔵 Nit | `LandingView.tsx` | `shimmer` animation defined inline, not in CSS |
| 12 | 🔵 Nit | `LandingView.tsx` | Non-standard Tailwind opacity fractions (`/8`, `/12`, `/14`, etc.) |

---

## Files Modified

| File | Change |
|------|--------|
| `src/renderer/src/hooks/scanRequestFactory.ts` | Fix identical functions (issue 1), remove hardcoded constants (issue 10) |
| `src/renderer/src/components/LandingView.tsx` | Fix `\|\| 0` bug (issue 2), move shimmer inline (issue 11), fix opacity fractions (issue 12) |
| `src/renderer/src/hooks/useScanLogic.ts` | Fix race (issue 3), fix fake scanId (issue 4), remove dead `startScan` (issue 5), fix memo deps (issues 6-7) |
| `src/renderer/src/App.tsx` | Fix `Object.keys` (issue 8) |
| `src/main/services/scan/scanRuntimeOptions.ts` | Extract `isResponsiveNonRoot` (issue 9) |
| `src/renderer/src/styles.css` | Add `shimmer` keyframe (issue 11) |
| `test/renderer/scanRequestFactory.test.ts` | Update tests for fixed factory behavior |

---

## Task 1: Fix `buildPreviewScanRequest` — critical bug

**Files:**
- Modify: `src/renderer/src/hooks/scanRequestFactory.ts`
- Modify: `test/renderer/scanRequestFactory.test.ts`

Currently `buildDefaultScanRequest` and `buildPreviewScanRequest` both call `buildScanRequest(input, "responsive")`. The SCAN button and EXACT button now both do the same thing. `buildPreviewScanRequest` was likely kept from when there was a "preview" mode — now that `exactScan` replaces it, the internal helper needs `"exact"` preset, OR `buildPreviewScanRequest` should be deleted entirely.

Looking at `App.tsx`: it uses `oneClickScan` (→ `buildDefaultScanRequest`) and `exactScan` (→ `buildExactScanRequest`). `previewScan` in `useScanLogic` is now dead (not destructured in App.tsx). The three builder functions map to:
- `buildDefaultScanRequest` → `"responsive"` ✓ (correct, for SCAN button)
- `buildExactScanRequest` → `"exact"` ✓ (correct, for EXACT button)  
- `buildPreviewScanRequest` → `"responsive"` — same as default, dead, remove

- [ ] **Step 1: Update the test to reflect removal of `buildPreviewScanRequest`**

Open `test/renderer/scanRequestFactory.test.ts`. The test "keeps preview-first responsive requests available for explicit previews" tests `buildPreviewScanRequest`. Replace it with a test that verifies default and exact are distinct:

```typescript
// test/renderer/scanRequestFactory.test.ts
import { describe, expect, it } from "vitest";
import { buildDefaultScanRequest, buildExactScanRequest } from "../../src/renderer/src/hooks/scanRequestFactory";

describe("scanRequestFactory", () => {
  it("builds exact requests for the default scan path", () => {
    const request = buildDefaultScanRequest({
      rootPath: "/Users/user",
      optInProtected: false,
    });

    expect(request).toMatchObject({
      rootPath: "/Users/user",
      optInProtected: false,
      performanceProfile: "accuracy-first",
      scanMode: "native_rust",
      accuracyMode: "full",
      deepPolicyPreset: "exact",
      elevationPolicy: "manual",
      allowNodeFallback: false,
    });
  });

  it("default and exact scans produce different deepPolicyPreset", () => {
    const defaultReq = buildDefaultScanRequest({ rootPath: "/Users/user", optInProtected: false });
    const exactReq = buildExactScanRequest({ rootPath: "/Users/user", optInProtected: false });
    expect(defaultReq.deepPolicyPreset).not.toBe(exactReq.deepPolicyPreset);
  });

  it("builds exact requests only for explicit exact rechecks", () => {
    const request = buildExactScanRequest({
      rootPath: "/Users/user",
      optInProtected: false,
    });

    expect(request).toMatchObject({
      rootPath: "/Users/user",
      optInProtected: false,
      performanceProfile: "accuracy-first",
      scanMode: "native_rust",
      accuracyMode: "full",
      deepPolicyPreset: "exact",
      elevationPolicy: "manual",
      allowNodeFallback: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails (buildPreviewScanRequest still exists)**

```bash
cd /Users/user/ab && pnpm test -- --reporter=verbose 2>&1 | grep -A5 "scanRequestFactory"
```

Expected: test about "default and exact scans produce different deepPolicyPreset" FAILS because currently both return `"responsive"` (same preset, so `not.toBe` fails... wait, they're actually different: default→responsive, exact→exact. That test passes already).

Actually the test will pass after we fix the implementation. The real issue is that `buildDefaultScanRequest` currently produces `deepPolicyPreset: "responsive"` but the first test expects `"exact"`. Run to confirm which tests fail.

- [ ] **Step 3: Remove `buildPreviewScanRequest`, ensure `buildDefaultScanRequest` maps correctly**

The current `buildDefaultScanRequest` calls `buildScanRequest(input, "responsive")`. But the test expects `deepPolicyPreset: "exact"`. This means the intent was for the default scan to be `"exact"`. Check `resolveScanIntent` behavior to confirm.

Looking at the test fixture: `buildDefaultScanRequest` → `accuracyMode: "full"`, `deepPolicyPreset: "exact"` — this is the "accuracy-first/exact" intent. So `buildDefaultScanRequest` should pass `"exact"`, not `"responsive"`.

```typescript
// src/renderer/src/hooks/scanRequestFactory.ts
import { resolveScanIntent } from "../../../shared/domain/scanIntent";
import type { ScanStartRequest } from "../../../types/contracts";

interface BuildScanRequestInput {
  optInProtected: boolean;
  responsivePolicySkips?: boolean;
  rootPath: string;
}

export function buildDefaultScanRequest(input: BuildScanRequestInput): ScanStartRequest {
  return buildScanRequest(input, "exact");
}

export function buildExactScanRequest(input: BuildScanRequestInput): ScanStartRequest {
  return buildScanRequest(input, "exact");
}

function buildScanRequest(
  input: BuildScanRequestInput,
  deepPolicyPreset: "responsive" | "exact",
): ScanStartRequest {
  const scanIntent = resolveScanIntent({ deepPolicyPreset });

  return {
    rootPath: input.rootPath,
    optInProtected: input.optInProtected,
    performanceProfile: scanIntent.performanceProfile,
    scanMode: "native_rust",
    accuracyMode: scanIntent.accuracyMode,
    deepPolicyPreset: scanIntent.deepPolicyPreset,
    elevationPolicy: "manual",
    emitPolicy: {
      aggBatchMaxItems: 512,
      aggBatchMaxMs: 120,
      progressIntervalMs: 120,
    },
    concurrencyPolicy: {
      min: 16,
      max: 64,
      adaptive: true,
    },
    allowNodeFallback: false,
    responsivePolicySkips: input.responsivePolicySkips,
  };
}
```

- [ ] **Step 4: Remove `previewScan` from `useScanLogic` return (it was the dead wrapper)**

In `src/renderer/src/hooks/useScanLogic.ts`, find and remove:
```typescript
const previewScan = async () => await startScanForPath(rootPath, "preview");
```
And remove it from the return object.

- [ ] **Step 5: Run tests**

```bash
cd /Users/user/ab && pnpm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/hooks/scanRequestFactory.ts src/renderer/src/hooks/useScanLogic.ts test/renderer/scanRequestFactory.test.ts
git commit -m "fix: buildDefaultScanRequest uses exact preset, remove dead buildPreviewScanRequest"
```

---

## Task 2: Fix `toLocaleString() || 0` bug in LandingView

**Files:**
- Modify: `src/renderer/src/components/LandingView.tsx:127`

`toLocaleString()` always returns a string. `"0"` is truthy, so `|| 0` never fires. The fallback `0` (number) also mixes types in JSX. Fix: move the nullish check before the formatting call.

- [ ] **Step 1: Fix the scannedCount display**

Find in `LandingView.tsx`:
```typescript
<span>{progress?.progress.scannedCount.toLocaleString() || 0} Files</span>
```
Replace with:
```typescript
<span>{(progress?.progress.scannedCount ?? 0).toLocaleString()} Files</span>
```

- [ ] **Step 2: Fix totalBytes display (same pattern)**

Find:
```typescript
<span>{((progress?.progress.totalBytes || 0) / 1e9).toFixed(2)} GB</span>
```
This one is `|| 0` on a number, which works correctly (0 is falsy). But `undefined || 0` is fine. Leave as-is or normalize to `??`:
```typescript
<span>{((progress?.progress.totalBytes ?? 0) / 1e9).toFixed(2)} GB</span>
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/user/ab && pnpm typecheck 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/LandingView.tsx
git commit -m "fix: use nullish coalescing before toLocaleString to prevent wrong fallback"
```

---

## Task 3: Fix `aggregateRef` race condition on scan start

**Files:**
- Modify: `src/renderer/src/hooks/useScanLogic.ts:281-284`

On scan start success, `aggregateRef.current = {}` (line ~281) and `setAggregateSizes({})` (line ~284) are called with other setters in between. If `commitPendingDeltas` fires between these two lines (e.g., from a stale progress event), it will apply deltas to the empty ref and then `setAggregateSizes` overwrites with a fresh empty object — losing those deltas.

Fix: clear both in one synchronous block, before the other setters, and use `flushSync` is not needed — just ensure `aggregateRef` and `pendingDeltasRef` are cleared before any state updates.

- [ ] **Step 1: Reorder the scan start success block**

Find the success branch of `startScanForPath` (after `if (result.ok) {`). Reorder to clear refs FIRST before any state setters:

```typescript
if (result.ok) {
    // Clear mutable refs first — before any state updates that could trigger
    // commitPendingDeltas via concurrent events
    aggregateRef.current = {};
    pendingDeltasRef.current = [];
    lastVisualCommitRef.current = Date.now();

    setScanId(result.data.scanId);
    setScanStartedAt(result.data.startedAt);
    setRootPath(normalizedRoot);
    setScanBasePath(normalizedRoot);
    setActiveRootPath(normalizedRoot);
    setProgress(null);
    setAggregateSizes({});
    setPatchStats({ added: 0, updated: 0, pruned: 0 });
    setWarningSummary({ permission: 0, io: 0, lastPath: null });
    setCoverageUpdate(null);
    setDiagnostics(null);
    setScanTerminal(null);
    setPerfSample(null);
    setElevationRequired(null);
    setError(null);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/user/ab && pnpm typecheck 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useScanLogic.ts
git commit -m "fix: clear aggregateRef before state setters to prevent delta race on scan start"
```

---

## Task 4: Fix fake `scanId: "scan-preflight"` in elevationRequired

**Files:**
- Modify: `src/renderer/src/hooks/useScanLogic.ts:296`

`ScanElevationRequired.scanId` is typed as `string`. Setting it to `"scan-preflight"` creates a fake sentinel value that could be misused downstream (e.g., passed to `scanCancel`).

- [ ] **Step 1: Check how `elevationRequired.scanId` is used downstream**

```bash
grep -r "elevationRequired\.scanId\|elevationRequired?\.scanId" /Users/user/ab/src --include="*.ts" --include="*.tsx"
```

If `scanId` from `elevationRequired` is used to call API methods, this is a critical bug. If it's only displayed, it's cosmetic.

- [ ] **Step 2: Fix based on findings**

If `scanId` is only used for display/tracking and not passed to IPC calls, use empty string or the actual scan flow:

```typescript
setElevationRequired({
    scanId: "",  // no active scan yet — this is a preflight check
    targetPath: normalizedRoot,
    reason: "선택한 경로는 Full Disk Access 또는 파일 접근 권한이 필요합니다. 설정에서 접근 권한을 허용해 주세요.",
    policy: "manual",
});
```

If `ScanElevationRequired` requires a non-empty scanId (Zod schema says `z.string().min(1)`), then use a dedicated constant:

```typescript
// At top of file, near ScanRequestMode type
const PREFLIGHT_SCAN_ID = "preflight" as const;

// In startScanForPath:
setElevationRequired({
    scanId: PREFLIGHT_SCAN_ID,
    targetPath: normalizedRoot,
    reason: "선택한 경로는 Full Disk Access 또는 파일 접근 권한이 필요합니다. 설정에서 접근 권한을 허용해 주세요.",
    policy: "manual",
});
```

- [ ] **Step 3: Typecheck + test**

```bash
cd /Users/user/ab && pnpm typecheck && pnpm test 2>&1 | tail -15
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/useScanLogic.ts
git commit -m "fix: use named constant for preflight elevation scanId sentinel"
```

---

## Task 5: Remove dead code + fix memo deps in `useScanLogic`

**Files:**
- Modify: `src/renderer/src/hooks/useScanLogic.ts`

- [ ] **Step 1: Remove dead `startScan` function**

Find and delete:
```typescript
const startScan = async () => await startScanForPath(rootPath);
```
Also remove `startScan` from the return object at the bottom.

- [ ] **Step 2: Memoize `visualizationRoot`**

Find:
```typescript
const visualizationRoot = activeRootPath || scanBasePath || normalizeFsPath(rootPath);
```
Replace:
```typescript
const visualizationRoot = useMemo(
    () => activeRootPath || scanBasePath || normalizeFsPath(rootPath),
    [activeRootPath, scanBasePath, rootPath],
);
```

- [ ] **Step 3: Fix `breadcrumbPaths` redundant deps**

Find:
```typescript
const breadcrumbPaths = useMemo(() => {
    return buildBreadcrumbPaths(scanBasePath || normalizeFsPath(rootPath), visualizationRoot);
}, [rootPath, scanBasePath, visualizationRoot]);
```
Replace with (drop `rootPath` and `scanBasePath` since `visualizationRoot` already encodes them):
```typescript
const breadcrumbPaths = useMemo(() => {
    return buildBreadcrumbPaths(scanBasePath || normalizeFsPath(rootPath), visualizationRoot);
}, [visualizationRoot, scanBasePath, rootPath]);
```

Note: Keep all three deps here because `buildBreadcrumbPaths` first arg uses `scanBasePath || normalizeFsPath(rootPath)` directly (not `visualizationRoot`). The redundancy is only partial — `rootPath` and `scanBasePath` are both needed for the first arg. Leave as-is and add a comment:

```typescript
const breadcrumbPaths = useMemo(() => {
    return buildBreadcrumbPaths(scanBasePath || normalizeFsPath(rootPath), visualizationRoot);
    // rootPath + scanBasePath needed for first arg; visualizationRoot for second
}, [rootPath, scanBasePath, visualizationRoot]);
```

Actually this memo is correct as-is. The issue from the review was that `rootPath` and `scanBasePath` are redundant because `visualizationRoot` depends on them — but since the first arg of `buildBreadcrumbPaths` takes `scanBasePath || normalizeFsPath(rootPath)` (not `visualizationRoot`), they ARE needed. Skip this change.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/user/ab && pnpm typecheck 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/useScanLogic.ts
git commit -m "refactor: remove dead startScan, memoize visualizationRoot"
```

---

## Task 6: Fix `Object.keys` allocation in App.tsx

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Replace `Object.keys(aggregateSizes).length > 0` with size check**

Find:
```typescript
const isCompleted = scanTerminal?.status === "done" && Object.keys(aggregateSizes).length > 0;
```
Replace — track whether data exists via `aggregateSizes` being non-empty without allocating a full keys array:
```typescript
const hasAggregateData = Object.keys(aggregateSizes).length > 0;
const isCompleted = scanTerminal?.status === "done" && hasAggregateData;
```

This is still `Object.keys` but now named. For a real fix, memoize:
```typescript
const isCompleted = useMemo(
  () => scanTerminal?.status === "done" && Object.keys(aggregateSizes).length > 0,
  [scanTerminal, aggregateSizes],
);
```

Add `useMemo` to the React import at top of `App.tsx`:
```typescript
import React, { useMemo } from 'react';
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/user/ab && pnpm typecheck 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "perf: memoize isCompleted to avoid Object.keys allocation every render"
```

---

## Task 7: Extract `isResponsiveNonRoot` in `scanRuntimeOptions.ts`

**Files:**
- Modify: `src/main/services/scan/scanRuntimeOptions.ts`
- Modify: `test/main/scanRuntimeOptions.test.ts`

- [ ] **Step 1: Extract repeated condition**

Find the three `deepSkip*` assignments:
```typescript
const deepSkipPackageManagers =
    !isRoot
    && deepPolicyPreset === "responsive"
    && responsivePolicySkips
    && DEEP_SKIP_PACKAGE_MANAGERS_DEFAULT;
const deepSkipCachePrefixes =
    !isRoot
    && deepPolicyPreset === "responsive"
    && responsivePolicySkips
    && DEEP_SKIP_CACHE_PREFIXES_DEFAULT;
const deepSkipBundleDirs =
    !isRoot
    && deepPolicyPreset === "responsive"
    && responsivePolicySkips
    && DEEP_SKIP_BUNDLE_DIRS_DEFAULT;
```

Replace with:
```typescript
const isResponsiveNonRoot = !isRoot && deepPolicyPreset === "responsive" && responsivePolicySkips;
const deepSkipPackageManagers = isResponsiveNonRoot && DEEP_SKIP_PACKAGE_MANAGERS_DEFAULT;
const deepSkipCachePrefixes = isResponsiveNonRoot && DEEP_SKIP_CACHE_PREFIXES_DEFAULT;
const deepSkipBundleDirs = isResponsiveNonRoot && DEEP_SKIP_BUNDLE_DIRS_DEFAULT;
```

- [ ] **Step 2: Run existing tests**

```bash
cd /Users/user/ab && pnpm test -- --reporter=verbose 2>&1 | grep -E "scanRuntimeOptions|PASS|FAIL"
```

Expected: all pass (pure refactor, no behavior change).

- [ ] **Step 3: Typecheck**

```bash
cd /Users/user/ab && pnpm typecheck 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/main/services/scan/scanRuntimeOptions.ts
git commit -m "refactor: extract isResponsiveNonRoot to eliminate triple-repeated condition"
```

---

## Task 8: Move `shimmer` animation from inline style to CSS

**Files:**
- Modify: `src/renderer/src/styles.css`
- Modify: `src/renderer/src/components/LandingView.tsx`

- [ ] **Step 1: Add `shimmer` keyframe + utility class to `styles.css`**

Open `src/renderer/src/styles.css`. After the existing `@keyframes spin` block, add:

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.animate-shimmer {
  animation: shimmer 1.5s infinite linear;
  background-size: 200% 100%;
}
```

- [ ] **Step 2: Replace inline style in LandingView**

Find:
```tsx
<div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400 to-transparent w-full h-full opacity-50" style={{ animation: 'shimmer 1.5s infinite linear', backgroundSize: '200% 100%' }} />
```
Replace:
```tsx
<div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400 to-transparent w-full h-full opacity-50 animate-shimmer" />
```

- [ ] **Step 3: Replace `animationDuration` inline style for liquid spin blob**

Find:
```tsx
style={{ animationDuration: isScanning ? '4s' : '10s' }}
```
Replace with CSS variable approach — add to `styles.css`:
```css
.liquid-spin-scanning {
  animation-duration: 4s;
}
```
Then in LandingView:
```tsx
className={`absolute inset-0 bg-gradient-to-br from-cyan-400 to-blue-600 opacity-40 liquid-spin blur-xl mix-blend-screen transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-125 group-hover:rotate-12 ${isScanning ? 'liquid-spin-scanning' : ''}`}
```
Remove the `style={{ animationDuration: ... }}` prop.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/user/ab && pnpm typecheck 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/styles.css src/renderer/src/components/LandingView.tsx
git commit -m "refactor: move shimmer and liquid-spin-scanning animations from inline styles to CSS"
```

---

## Task 9: Normalize non-standard Tailwind opacity fractions

**Files:**
- Modify: `src/renderer/src/components/LandingView.tsx`

Tailwind v4 with `@import "tailwindcss"` supports arbitrary opacity values like `/8` etc. But using too many non-standard values creates inconsistency. Map to nearest standard values OR keep custom ones consistent.

Standard Tailwind opacity scale: `5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100`.

| Current | Nearest standard | Action |
|---------|-----------------|--------|
| `/8` | `/10` | → `/10` |
| `/12` | `/10` or `/15` | → `/10` |
| `/14` | `/15` | → `/15` |
| `/16` | `/15` or `/20` | → `/15` |
| `/24` | `/25` | → `/25` |
| `/55` | `/50` or `/60` | → `/50` |
| `/72` | `/75` | → `/75` |
| `/76` | `/75` | → `/75` |
| `/85` | `/80` or `/90` | → `/80` |

- [ ] **Step 1: Apply replacements in LandingView.tsx**

Use find-and-replace for each:
- `border-white/12` → `border-white/10`
- `bg-black/24` → `bg-black/25`
- `text-white/72` → `text-white/75`
- `border-white/16` → `border-white/15`
- `bg-white/8` → `bg-white/10`
- `text-white/76` → `text-white/75`
- `text-amber-100/85` → `text-amber-100/80`
- `text-cyan-100/55` → `text-cyan-100/50`
- `bg-white/14` → `bg-white/15`

> **Note:** Visual changes will be subtle (1-3% opacity shift). Visually verify the component looks correct after this change.

- [ ] **Step 2: Typecheck**

```bash
cd /Users/user/ab && pnpm typecheck 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/LandingView.tsx
git commit -m "style: normalize non-standard Tailwind opacity fractions to standard scale"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
cd /Users/user/ab && pnpm test 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Run typecheck**

```bash
cd /Users/user/ab && pnpm typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Run lint**

```bash
cd /Users/user/ab && pnpm lint 2>&1 | tail -20
```

Expected: no new errors.
