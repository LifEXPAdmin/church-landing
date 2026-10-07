# Native core reads

## Implementation checkpoint, 7 October 2026

Selected native GET adapters now reuse the authoritative website read services.
This checkpoint has passed isolated local verification. Release and device
acceptance remain separate. The native session adapter is the
prerequisite. There are no database or dependency changes in this slice.

| Route below `/api/platform/v1` | Contents | Access |
| --- | --- | --- |
| `/capabilities` | Explicit implemented feature names and supported versions | Guest or member |
| `/feed?mode=latest` | Up to 30 current authorized post projections | Guest or member, subject to mode |
| `/posts/:postId` | One current authorized post projection | Guest or member |
| `/profiles/:username` | Safe member profile, optional pin and up to 30 posts | Member |
| `/churches?query=...` | Up to 100 public church projections | Guest or member |
| `/churches/:churchId` | Public church information, up to 3 pins and 30 unpinned posts | Guest or member |

All authenticated core reads require the native Bearer credential and
`X-Expected-Account`. Only an absent credential is a guest request. A malformed,
expired, revoked or deleted-account credential returns 401 and never becomes a
guest. Account identity is checked after the existing permission gate inside
the transaction that authorizes the content. A different original owner returns
`account_changed`. Browser Origin/Fetch Metadata, account cookies, wrong Host,
unknown or duplicate query fields, body-bearing GETs and unsupported methods
are rejected. Session/authentication routes still disallow all query fields.
Responses, including errors, are private/no-store and set no cookies or CORS.

Wire projection is an explicit allowlist followed by strict encoding and a 2 MiB
response bound. A church author never exposes the publishing operator. Current
audience comes from the authorized view, including event audience restrictions.
Hidden reaction totals remain null, including repost sources; source withdrawal
remains null. Own reaction state is absent for guests. `canReply` describes the
canonical permission, not an available native comment action. Comments, media,
resource cards and richer profile/church modules require the website. The
initial cards therefore conservatively report `requiresWeb: true`.

Continuation values are signed opaque cursors bounded to 4096 characters. They bind endpoint,
original viewer, resource and normalized filters, expire after one hour and
retain the original deadline across pages. Feed cursors wrap the existing
service cursor; send both returned `scope` and cursor when reopening a page.
The initial preactivation 2000-character proposal was corrected after reproducing
valid canonical discovery pages with cursors longer than 2000. The internal feed
payload retains its separate 2500-character bound. Mobile consumers must use the
revised schema before activation; older 2000-character decoders accept ordinary
short pages but cannot consume these larger pages.
Profile/church post cursors preserve published-time/id tie breaking. Church
discovery retains the canonical name/id order, which is not a frozen snapshot
under concurrent renames. Every page reauthorizes current privacy and audience.
Invalid native cursor envelopes return `cursor_invalid`; canonical service
conflicts, including recovery-required settings, remain explicit 409 conflicts.

Web React Server Components continue calling services directly. Omitted strict
identity options retain existing website behavior. Church detail composes its
public fields and existing post reader in one read transaction, avoiding the
portal writer and its unrelated account maintenance. Native GET does not renew
session activity. Ranked feeds retain their existing bounded snapshot writes.

Native comment/reaction/post writes, Google sign-in, general media-library
access and push remain unavailable in the capability response. The subsequent
[native private image adapter](NATIVE_PRIVATE_MEDIA.md) adds explicit
`media.images.read`, `media.images.list`, `media.images.upload` and
`media.images.remove` capabilities. Core post cards still conservatively require
the website for their richer content; these image capabilities do not change
those projections or enable audio/video and personal-library commands. The current session endpoint provides
account discovery. Clients must also reject late responses from an earlier local
account generation. Shared mobile/device acceptance and deployment are separate
from these server contracts.

## Verification

Application `b9da150994b4304157abfb0d630a29dc9056f45a`, production build
`5gnNJQZKJ5Ov5U2i0OuFb`: 32 current contract/service checks and 7 real HTTPS
checks pass. Another 25 unchanged canonical/web reader checks are retained from
`ee53926f10305a0cbf84beee9d96950c104f9a8a`: concurrent reads, four feeds,
profiles and profile-location privacy. Changed tests cover 30/31 and 100/101
pagination, revoked/expired/deleted accounts, queued reads, account changes,
church operator privacy, event audience, hidden counts/reposts and long discovery
cursors. Website post rendering still works through the existing route.

Full TypeScript, focused lint, ES2022-only contracts without DOM/Node types,
copy/build/hydration/trace/security checks pass. The previous decoder consumes
all 11 ordinary current fictional examples; its documented large-cursor limit
still applies. Initial fixture-label/repost-opt-in and TLS-host setup failures
are retained alongside the reproduced cursor defect and its passing regression.
All owned fictional runtimes were stopped and their ports checked closed.
Final independent review of `1e2d983` found no remaining concrete issues.
Ready for local integration. No integration or live acceptance claimed.
