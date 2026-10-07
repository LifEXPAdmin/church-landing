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
