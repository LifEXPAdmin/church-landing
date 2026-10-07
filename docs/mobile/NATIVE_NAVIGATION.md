# Native navigation preparation

The native navigation adapter consumes `AppDestination`, `ScreenId`,
`parseDestinationPath` and `destinationWebPath` from the canonical shared core.
It introduces no router, transport, session implementation or dependency. The
existing fictional App journey stays unchanged until real session integration
has its own verified receipt.

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

## Session integration gate

The secure vault's restored credential candidate is not an authenticated session.
The session owner must finish foreground verification and supply the current
verified account and credential generation before activating private navigation.
Each private destination needs a fresh authorized server read; a route or cached
resource ID grants no access. Do not render retained private content while that
read is unresolved or denied.

Contextual sign-in return handling is deferred to that accepted session interface.
Retain at most one bounded destination identity in memory, bind it to the original
guest/credential generation, and clear it on cancellation, logout, replacement,
account switch or disposal. Revalidate on foreground and after sign-in, including
same-account credential replacement. Do not persist URLs/tokens or automatically
replay writes. This preparation deliberately does not invent a competing pending
session controller.

## Verification and next step

Unit checks cover trusted-origin/raw-path security, canonical route precedence,
query-data removal, tab reordering and explicit availability/fallback behavior.
Link security vectors also run with the locked WHATWG URL implementation that
Expo installs at native startup, as well as Node's URL. This is library-level
evidence; it does not launch Hermes or an OS link event.
Type and import checks cover the actual native package. These establish source
contracts, not native navigation, authenticated return, system Back, modal/dirty
entry dismissal, process death, screen-reader focus or device link acceptance.

After the session interface is accepted, wire these pure adapters to the canonical
app's navigator, render the replaceable native tab controls, and verify the first
real sign-in/feed/post/sign-out journey before enabling broader feature screens.
