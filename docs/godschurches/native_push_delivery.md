# Native push through the existing notification outbox

Implementation is undergoing local acceptance. Provider, portable-package,
service, account-erasure, restoration and populated-migration checks have passed.
Actual HTTPS, browser, final review and release acceptance remain open.

Native installations extend `PushSubscription` and use the existing
`SocialEvent`, `NotificationDelivery`, source checks, dated notification consent,
quiet hours, queue, leases and attempt diagnostics. Browser push remains the
`WEB_PUSH` provider with its existing VAPID adapter. No separate event bus or
historical notification backfill is introduced.

## Provider and admission

The initial native adapter is Expo, matching the provisional mobile framework.
It uses the fixed Expo HTTPS send and receipt endpoints without another SDK.
The server must have all of these settings before native registration or sending:

- `NATIVE_PUSH_ENABLED=true`.
- `NATIVE_PUSH_EXPO_PROJECT_ID`, the canonical project UUID.
- `NATIVE_PUSH_EXPO_ACCESS_TOKEN`, a server-only access token.

Native delivery defaults off. The provider's enhanced push security setting,
project association, APNs/FCM credentials, Android notification channel `activity`
and real iOS/Android device acceptance are separate activation gates. A locally
configured environment does not establish that any external setting is correct.
Never place the access token in a client build or diagnostics.

This version accepts bounded bracket-form `ExpoPushToken[...]` and
`ExponentPushToken[...]` routing tokens. Legacy unbracketed tokens are outside
this registration contract. A project mismatch is a configuration failure, not
permission to revoke another installation.

## Native API

Every request uses the native bearer/expected-account boundary, API version 1,
bounded fields, private no-store responses and current server authority. Browser
cookies, Origin and browser fetch metadata cannot substitute for native bearer
authentication. Reads and provider work do not renew session activity.

| Route                            | Method | Result                                                                                                                        |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `/api/platform/v1/push/prepare`  | POST   | Current opaque installation generation, recovery epoch, configuration availability and this account's matching device or null |
| `/api/platform/v1/push/register` | POST   | Fresh association receipt bound to the original request                                                                       |
| `/api/platform/v1/push/devices`  | GET    | Up to eight current account devices, with no routing credentials or session identifiers                                       |
| `/api/platform/v1/push/revoke`   | POST   | Historical removal receipt for the exact owned device version                                                                 |
| `/api/platform/v1/push/open`     | POST   | Currently authorized destination and generic preview; unsupported native journeys require the website                         |

Preparation uses a canonical random 32-byte installation secret in the bounded
body. It does not create storage or disclose previous account ownership. Keep
one secret in platform-secure installation storage across token refresh and
account changes. Registration includes the returned version and recovery epoch,
a client-generated association UUID, mutation UUID, platform, routing token and
label. It never enables notification categories on its own.

Retain the original registration bytes and local credential generation across
an uncertain response. Exact successful retries return the original receipt only
while that association is active under the current account, session, installation
generation and recovery epoch. A conflict requires explicit review and a new
intent; never silently fetch a newer generation and resend old work.

Token rotation and account replacement advance the installation generation,
revoke the predecessor and create a fresh immutable association atomically. A
token already associated with a different installation yields a generic conflict.
The existing combined eight-device cap and notification rate bucket apply.
Cleanup/listing remains possible when provider delivery is disabled.
The capability response exposes `push.prepare`, `push.register`, `push.open`,
`push.list` and `push.revoke`. Registration is unavailable without complete native
provider configuration. Listing and removal are essential cleanup controls and
cannot be disabled by the optional-feature pause setting. The website keeps
device removal visible while delivery is off; browser enrollment still requires
its own VAPID configuration.

## Privacy and recovery

Revocation, logout, credential changes and eligibility loss scrub both browser
and native routing fields and cancel unfinished deliveries. Old writers receive
the same cleanup through database triggers. Late callbacks affect only their
captured immutable association and lease, never a replacement device.

`NativePushInstallation` retains only a domain-separated installation-secret hash
and monotonically increasing version. This is minimal pseudonymous anti-replay
state, not anonymous data. It retains no owner, session, token or association
history, survives account erasure, and has no automatic pruning in this version.
Pruning would make old generation-zero requests valid again. Successful
registration, the existing rate bucket and command-receipt storage cap bound
creation; preparation never creates a row.

Protected restoration rotates the global native registration epoch, including
when an installation was absent from the backup, then revokes restored devices
and sessions. Native sending must be disabled during restoration. A database
backup must never be exposed directly as a running authenticated service.

The public API and exports must never contain native token material, installation
hashes, provider access tokens or provider ticket IDs. Detailed attempt diagnostics
continue to use the existing retention schedule; ticket material is cleared when
a delivery finishes.

## Ticket and receipt processing

An Expo ticket records intake and schedules a receipt poll on the same logical
delivery. It is not device acceptance. Receipt polling retains the captured ticket
through transient errors and missing receipts without resending the notification.
Only an explicit successful receipt records provider acceptance; it never proves
display or reading. A definitive device-not-registered result revokes that exact
association. Provider credential errors leave the device association intact.

The adapter sends only a generic title/body plus an opaque delivery ID and group
tag. TTL is bounded by the canonical source/delivery and session deadlines, at
most five minutes. Provider calls are bounded to ten seconds and 32 KiB responses.
No exception, routing token or raw provider message enters diagnostics.

Polling normally waits up to fifteen minutes, shortened to remain within the
existing delivery and session lifetime, including ten-minute test notifications.
Receipt lifetime and poll count are bounded. Send attempts retain the canonical
eight-attempt budget; the eighth send can still poll its ticket. A crash after
provider intake but before ticket persistence can cause a repeated generic push.
The existing lease and collapse tag limit duplication but cannot promise exactly
one provider delivery.

Expo documents the distinction and timing in
[sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/)
and the [push FAQ](https://docs.expo.dev/push-notifications/faq/).

## Verification and release

The provider and portable-contract tests use fictional tokens and injected
transports. Real provider networking, store/native builds and device acceptance
are separate from these checks. Complete local migration, restoration, service,
HTTP, browser, existing web-push regressions and independent review before marking
this implementation ready for integration.

Run the focused service suite with `npm run test:post-workspace -- --native-push`.
The normal portable check includes native push wire contracts and compiles a
consumer without browser, Node or framework types. The populated migration test
compares every original column across existing tables and exercises retained
web-push delivery after the additive migration. Local restoration tests use an
actual database dump and restore before rotating the recovery epoch.

Activation requires the combined application/schema release and verified queue
consumers. Keep native sending disabled across a rollback to a web-only worker:
an old worker safely cancels unsupported native rows but cannot deliver them.
Keep ordinary security, migration, canonical deployment and live checks open.
