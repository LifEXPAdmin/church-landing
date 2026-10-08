# Native navigation preparation

The native navigation adapter consumes `AppDestination`, `ScreenId`,
`parseDestinationPath` and `destinationWebPath` from the canonical shared core.
It introduces no router, transport, session implementation or dependency. The
current App connects `NativeJourney` screens to the shared session, navigation
and reading runtime through `createNativeFixture`. Its responses and credential
vault remain fictional and in memory. The Android fixture checkpoint below
records local emulator evidence; real-network and physical-device acceptance
remain open.

## Presentation and availability

`mobile/src/navigation/primary-navigation.ts` projects five stable slots:
Home, Churches, Explore, Messages and Menu. The church slot becomes My church
for a verified member, matching the website. Slot IDs remain stable when labels
or order change. A layout must contain all five slots exactly once; its optional
labels are bounded. Returned projections are fresh immutable data.

Native screen/resource availability is explicit. The default enables no real
screens. `nativeNavigationSupport` distinguishes invalid identity, unavailable
renderer and an implemented renderer that still requires current access checks.
Its website fallback is a canonical path containing destination identity only.
Do not automatically open a browser, WebView or unimplemented feature. A later
screen can offer a deliberate website action through its trusted-origin adapter.
Bundled availability is never server permission or a substitute for capability
negotiation. Administrative visibility remains server-derived.

## Incoming link boundary

`createNativeLinkReader` requires one exact trusted HTTPS origin supplied by
reviewed application configuration. It rejects relative links, foreign origins,
credentials, unsupported schemes, control characters and oversized input. It
passes the original path/query/fragment to the shared parser, because URL.pathname
would conceal dot-segment traversal. The canonical parser owns route precedence,
resource identifier bounds and destination-selector ambiguity. Only typed
destination identity survives; token, action, cursor and other incidental query
data never become navigation state.

This adapter does not register App Links/universal links, accept custom-scheme or
OAuth callbacks, verify domain associations, authorize a private resource, or
launch a navigator. The existing custom-scheme fixture remains separate and
deliberately narrow. Platform link configuration and cold/warm device acceptance
must follow their own receipts.

`observeNativeLinks` admits one normalized destination through the native
lifecycle boundary. Android can deliver `onNewIntent` while the activity is
paused, before `onResume`. An address received while concealed may wait only for
the immediately following foreground verification. It dispatches no read and
exposes no destination while concealed. An address already delivered before
concealment is discarded as before.

The pending delivery binds to that verification generation and, when the observer
has a previously verified account, that same owner. Logout, cancellation,
verification failure, another account or generation, a second concealment after
verification starts, and disposal drop it. A verified guest can use the existing
explicit contextual sign-in flow. Only one address is retained, and a newer valid
delivery replaces it. A delayed initial URL may cross the first startup
verification, but no later lifecycle change or newer URL. No raw URL, credential,
private content, disk record or background read is introduced.

## Session integration gate

The secure vault's restored credential candidate is not an authenticated session.
The session owner must finish foreground verification and supply the current
verified account and credential generation before activating private navigation.
Each private destination needs a fresh authorized server read; a route or cached
resource ID grants no access. Do not render retained private content while that
read is unresolved or denied.

`session-navigation.ts` now consumes that one session controller. It keeps at
most one bounded, canonical destination identity in memory. Only its explicit
contextual sign-in command may adopt that address after the session verifies the
account. A sign-in initiated elsewhere cannot inherit a guest's pending address.
No token, URL, private content or request client enters navigation snapshots.

Backgrounding, failed sign-in, cancellation, logout, generation replacement,
account switch and disposal discard the return address. Verified foreground
restoration starts at Home, including a new credential for the same account.
Snapshot reads ask the session authority to enforce its current deadline. Only a
verified foreground owner receives an active destination; that address still
requires a fresh authorized resource read. Navigation never dispatches it itself.
Unavailable renderers remain unavailable, without an automatic website action.
Cancelling a return clears the address only. Cancelling authentication uses the
session controller's sign-out operation, including its credential cleanup.

## Verification and next step

Unit checks cover trusted-origin/raw-path security, canonical route precedence,
query-data removal, tab reordering and explicit availability/fallback behavior.
Fourteen additional checks run contextual return against the actual session
controller, vault and request adapter with a fictional wire. They cover held
sign-in/logout replies, account replacement, backgrounding, deadline expiry,
reentrant sign-out/disposal, invalid/unavailable targets and disposal. The expiry
callback can dispose navigation, so commands recheck that state after callbacks
before retaining a return or dispatching sign-in. These are source
integration checks; no native UI, device or real-network acceptance is implied.
Link security vectors also run with the locked WHATWG URL implementation that
Expo installs at native startup, as well as Node's URL. This is library-level
evidence; it does not launch Hermes or an OS link event.
Lifecycle regressions reproduce Android's paused-intent ordering and initial URL
resolution before, during and after startup verification. The actual shared
runtime proves a fresh post read wins over restoration's feed continuation.
Cancellation, logout, owner replacement, failure, repeated concealment and late
initial delivery retain their invalidation checks.
Type and import checks cover the actual native package. These establish source
contracts separately from the native fixture checks below. Real authenticated
return, modal/dirty entry dismissal, process death, screen-reader focus and
physical-device link acceptance remain open.

### Android fixture checkpoint, 8 October 2026

Clean source `288e6e366865504490ef26681cef8e632c21f3cb` built and ran on an
Android API 36 ARM64 emulator using the local debug signing key. The identified
APK includes the link lifecycle repair and the shared iOS build configuration.
After the locked dependency install and Android prebuild, all 36 generated
Android source files matched the previous build inputs. The merged manifest
still excludes the six blocked broad storage/media permissions.

Actual native checks opened the fresh fictional post from an external link
while already open, from an external link after Home/background, and from the
in-app link button. A cold launch held the destination at the welcome screen,
then opened the post after explicit demo sign-in. System Back returned to the
feed. Sign-out cleared the post; a new demo session opened the feed without
replaying the old destination. Earlier failure evidence and the distinct older
APK remain retained with the private task receipt.

These checks use fictional in-memory responses. They do not accept a real
account, verified HTTPS App Links, a physical device or an app-store release.
The iPhone first Open-app confirmation sequence, active then URL then inactive
then active, remains separate: an address delivered before concealment is still
discarded. Its owner must reproduce and verify any repair while preserving the
Android cases and all session/owner invalidation checks.

The shared runtime and native controls are already composed in the fictional
journey. Next, use a verified nonproduction HTTPS endpoint and fictional account
data to connect the prepared native wire and secure vault. Compile identified
iOS and Android builds, then verify the real sign-in/feed/post/sign-out journey
and the platform behaviors above before enabling broader feature screens. See
[verification](VERIFICATION.md) for the distinct source, native and device gates.
