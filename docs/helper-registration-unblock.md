# Helper Registration Unblock Checklist

Status as of 2026-06-10. Registration preflight is blocked by exactly one blocker:
`fda-validation-matrix-missing`. All identity/packaging/executable blockers pass with
the current `.env` evidence flags.

Verified by `bun run scripts/audit-helper-prototype-scan.ts` output:
`registrationBlockers: ["fda-validation-matrix-missing"]`.

## FDA validation matrix progress (1/6 passed)

Matrix file: `docs/helper-fda-validation-matrix.json` (`targetMacOS: 26.5.1`).

| Scenario | Status | How to validate |
| --- | --- | --- |
| `unsigned-dev-app-without-fda` | passed (2026-06-10, automated audit) | Done. Evidence: protected paths denied with explicit permission coverage. |
| `signed-dev-app-without-fda` | pending | Build signed dev app (`pnpm build:mac`), revoke FDA for it, run `pnpm audit:helper-prototype` from the signed bundle context. |
| `signed-dev-app-with-fda` | pending | Same signed app; grant FDA in System Settings > Privacy & Security > Full Disk Access; re-run audit and confirm protected path enumeration. |
| `installed-helper-without-fda` | pending | Register helper via SMAppService from the packaged app; do not grant helper FDA; confirm helper access stays bounded and reports denial coverage. |
| `installed-helper-with-app-fda` | pending | With helper installed and app-level FDA granted, record whether helper requests inherit, fail, or need separate authorization. |
| `installed-helper-with-helper-specific-fda` | pending | Grant FDA to the helper binary itself; record System Settings behavior (separate helper entry or not). |

Record each result with:

```bash
bun run scripts/record-helper-fda-scenario.ts \
  --scenario <id> --status passed --target-macos 26.5.1 \
  --validator "<who>" --notes "<evidence>"
```

Gate check: `pnpm audit:helper-fda-matrix` must report `status: "ready"`.

## Why dev-mode registration can never work

`SMAppService` daemon registration requires the launchd plist and helper executable
inside a signed app bundle (`Contents/Library/LaunchDaemons`, `Contents/Library/LaunchServices`).
`pnpm dev` runs the generic Electron.app, so the probe can only return
`not-installed` / `not-implemented`. Registration is testable only from a
`pnpm build:mac` artifact, and macOS then requires approval in
System Settings > General > Login Items & Extensions (`pending-approval` state).

## End-to-end unblock order

1. Validate remaining 5 FDA scenarios (table above) and record them.
2. `pnpm audit:helper-fda-matrix` → `ready`.
3. `pnpm build:mac` (includes `verify:mac-signing`).
4. Install the built app, trigger helper registration, approve in System Settings.
5. Grant FDA per the matrix findings (app and/or helper-specific).
6. Confirm lifecycle reaches `ready`: checks `service-management`, `helper-install`,
   `caller-identity`, `full-disk-access`, `xpc-channel` all pass.

## Before production release

- Migrate helper label `com.example.diskvisualizer.privileged-helper` to a
  `com.spacelens.*` label. Touches: launchd plist (name + `Label` + `MachServices` +
  `BundleProgram`), `electron-builder.json` `extraFiles`, helper Swift sources,
  `helperRegistration.ts` constants, requirement metadata JSON, and rebuilds of all
  `resources/bin` / `resources/helper` binaries. Changing the label later orphans
  existing registrations, so do it before first public install.
- `.env` evidence flags do not exist in a packaged app (`loadDotEnvFile` reads
  `process.cwd()`). Decide how packaged builds supply registration evidence —
  bake into build config or derive from real filesystem checks at runtime.
