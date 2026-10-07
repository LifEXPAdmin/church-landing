# Shared resource destinations

The portable `@godschurches/shared-core` package exports `AppDestination`,
`ResourceDestination`, `ScreenId` and `NavigationId`. These identify a screen or
resource without importing Next Link, DOM APIs, sessions, Prisma or a native
navigation library. `destinationWebPath` is the explicit web path adapter.
The existing website navigation registry uses `screenWebPath`, preserving its
titles, menu placement, guest filtering, resource availability and admin checks.

| Kind | Identity | Canonical website path |
| --- | --- | --- |
| `post` | `postId` | `/platform/posts/:postId` |
| `comment` | `postId`, `commentId` | `/platform/posts/:postId?comment=:commentId` |
| `church` | `churchId` | `/platform/churches/:churchId` |
| `event` | `occurrenceId` | `/platform/events/:occurrenceId` |
| `profile` | `username` | `/platform/profile/:username` |
| `topic` | `slug` | `/platform/topics/:slug` |
| `screen` | `ScreenId` | Existing navigation registry path |

An event destination identifies an occurrence, not its parent event. A profile
uses a username, not a user database ID. The website's profile and edit-profile
entries currently share `/platform/profile/me`; parsing that address yields the
`profile` screen. Static screens take precedence over dynamic resource slugs.

## Incoming links

`parseDestinationPath` accepts a bounded, raw relative path. It rejects malformed
encoding, traversal, encoded separators, ambiguous destination selectors and
unknown routes. It retains only screen or resource identity. Credentials,
private cursors, authority hints, action parameters and arbitrary fragments
never become app state. Home and reader links with a `post` selector resolve to
that post, optionally with a comment. Existing account-entry behavior continues
to use `safeAccountReturn` and its route-specific allowlists.

The website adapter `parseDestinationLink` additionally accepts an absolute URL
only at an explicitly configured HTTPS origin. Callers must supply trusted app
configuration, never an incoming Host header or query value. It passes the raw
path to the shared parser before URL normalization can remove traversal.
`destinationHttpsUrl` formats a validated destination at that configured origin.
Neither function decides that the destination is public.

Native adapters should consume semantic destinations, maintain an explicit list
of implemented native screens and show their unavailable behavior for other
targets. They must recheck the current session, capabilities and resource access
on arrival, account changes and resume. A link never replays publish, save, join,
RSVP or other mutations. Authentication must continue through the canonical
session adapter. OS association files, native link events, deferred sign-in
routing, background/resume handling and device verification belong to the mobile
consumers of this contract.

## Access and public sharing

Registry membership and a successfully parsed address grant no permission.
`publicSharePreview` remains the server authority for the current public
projection. Profiles retain generic previews. Public post and comment previews
require anonymous readability; a signed-in account's blocks may narrow that
projection. The server still canonicalizes plain reposts, rechecks sources for
share images and returns generic fallback content for unavailable/private
resources. Copy, share and QR controls must request a fresh available preview.
`canonicalSharePath` remains exported at its existing `public-sharing` import
path and preserves its validation and errors through `destination-links`.

Only the six current public-share resource forms are mapped. Do not derive
exchange, media or future resource URLs from a generic ID. Existing authorized
resource-card projections own those routes; an exchange listing, for example,
may resolve to an item or skilled-help route. Unknown or reserved resources do
not become available through this contract. Extending public-share projections
requires the existing owning feature and its audience checks.

The public site QR points to Home; `qr` names its presentation screen. The
signed-in navigation entry still opens invitations. Personal invitation tokens
and URLs remain owned by the invitation service, and are deliberately absent
from this general resource parser.

## Verification and remaining gates

Focused checks cover all menu paths, resource round trips, trusted HTTPS origins,
unsafe redirects, private-state stripping, unknown resources and existing
guest/account-return and reader behavior. `scripts/check-shared-core.mjs`
compiles a named-package consumer using ES2022 with no DOM or ambient Node types.
The public-share service's authorization and preview function bodies are
unchanged by this extraction.

The local website build passes its type/lint, hydration, runtime-trace and
client-secret gates. An isolated database with 125 existing migrations passes
4 gallery-sharing, 6 share-card-image, 3 actual production-mode HTTPS sharing,
12 private-draft and 17 resource-attachment checks. These preserve profile/private
fallbacks, source withdrawal, canonical metadata, image revocation and existing
draft behavior. The fictional database and HTTPS server were stopped afterward.

Combined-branch integration, native package bundling, screen implementation,
OS link association, physical-device and release acceptance remain separate
gates. No schema change or production write is required by this change.
