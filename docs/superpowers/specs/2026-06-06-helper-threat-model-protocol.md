# Privileged Helper Threat Model and Protocol Spec

Date: 2026-06-06

## Status

Draft for Phase B implementation.

This document is grounded in the current repository and Phase C audit. It does
not claim that a helper already exists.

## Scope

In scope:

- macOS privileged helper design for read-only filesystem enumeration.
- Main app to helper request contract.
- Helper identity, authorization, and audit requirements.
- Fallback to the current unprivileged native scanner.

Out of scope for this phase:

- Cleanup/delete operations.
- Arbitrary command execution.
- Arbitrary file writes.
- Helper-owned scan policy, aggregation, UI state, cache ownership, or user
  preferences.
- Windows/Linux elevation helpers.

## Repository Evidence

- The current native scanner is a Rust executable launched by the Electron main
  process and controlled with JSON-line stdin/stdout messages.
- Current scan policy ownership lives in the main process and shared domain
  modules, not in the native scanner.
- Current macOS privilege helper code only probes readability and opens Full
  Disk Access settings.
- Phase C audit concluded that exact unprivileged scans are semantically stable
  but still hit protected path permission gaps.
- Current packaging does not define helper entitlements, launchd installation,
  notarization, or helper identity validation.

## External Platform Facts

- Apple documents `SMAppService` as the macOS 13+ API for registering and
  controlling login items, launch agents, and launch daemons that live inside an
  app bundle.
- Apple documents that `SMAppService.register()` registers services subject to
  user approval; LaunchDaemons are not bootstrapped until admin approval.
- Apple documents XPC as an IPC mechanism managed by `launchd`, including
  services that can be launched on demand and restarted if they crash.
- Apple Security APIs expose designated requirements for signed code. The
  helper design must validate caller identity against an expected designated
  requirement before accepting privileged requests.

## Assumptions

Facts:

- This app is a local desktop Electron application.
- The helper is intended only for local filesystem scanning.
- The current default engine remains unprivileged `native_rust`.

Assumptions:

- The first helper target is macOS 13 or later using `SMAppService` where
  available.
- The app will have a Developer ID signing identity before any production helper
  path is enabled.
- The helper will communicate with the main app using XPC or an equivalent
  launchd-managed local IPC channel that supports peer identity validation.

Unconfirmed:

- Whether Full Disk Access granted to the GUI app covers the installed helper on
  each target macOS version.
- Final bundle identifiers, Team ID, helper label, and designated requirement.
- Whether a development-only helper installation path is acceptable for local
  testing before signing/notarization is complete.

## Components

```text
Renderer
  -> preload IPC facade
  -> Electron main process
  -> ScanManager / DiskScanService
  -> HelperClient
  -> privileged helper IPC boundary
  -> Helper daemon
  -> filesystem metadata enumeration
```

Main process responsibilities:

- Resolve scan intent.
- Resolve path policy and volume plan.
- Normalize and validate roots.
- Decide helper eligibility.
- Hold aggregation, progress, diagnostics, coverage, and UI-facing state.
- Persist logs and cache.
- Fall back to unprivileged native exact scan.

Helper responsibilities:

- Validate caller identity.
- Validate request schema.
- Enforce operation allowlist.
- Enumerate directories.
- Read metadata.
- Stream records, permission failures, IO failures, and terminal status.
- Write helper audit events.

The helper must not decide app scan policy. It receives an already-scoped
request and returns facts about the filesystem.

## Assets

- User filesystem metadata and paths.
- TCC-protected path names and access outcomes.
- Privileged helper executable and launchd registration.
- App bundle identity and designated requirement.
- Helper IPC channel.
- Native scanner and helper audit logs.
- Aggregated scan result integrity.
- User trust in what was scanned or omitted.

## Trust Boundaries

| Boundary | Direction | Validation Required |
| --- | --- | --- |
| Renderer to preload/main IPC | Renderer -> main | Existing zod schemas and IPC channel allowlist. |
| Main to helper IPC | Main -> helper | Caller identity, designated requirement, request schema, nonce, operation allowlist. |
| Helper to filesystem | Helper -> filesystem | Read-only operations only, root scoping, no following unbounded arbitrary operations outside plan. |
| Helper to main stream | Helper -> main | Structured event schema, bounded payloads, monotonic stage IDs, terminal status. |
| Main to logs/cache | Main -> disk | Structured logs, no untrusted arbitrary output path. |

## Entry Points

Main app:

- `scan:start`
- `scan:request-elevation`
- helper install/register action
- helper unregister action
- helper-backed scan stage request

Helper:

- register/unregister lifecycle through Service Management
- local IPC connection acceptance
- `scan.enumerate` request
- `health.check` request
- `version.get` request

## Protocol

### Transport

Preferred transport: XPC service or LaunchDaemon communication channel with
peer identity validation.

The helper protocol must be framed and schema-versioned. JSON lines are allowed
for early prototype parity with the current Rust native scanner, but production
must still validate peer identity and enforce bounded message sizes.

### Common Request Envelope

```ts
interface HelperRequestEnvelope<TPayload> {
  schemaVersion: 1;
  requestId: string;
  scanId: string;
  stageId: string;
  operation: "scan.enumerate" | "health.check" | "version.get";
  issuedAtMs: number;
  nonce: string;
  payload: TPayload;
}
```

Validation:

- `schemaVersion` must be supported.
- `requestId`, `scanId`, `stageId`, and `nonce` must be non-empty and bounded.
- `operation` must be allowlisted.
- Unknown operations must be rejected.
- Duplicate `(scanId, stageId, nonce)` combinations must be rejected within a
  short replay window.

### Scan Enumerate Payload

```ts
interface ScanEnumeratePayload {
  root: string;
  scanMode: "quick" | "deep";
  accuracyMode: "preview" | "full";
  volumePolicy: "same-device" | "root-cross-device" | "explicit-volumes";
  plannedRoots: string[];
  maxDepth: number;
  sameDeviceOnly: boolean;
  permissionPolicy: "report-only";
  traversalPolicyPlanId: string;
  emitPolicy: {
    batchMaxItems: number;
    progressIntervalMs: number;
  };
}
```

Rules:

- `root` and every `plannedRoots[]` entry must be absolute and normalized.
- `plannedRoots[]` must be within the main-process volume plan.
- `permissionPolicy` is report-only; the helper reports failures but does not
  open settings or modify TCC state.
- The helper receives `traversalPolicyPlanId` only for audit correlation. The
  main process remains the policy owner.
- `maxDepth`, batch size, and progress intervals must be clamped.

### Helper Stream Events

```ts
type HelperEvent =
  | { type: "ready"; requestId: string; helperVersion: string }
  | { type: "entry_batch"; requestId: string; items: HelperEntry[] }
  | { type: "progress"; requestId: string; scannedCount: number; currentPath?: string }
  | { type: "coverage"; requestId: string; permissionFailures: number; ioFailures: number }
  | { type: "warn"; requestId: string; code: HelperWarnCode; path?: string; message: string }
  | { type: "done"; requestId: string; estimated: boolean; elapsedMs: number }
  | { type: "error"; requestId: string; code: HelperErrorCode; message: string };
```

Allowed warning codes:

- `E_HELPER_PERMISSION`
- `E_TCC_PERMISSION`
- `E_IO`
- `E_SCOPE`
- `E_CANCELLED`

Allowed terminal error codes:

- `E_INVALID_CLIENT`
- `E_INVALID_REQUEST`
- `E_UNSUPPORTED_VERSION`
- `E_REPLAYED_REQUEST`
- `E_HELPER_INTERNAL`

### Helper Entry

```ts
interface HelperEntry {
  path: string;
  parentPath: string;
  kind: "file" | "dir" | "symlink" | "other";
  size: number;
  mtimeMs?: number;
  inode?: string;
  deviceId?: string;
  estimated: false;
}
```

Rules:

- Helper entries must be facts from metadata reads.
- The helper must not send policy estimates.
- Symlink handling must be explicit and must not allow cycles or escape
  tracking.

## Threats and Mitigations

| ID | Threat | Likelihood | Impact | Priority | Mitigations |
| --- | --- | --- | --- | --- | --- |
| T1 | Malicious local process connects to helper and requests privileged enumeration. | Medium | High | High | Validate peer identity/designated requirement; reject unsigned/unknown callers; log rejected identity. |
| T2 | Main app bug sends an overbroad root such as `/` when user selected a narrower root. | Medium | Medium | Medium | Main owns volume plan; helper validates root against `plannedRoots`; audit request root and policy ID. |
| T3 | Replay of a previous valid helper request. | Low | Medium | Medium | Nonce, stage ID, short replay cache, request timestamp bounds. |
| T4 | Helper becomes a generic privileged file API. | Medium | High | High | Operation allowlist; no shell commands; no writes; no delete/move/chmod/chown APIs. |
| T5 | Helper leaks protected path names into unbounded logs. | Medium | Medium | Medium | Structured logs with caps, redaction option for future privacy mode, no raw directory dumps in logs. |
| T6 | Helper crashes or hangs during deep enumeration. | Medium | Medium | Medium | Main timeout/cancel controls, bounded batches, launchd restart awareness, fallback to unprivileged exact scan. |
| T7 | TCC behavior differs from assumptions and protected paths still fail. | High | Medium | High | FDA validation matrix before default enablement; report `E_TCC_PERMISSION`; keep Phase C permission coverage UI. |
| T8 | Supply-chain or update mismatch installs a helper that does not match the app. | Low | High | High | Version pinning, Team ID and designated requirement checks, helper version handshake, explicit update/uninstall tests. |

## Required Tests Before Helper Code Is Enabled

- Helper protocol schema tests.
- Invalid operation rejection tests.
- Invalid client identity rejection tests.
- Replay nonce rejection tests.
- Path normalization and root scope rejection tests.
- Read-only traversal fixture tests.
- Permission/TCC failure mapping tests.
- Helper install/register/unregister tests for development builds.
- Signed build identity validation tests.
- FDA behavior matrix on target macOS versions.

## Logging Requirements

Every helper-backed scan stage must log:

- request ID, scan ID, stage ID
- helper version
- operation
- normalized root
- volume policy
- planned roots
- caller identity validation result
- terminal status
- counts for entries, permission failures, TCC failures, IO failures, scope
  rejections, and cancellations

Logs must distinguish:

- app policy skip
- helper filesystem permission failure
- TCC privacy denial
- scope exclusion
- IO failure
- cancellation
- budget/time cutoff

## Phase B Implementation Gate

Do not implement privileged helper execution before these are decided:

- bundle identifier and helper label
- Team ID and expected designated requirement
- Service Management model: `SMAppService.daemon(plistName:)` versus legacy
  compatibility path
- IPC transport and peer identity API
- helper install/update/uninstall behavior
- FDA validation matrix
- fallback behavior on install, identity, IPC, or permission failure

### Phase B Registration Decision

Facts:

- The current app bundle identifier in `electron-builder.json` is
  `com.example.diskvisualizer`.
- The helper registration contract is defined in
  `src/main/services/helper/helperRegistration.ts`.
- The selected Service Management model is `SMAppService.daemon(plistName:)`.
- The helper launch daemon plist name is
  `com.example.diskvisualizer.privileged-helper.plist`.
- The plist must be bundled at
  `Contents/Library/LaunchDaemons/com.example.diskvisualizer.privileged-helper.plist`.

Apple documentation basis:

- `SMAppService.daemon(plistName:)` initializes a daemon service from a plist
  name.
- That plist name must correspond to a property list in the calling app's
  `Contents/Library/LaunchDaemons` directory.
- `SMAppService.register()` registers the service, but a LaunchDaemon is not
  bootstrapped until an admin approves it in System Settings.

Remaining blockers:

- Production bundle identifier is not confirmed. The current
  `com.example.diskvisualizer` value is a development identifier.
- Team ID is not configured.
- Expected designated requirement is not configured.
- Hardened runtime, helper entitlements, and packaging are not configured.
- FDA behavior matrix is not validated on target macOS versions.

Direction:

- Keep the helper engine disabled unless explicit helper transport opt-in and
  registration preflight evidence exist.
- Use the registration contract from code for any future launchd plist,
  packaging, and XPC listener label work.
- Do not add privileged filesystem execution until the preflight status can be
  made `ready` with real signing, packaging, and FDA evidence.

## Decision

Proceed to a read-only helper prototype only after the Phase B gate items above
are resolved. Until then, the app must keep `native_rust` as the default engine
and treat any helper-backed engine as experimental.

## Remaining Architecture Risks

Facts:

- The code graph still separates scan orchestration, domain policy, renderer API,
  and Rust traversal into different communities.
- The current graph warning is high coupling between handler registration and
  app utility code.

Risks:

- Adding helper lifecycle code directly into existing scan handlers would
  increase the handler coupling that already exists.
- Duplicating traversal policy inside the helper would break the Phase C
  contract that the main/shared domain owns skip and volume policy.
- Letting renderer state observe helper internals directly would create a
  second status model instead of extending the current scan diagnostics stream.

Direction:

- Add a small `HelperClient` boundary in main process code.
- Keep helper registration/health/version calls behind that boundary.
- Keep policy inputs generated by existing shared/domain scan policy code.
- Map helper events back into the existing scan diagnostics shape before they
  reach renderer state.
- Keep the helper transport module replaceable so the first prototype can use a
  local development channel without locking production to that channel.

## References

- Apple Developer Documentation:
  [`SMAppService`](https://developer.apple.com/documentation/servicemanagement/smappservice)
- Apple Developer Documentation:
  [`SMAppService.register()`](https://developer.apple.com/documentation/servicemanagement/smappservice/register%28%29)
- Apple Developer Documentation:
  [Service Management](https://developer.apple.com/documentation/servicemanagement/)
- Apple Developer Documentation:
  [XPC](https://developer.apple.com/documentation/XPC)
- Apple Developer Documentation:
  [`SecCodeCopyDesignatedRequirement`](https://developer.apple.com/documentation/security/seccodecopydesignatedrequirement%28_%3A_%3A_%3A%29)
