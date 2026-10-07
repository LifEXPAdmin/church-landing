# Shared core and native server integration

## Local candidate, 7 October 2026

The shared package, request/controller adapters and semantic destinations from
`ff2efd7` are combined with the native server candidate `4e041af` on
`codex/shared-native-integration-20261007`. This is a tested local release
candidate, not a main merge, production deployment or native-device acceptance.

Six canonical commits were applied with their original provenance. The separate
`48247bb` contract receipt required no application: all five affected files were
already byte-identical. The shared API/auth implementations remain byte-identical
to the current server definitions, with identity-preserving website forwards.
The dependency lockfile, authoritative services, schema and migration set are
unchanged by this integration. The root manifest adds only `check:portable`.

Application source is `3e22d6c`. The production build includes the Menu test
correction at `a5bfac4`, with build ID `EEGEjzZgtOZ6whHwFHazF`. Subsequent
`641072d` changes only test discovery, a browser verification driver and its
documentation. Application, shared package, schema and dependency-lock bytes are
unchanged from the tested build. Its repaired navigation driver was verified
against that exact build.

## Combined verification

- 99 portable checks: 92 contract/request/negative-boundary checks plus seven
  compiled shared-runtime checks. The native-compatible named package consumer
  uses ES2022 without DOM, Node, Next or Prisma imports.
- 71 adapter, controller, destination, navigation and copy checks; 102 existing
  source-security tooling checks after the CI discovery repair.
- 78 database service checks across private drafts, Menu preferences, native
  sessions/reads/reactions, topic recovery, resource attachments and gallery
  sharing. The fictional database applied all 125 existing migrations.
- 22 actual HTTPS checks across native reads, reactions, sessions and private
  media, plus browser draft and resource routes. These cover actor binding,
  private responses, canonical service reuse, rejection and exact replay.
- 17 browser groups: seven composer, five Menu privacy/recovery and five
  navigation groups. Menu recovery records eight exact preference writes and
  three separately validated session-activity renewals. No page errors occurred;
  expected injected 403/409/429/503 and lost-response console failures are retained.
- Full website types, lint (zero errors and 39 existing warnings), authored copy,
  source guard, production build, hydration and public-build secret checks pass.
  Runtime tracing passed for 272 traces, 68,360 entries and 668 server JS files.

Browser evidence includes private-content concealment before fresh access checks,
account replacement, original-account recovery, immutable save retry bodies,
revoked administration, guest and member navigation, browser Back, keyboard
access and narrow/large-text layouts. Inspected screenshots confirm the composer,
Menu save controls and guest Menu remain bounded. These are local browser
observations; simulated lifecycle and keyboard conditions do not establish
physical-device behavior.

## Reproduced integration repairs

The old Menu service test rejected the string `mediaCatalogItem` anywhere in its
response, although implemented media choices legitimately use that resource-kind
metadata. The same failure was reproduced at `4e041af`. The corrected test still
rejects that value as a shortcut ID and verifies a unique restored unavailable ID
is absent from the entire response. Revoked-admin and private-path checks remain.

The older navigation driver likewise assumed guests could not see the implemented
media directory. Guest/member/operator projections matched the prior candidate
exactly. The repaired driver checks the public directory is present and the
publishing studio is absent for guests, while retaining unavailable-module checks.

The existing source-security command discovered the two new portable `.mjs`
suites without their required compilation/storage setup. Both failures were
reproduced. Those suites now live under `tests/portable/`, with explicit commands
updated in the dedicated workflow and package scripts. The existing security
workflow and its five discovered test files remain unchanged. Both complete
commands pass; no failed assertion is skipped or converted to a warning.

The initial private runner also started topic recovery before its database. That
ordering was corrected and the nine checks passed with their real fixture. All
earlier failed-run evidence is retained separately from successful checks.

## Remaining acceptance

Hosted CI, dependency-security remediation, main integration and verified live
release remain separate gates. This candidate does not waive the existing
dependency hold. Native transport, secure credential storage, platform builds,
device journeys and store/provider acceptance remain with their consumers.

The initial native-v1 compatibility baseline is explicitly preactivation. Before
activation, the release owner must verify the supported-client inventory, as
described in `PORTABILITY_CHECKS.md`.

Native draft writes remain disabled. The inherited in-flight save/disposal hazard
documented in `SHARED_REQUEST_CONTROLLER.md` was preserved by extraction and still
requires its own lifecycle repair and regression evidence before activation.
No production migration, provider send or production data write occurred. All
owned test servers, browsers and the fictional database were stopped after checks.
