# Scan Policy

## Scan modes

- `preview`: fast estimation mode. It allows cached preview data, responsive deep policy, and soft-skip/estimate rules for high-cost directories.
- `exact`: accuracy mode. It disables cached preview data, locks deep policy to `exact`, and removes responsive soft-skip rules so traversed paths converge to real values.

Conflicting combinations such as `accuracyMode: "full"` with `deepPolicyPreset: "responsive"` are normalized to one of the two canonical modes above.

## Traversal decisions

- `full traverse`: normal directories and exact-mode scans. Files are statted and aggregated without policy-based shortcuts.
- `estimate`: heavy responsive-only directories where a fast size estimate is cheaper than a deep traversal. Estimates are removed once exact traversal reaches the same path.
- `skip`: protected paths, blocked system roots, and responsive-only soft-skip rules for known high-churn storage trees.

## Responsive-only soft-skip rules

- Browser extension trees under Chromium/Firefox profile roots: skip and estimate in preview scans.
- Browser storage/cache roots such as `Storage/ext`, `storage/default/*/cache`, `cache2`, and `shared dictionary/cache`: skip and estimate in preview scans.
- Browser web app resources such as `Web Applications` and `Manifest Resources`: skip and estimate in preview scans.
- Package/cache ecosystems such as `node_modules`, `.pnpm`, `.cache`, `.rustup`, `.pyenv`, and virtualenv package trees: skip and estimate in preview scans.
- KakaoTalk container chat-tag resources at `~/Library/Containers/com.kakao.KakaoTalkMac/.../commonResource/myChatTag`: skip and estimate in preview scans to avoid long stalls near completion.

## Protected and FDA paths

- Absolute protected roots are always blocked.
- Opt-in protected roots require explicit user consent before scanning.
- Full Disk Access prompts are only relevant for paths that macOS privacy controls gate, such as `Desktop`, `Documents`, `Downloads`, and `Library`-scoped data.

## UI progress behavior

- Walking and paused phases show the current directory.
- Aggregating, compressing, and finalizing phases replace the last hot path with phase-specific text so the UI does not look stuck on the final scanned directory.
