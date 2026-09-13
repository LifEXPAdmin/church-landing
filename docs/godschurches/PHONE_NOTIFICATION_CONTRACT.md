# Phone notification contract

13 September 2026 — local implementation; production configuration, deployed
queue acceptance and physical-device observation remain open. Isolated browser
integration is verified; it does not establish real push delivery.

## Sources and access

Use the existing social event, conversation, per-member read/mute state and report
review services. A canonical event commits with its source; a delivery row commits
with the event only for an already enabled eligible device and opted-in category.
Historical events are not scanned to backfill notifications when activation changes.
No message, request purpose, report details or member identity is copied into a push
payload, outbox or diagnostic. The lock-screen text is generic. Links resolve the
canonical source through current account, conversation and reviewer permissions.

Optional in-app message/request alerts and phone categories are independent.
Founder-announcement opt-out is a separate category control and does not disable
personal replies. Quiet hours affect optional push, not prompt in-app state. Store
start/end wall-clock minutes with an explicit IANA zone. At daylight-saving gaps,
move the boundary forward; repeated starts use the earlier instant and repeated ends
the later instant. Recheck the window before every provider attempt.

## Device and session boundary

Subscriptions require a verified eligible adult, current authenticated session,
same-origin POST, expected account and exact-body mutation receipt. Store browser
keys only in the private database and browser PushManager. Accepted delivery hosts
are the supported Chrome, Safari and Firefox push services; arbitrary URL fetching
and endpoint-only reassignment are rejected. A browser-secret binding and matching
subscription keys can replace that browser's association without exposing its
previous owner. Each account has at most eight active device associations.

Never reassign an existing row to another owner or session. Revocation immediately
nulls endpoint, keys and binding/endpoint hashes and cancels unfinished deliveries.
Database triggers cover session removal, credential change, account restriction and
permanent closure. Expired rows cannot send; maintenance scrubs their material.
Account erasure removes the closed owner's remaining notification rows.

A test request is deliberately made by the current recipient for their current
session's device. It is limited to three requests per ten minutes, exact retries
are free, quiet hours apply, and its intent expires in ten minutes. There is no
operator bulk-test endpoint and no production backfill.

## Delivery and recovery

Pinned standard Web Push and native Vercel Queues implement transport, encryption,
signing and delayed retries. The queue stores only an opaque delivery ID. Its
consumer is configured as a private queue trigger. A post-response dispatch failure
leaves the authoritative database intent intact. Daily secured maintenance repairs
up to 500 undispatched/stale handoffs in bounded batches; the current Hobby plan's
daily schedule is a fallback, not a promise of minute-level recovery from a queue
outage. Failed recovery returns 503 and retains work. Normal committed sources
attempt immediate queue handoff.

Social delivery intents expire after seven days, queue retention is seven days,
and submitted browser payloads have at most five minutes TTL. Workers serialize
with current permission changes, claim a one-minute lease and attempt at most eight
bounded sends. Retry transient network, 408, 429 and server failures with exponential
backoff; 404/410 immediately revoke the subscription. Source withdrawal, blocking,
read/mute state, preference changes, revoked access and expired sessions suppress
subsequent delivery. An already submitted generic notification cannot be recalled.
Web Push is at-least-once: provider acceptance is not proof of display or reading;
stable browser tags collapse duplicate notifications where the browser supports it.

Keep source-lived terminal idempotency guards so diagnostic expiry never resends an
old event. Remove content-free delivery attempts and outcome summaries fourteen
days after final delivery completion. Test intents expire from storage after fifteen
days. Account and report/message erasure remove their linked notification records.
Restoration must invalidate restored devices and pending deliveries before traffic;
the operational restoration gate remains separately required.

## Configuration and activation gates

`PUSH_ENABLED`, the matching `PUSH_VAPID_PUBLIC_KEY` / `PUSH_VAPID_PRIVATE_KEY` pair,
and `PUSH_VAPID_SUBJECT` are server configuration. Keys must be preserved securely
across deployments; do not generate a different identity per request. Vercel queue
OIDC uses the existing project. `CRON_SECRET` protects maintenance. No paid messaging
vendor or new database is required. Local tests inject queue/provider transports and
must never publish to a real Vercel queue inadvertently.

Before enabling production push: verify the deployed trigger and cron, VAPID
configuration, device and permission UI, logout/account-switch behavior and
restoration cancellation. Secured maintenance `?mode=inspect` is read-only and
returns configuration availability, a fingerprint of the public VAPID key and
aggregate device/pending counts; it never exposes subscription material.
Reviewer access separately gates new contact, message sending and founder
welcomes. Independent settings and recipient-initiated tests can operate while
that access is being established. Verify the integrated welcome/message journey
with a currently authorized founder before claiming it live. Keep actual
Android and iPhone installation, permission and lock-screen delivery checks open
until an owner observes them. The existing installation help and safe update notice
remain the owners of installation instructions and preserving unsaved work.

## Permission and browser interface

`/platform/settings/notifications/availability` owns category/channel choices,
quiet hours, device enable/remove and recipient test controls. No visit or signup
asks OS permission. A deliberate Enable notifications tap asks once, then associates
the current account/session and opts into message/request phone categories without
changing ordinary contact permissions or founder-announcement opt-out. Denial and
unsupported iPhone browser state provide installation/settings guidance. Existing
installation help remains shared.

Uncertain saves keep their exact serialized body and mutation ID. Conflicts preserve
local choices until the user deliberately adopts the current version or discards
them. The quiet-hours preview names the zone and next-day boundary. Tests report
queued/attempted/provider-accepted/failed separately; a quiet window beyond a test's
ten-minute lifetime cancels it instead of sending a stale test afterward.

The push-only service worker caches no pages or private data. It ignores payload
text and URLs. Clicks focus an existing app and pass the opaque reference through
its unsaved-work guard; a closed app opens the authenticated reference route.
Reauthentication can resolve the same owner's still-authorized source; another
owner cannot. Password/Google account switches revoke the replaced browser session.
Browser reconciliation removes previous-account associations and reacts to observed
permission revocation without prompting again.

Seven isolated browser groups pass, including 320/390/1440-pixel layouts with
increased text size. The latest focused worker/subscription/outbox/session run
passes seventeen tests; the preceding broader UI/account regression run passes
thirty-three. Production build and runtime-trace checks pass. Provider acceptance,
real phone delivery, founder integration and restoration remain separate gates.
