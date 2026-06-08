# Scan Policy

See `docs/scan-architecture.md` for the current end-to-end scanner pipeline,
state ownership, native protocol, and refactoring target.

## Scan mode

The user-facing app is built around one `SCAN` action. That action uses the
responsive deep policy so high-cost, low-value directories are represented as
folder-level estimated items instead of being deeply traversed file by file.
The quick pass is time-budgeted for responsiveness, but the deep pass is
unbounded by default so large visible roots are not dropped from the final
folder totals by a traversal deadline.

The internal `exact` preset still exists for tests and explicit internal
rechecks, but it is not the default UI path.

## Traversal decisions

- `full traverse`: normal directories. Files are statted and aggregated.
- `folder-only estimate`: known high-cost directories where a fast directory
  size estimate is cheaper and more useful than deep traversal.
- `skip`: protected paths and blocked system roots that should not be scanned.

## Folder-only blacklist rules

The canonical rule data lives in `src/shared/domain/scanPolicyContract.ts`.
TypeScript traversal uses that contract directly, and native Rust scans receive
the same path-rule data through the `softSkipPathRules` start protocol field.

- Browser extension trees under Chromium/Firefox profile roots: folder-only estimate.
- Browser storage/cache roots such as `Storage/ext`, `storage/default/*/cache`, `cache2`, and `shared dictionary/cache`: folder-only estimate.
- Browser web app resources such as `Web Applications` and `Manifest Resources`: folder-only estimate.
- Package/cache ecosystems such as `node_modules`, `.pnpm`, `.cache`, `.rustup`, `.pyenv`, and virtualenv package trees: folder-only estimate.
- KakaoTalk container chat-tag resources at `~/Library/Containers/com.kakao.KakaoTalkMac/.../commonResource/myChatTag`: folder-only estimate to avoid long stalls near completion.

## Protected and FDA paths

- Absolute protected roots are always blocked.
- Opt-in protected roots require explicit user consent before scanning.
- Full Disk Access prompts are only relevant for paths that macOS privacy controls gate, such as `Desktop`, `Documents`, `Downloads`, and `Library`-scoped data.

## UI progress behavior

- Walking and paused phases show the current directory.
- Aggregating, compressing, and finalizing phases replace the last hot path with phase-specific text so the UI does not look stuck on the final scanned directory.

## Native metadata batching

The Rust scanner derives metadata batch size from the native concurrency policy.
The batch is clamped between 256 and 2048 files so higher-concurrency scans do
not split metadata work into unnecessarily small chunks while keeping memory and
progress latency bounded.

Within each metadata batch, the Rust scanner now uses a Rayon parallel iterator
to stat files and then emits results in smaller output chunks. This removes the
old per-file `rayon::spawn` plus channel send/receive overhead while preserving
batch-level cancellation and time-budget checks.
