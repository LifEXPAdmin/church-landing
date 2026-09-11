# Installation and update foundation

11 September 2026 · Selected implementation contract, not a device install receipt.

`lib/platform/install-policy.ts` provides the manifest identity, source icon paths
and a deterministic update decision. `GET /api/platform/release` returns a validated
public 40-character Git commit SHA or null, with no-store; missing deployment
metadata means unknown, not proof that a client is current. No private environment
values, identity or database data are exposed.

The manifest uses ID `/`, scope `/`, start URL `/platform`, standalone display and
Godschurches as the visible name. Root scope keeps same-origin account-return and
church/deep-link routes within the installed experience. Start URL is public and
contains no account or campaign identifier. Normal 192/512 and maskable 512 assets
already exist; retain the current separate Apple touch icon. Manifest wiring and
actual installation guidance are Medium follow-on tasks.

Initial installation is online-first, using normal network navigation and existing
no-store private boundaries. It adds no service worker or application Cache
Storage. No private HTML, RSC payloads, API results, feed/member/prayer content,
image attachments or draft snapshots are persisted offline. Public versioned
static assets may use the existing browser/CDN cache. Offline recovery must say
that a connection is needed, retain current unsent work in the open tab, and offer
retry. It must never present an old private response as current access.

The server shell embeds its validated public build identity in data-release,
using the same serialized value during hydration. Update UI captures that loaded
identity once when it mounts and compares the release endpoint on an
explicit user check or a throttled return to the foreground (at most once per
minute). Store the initially loaded identity for that tab; do not reset it after a
new build is detected. Do not infer the loaded build from the first endpoint
response: a deployment could change between page rendering and that request. Null/failed reads are unknown. A changed identity offers a
refresh, never automatically reloads. While dirty, saving or conflicted work
exists, the shared decision returns keep-work; finish saving or make a deliberate
copy/discard choice first. Because no worker is introduced, there is no automatic
skipWaiting, clients.claim, mixed worker takeover or cached private offline shell.
Any later worker introduces a separate reviewed migration/update/cache contract.

Installation is separate from sign-in and notification consent. Show a browser
install prompt only after a real supported beforeinstallprompt event and a user
click. Otherwise provide platform-specific browser-menu guidance, an already
installed state where detectable, and an honest unsupported/unknown fallback.
Do not guess install capability from user agent alone. Push remains gated on its
own subscription/outbox/provider and real-device acceptance tasks.

Medium implementation must verify ordinary browser navigation, canonical start,
sign-in return/deep links, missing build metadata, changed build with clean/dirty/
saving/conflicting work, offline recovery, supported/unsupported prompt branches,
and no automatic reload. Physical Samsung/iOS installation and account switching
remain real-device acceptance, not established by desktop emulation.

Sources reviewed: [Web Application Manifest](https://www.w3.org/TR/appmanifest/)
for identity/start/scope/display; [MDN service worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
for later worker activation implications. The online-first/no-worker choice is
this project's scoped implementation decision, not a browser requirement.
