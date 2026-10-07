# Portable shared core

`packages/shared-core` is the canonical source for selected post input shapes,
options, editor hints, semantic destinations, request attempts, the headless draft
controller, and API/native-auth wire decoders. Existing website import
paths forward to this same implementation. The private package is versioned
`0.1.0` and has no runtime dependencies. It does not change the root npm workspace,
lockfile, deployment layout or mobile framework choice.

## Consumer boundary

The canonical mobile app can add a local file dependency on
`@godschurches/shared-core`, resolving the path relative to its accepted app
directory. Its package entry exposes TypeScript source for Expo/Metro or another
TypeScript-aware bundler. A plain Node process must compile that source first.
Keep one source copy. Do not copy these contracts into platform-specific folders.

```ts
import {
  draftProblem,
  POST_TOPICS,
  type PostDraft,
  type PrivateDraftPayload,
  type DraftTransport
} from "@godschurches/shared-core";
```

Exports cover post/discovery/resource/photo-reference shapes, post categories,
topics and preview helpers, editor validation, draft state/transport, destination
parsing and web paths, request attempts, and the canonical API/native-auth schemas.
Existing web callers continue using their current module paths. The shared check
resolves the actual package manifest through a separate native-compatible consumer
with only ES2022 libraries and no ambient types. It rejects dependencies outside
the package source.

## Preserved behavior

`draftProblem` is an editor/publication hint, not a private-autosave validator or
authorization decision. Private drafts still accept incomplete content and their
existing larger limits on the server. Post-category values match the Prisma
schema, while the shared package never imports Prisma.

`PrivateDraftPayload.replyAudience` retains `null` for a legacy unresolved choice.
Publishing still requires an explicit valid selection. Optional omitted fields,
reference-only photos/resource cards and the existing serialization whitelist
remain unchanged. `PostDraft.linkUrl` remains optional; the saved payload requires
it. Preview receipts are not part of the persisted draft payload.

The draft-controller implementation now lives in shared-core; the existing web
path supplies browser timer and UUID adapters. Native integration still requires
reviewed endpoint mapping and lifecycle adapters before enabling draft writes.
The initial mobile reading journey does not activate them. See
`SHARED_REQUEST_CONTROLLER.md` for preserved browser behavior and teardown gates.

The API and native-auth implementations were consumed byte-for-byte from the
reviewed canonical receipt `64e2106`, then moved into this package. The two legacy
`lib/platform` contract files are export-only forwards; both paths share the same
schema objects and `WireContractError` class. Fictional examples stay outside the
runtime package. Response decoders preserve owner/audience constraints and strip
unknown additive fields; server encoders still reject unintended fields. See
`PORTABILITY_CHECKS.md` for the explicitly reconciled preactivation baseline.

Authoritative request handling, account/audience checks, cryptography, database access,
transactions and upload handling remain in website server modules. Browser social
transport, DOM UI, resource availability gates, native credential storage and
versioned API server implementation remain platform-specific. Canonical website
tasks continue to own backend policy and route changes.

## Verification

Provide an existing task-owned generated directory; there is no internal-disk
fallback or automatic cleanup of retained evidence:

```sh
GC_SHARED_CORE_TMP=/absolute/task/generated/tmp node scripts/check-shared-core.mjs
GC_SHARED_CORE_TMP=/absolute/task/generated/tmp npm run check:portable
node --import ./tests/register.mjs --test tests/draft-controller.test.ts
npm run check:copy
```

The shared check records a named-package no-DOM consumer compile, complete source
dependency list, compiled JavaScript/declarations and runtime test output in a
fresh generated directory. Runtime checks cover website/source identity, schema
category agreement, newline/length boundaries, locality consent hints and safe
preview fallback. The website copy gate includes the moved shared source and a
negative fixture proves that invalid authored copy there still fails. The existing
controller suite covers account switching, legacy
permissions, exact retry bodies, unsent work and private group destinations.

This source-package receipt is distinct from a Metro bundle, Android/iPhone native
build, device journey, database integration run or production release. The shared
mobile consumer must record those relevant checks against its actual app commit.
No production data migration or new environment variable is required.

## Add a feature through the existing boundaries

Start from the selected private task and its verified canonical receipt. The
website queue owns server/API/shared-package engineering; mobile queues own
native presentation, adapters and acceptance. Reserve the original task and exact
files/contracts before changing them. A platform worker can consume or take over
unclaimed eligible work without creating a second implementation.

1. **Service and policy.** Find the existing server service, permission check,
   transaction and canonical record. Extend that owner when required. A native
   route validates its transport and calls the same service; a hidden control,
   client capability or expected-account value never grants authority.
2. **Contract and compatibility.** Put only runtime-neutral, bounded input/output
   schemas and client logic in this package. Project explicit DTO fields, retain
   viewer/resource bindings, and test older decoders when adding fields. Preserve
   the API version and capability policy from the server receipt. A package
   version alone does not prove that a server or native binary supports a feature.
3. **Adapters and state.** Reuse the shared request executor. Browser cookies and
   native bearer/secure storage remain separate transports. Native requests bind
   the original owner and local credential generation, with cancellation and
   bounded bytes/deadlines. Preserve a write's exact operation identity after an
   uncertain reply; never add automatic replay. Keep one account-bound state
   owner and implement cleanup before adding persistence or offline behavior.
4. **Presentation.** Use the existing mobile runtime and controllers, semantic
   tokens and small native primitives. Add only implemented destinations to
   availability. Reuse domain data without copying DOM components or server
   policy. Identify genuine iOS/Android differences explicitly.
5. **Verification and handoff.** Reproduce a reported defect, then check the
   changed policy/contract, browser consumer, native adapter and real device
   journey at the appropriate layers. Record exact commits, configuration,
   app/build IDs and devices. Save the original task's receipt and hand it to
   each consumer. Keep local source, branch integration, native acceptance,
   main/live and store release separate.

### Trace the first reading journey

The feed/detail slice illustrates the division already present in source:

| Owner | Current source | Boundary |
| --- | --- | --- |
| Canonical website | `lib/platform/feed-reads.ts` and the verified native read/API receipt | Select content and enforce current account/audience access on the server. The receipt identifies the actual route checkout; it may be newer than this worktree. |
| Shared package | `packages/shared-core/src/api-contracts.ts`, `native-auth-contracts.ts`, `request-client.ts` | One schema and request implementation, consumed by the website forwards and named mobile package. |
| Shared mobile state | `mobile/src/session/runtime.ts`, `session-controller.ts`, `mobile/src/reading/read-controller.ts` | Compose session/navigation/read state; retain one finite page and make a fresh post-detail read. |
| Native adapters | `mobile/src/platform/request-adapter.ts`, `native-json.native.ts`, `secure-credentials.ts`, `mobile/modules/` | Fixed reviewed HTTPS configuration, native network/storage and platform lifecycle behavior. |
| Native UI | `mobile/src/ui/NativeJourney.tsx`, `NativePost.tsx`, `primitives.tsx`, `theme.tsx` | Render verified state and explicit recovery using replaceable presentation. |

The current app entry still selects an explicitly fictional in-memory wire and
vault. The native ports and password UI are prepared. Activate them using the
same reviewed non-production configuration for transport and credential storage,
then verify the actual native builds and device behavior. See
[the native journey](../mobile/NATIVE_JOURNEY.md),
[transport](../mobile/NATIVE_TRANSPORT.md),
[bounded reading](../mobile/BOUNDED_READING.md) and
[compatibility](../mobile/COMPATIBILITY.md).

### Review evidence at the right layer

- Confirm one canonical policy/record and one shared contract implementation;
  inspect full affected modules and revalidate any reused reading receipt.
- Test current access, unavailable content, account replacement, cancellation,
  lost replies and explicit recovery. Keep device-specific gaps named.
- Record actual payload bytes, request counts and client bundle costs where
  relevant. Do not infer native download, installed size, startup or memory from
  a JavaScript export, source line count or a reuse percentage.
- Native permissions, dependencies or modules require a rebuilt binary.
  Successful types, unit tests, autolink discovery or Hermes exports do not
  establish a three-consumer feature. Reuse exact native build/device evidence
  when it becomes available instead of replacing it with a second fixture run.

Recipe recorded 7 October 2026 from the prepared first-journey source. Real
iPhone/Android launch, canonical staging integration and the combined
cross-consumer proof remain open; this documentation does not close them.
