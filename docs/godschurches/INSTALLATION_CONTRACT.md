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

## Update notice implementation

The persistent platform layout passes its server-rendered release identity to
UpdateNotice. The component captures that value once, independently of later
endpoint responses and client navigation. Explicit checks and foreground returns
use no-store reads; foreground requests are serialized and limited to one per
minute. Missing metadata and failed reads remain unknown. Offline recovery asks
the user to keep the current tab open and retry the connection; it rechecks the
session before revealing private work.

Refresh now is offered only for a different known release with clean controller
state. Dirty, saving, publishing, conflict, uncertain retry and pending replacement
choices suppress it. The click handler rechecks current controller state before
reloading. No automatic reload, service worker, CacheStorage or push permission
is introduced. This notice works in ordinary browser tabs; physical installation
and owner acceptance remain separate checks.

## Menu installation help

The platform layout captures the browser's beforeinstallprompt event for later
explicit use from Menu. A dismissed or used prompt is consumed; userChoice
acceptance alone is not labeled installed. appinstalled or an actual standalone
signal establishes the displayed installed state. Missing capability remains
unknown and shows Android Chrome, iPhone Safari and desktop Chrome instructions,
plus an ordinary-browser fallback. The native help dialog restores focus and
scroll state. No notification request or account operation is triggered.

Instructions checked 11 September 2026 against
[Apple's iPhone guide](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios),
[Chrome Android help](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en),
[Chrome computer help](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DDesktop&hl=en)
and the [browser event contract](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event).
The four isolated browser groups in `scripts/qa-installation-browser.mjs` cover
capability and dialog behavior using synthetic events; they do not establish
physical-device installation acceptance.

### Visible Home Screen guidance

Menu and invitation pages offer a dismissible banner for Apple mobile device
guidance or an actual available browser install prompt. Device hints choose
instructions only; they never establish installation capability. The banner is
suppressed in standalone mode and after dismissal. A versioned, non-account
localStorage preference remembers dismissal; blocked storage still allows the
current visit to dismiss it. Permanent Menu help remains available.

The shared dialog expands Safari instructions for Apple devices and explains
opening embedded mail/social/QR pages in a regular browser. Explicit Copy uses
the current page path/query without its fragment; a selectable link remains if
clipboard access fails. It neither redirects nor changes unsent work, account
state, invitation consent or notification permissions. Browser acceptance still
does not prove installation; actual standalone/appinstalled signals are required.
