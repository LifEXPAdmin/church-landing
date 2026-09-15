# Phone notification contract

## Expanded preferences and shared worker — 15 September 2026

The [notification integration](NOTIFICATION_INTEGRATION_CONTRACT.md) adds explicit
person/church author bells, reaction/prayer grouping, church/commitment outcomes
and twelve independent Activity/phone categories. New phone categories start off;
Follow and membership do not grant notification consent. Current source, recipient,
opt-in and device boundaries apply at delivery/opening. Group replacement tags
are opaque and owner-scoped; phone previews stay generic.

The existing `/api/queues/comment-followers` function retains its single
`comment-followers-v1` queue trigger. Strict message kinds route new Activity and
scheduled-publication work to their separate domain owners; legacy comment
payloads are unchanged. Domain-prefixed keys prevent cross-kind deduplication.
No additional function, trigger, cron or provider plan is required. The SDK's
verified delivery metadata remains the boundary; there is no public callback.
See [complete acceptance](NOTIFICATION_INTEGRATION_ACCEPTANCE.md) for the exact
deployment, non-recipient native probes and remaining physical-phone acceptance.

## Explicit conversation followers — 14 September 2026 candidate

A new canonical comment records one content-free continuation only when existing
explicit conversation followers exist. It processes at most 20 candidates per
transaction using the shared permission gate and a job-row lock. The recipient
intent and cursor commit together. Direct replies and selected mentions retain
their immediate recipient path and shared per-comment/recipient deduplication.
No ordinary person/church following is treated as a conversation subscription.

The existing Follow/Default/Mute controls own this choice. Follow adds future
replies to Activity; Default retains direct replies/mentions; Mute suppresses the
thread's Activity and phone delivery. A maintained followedAt boundary prevents
late follows or unfollow/refollow from replaying old comments. Every recipient
rechecks canonical post/comment access, current account, blocks and church scope.

Phone category conversations is an independent, initially off choice. Its consent
start and each device's creation precede the comment; changing unrelated choices
preserves that start, while removing/re-enabling the category starts a new period.
Later opt-ins/devices cannot produce historical alerts. Existing quiet hours,
generic payload, source-lived deduplication, current-source open and session-bound
device revocation remain authoritative. Reads, mutes and access changes still
suppress delivery. No new provider, dependency or scheduled task is introduced.

The after-response path processes one page and hands unfinished work to the
comment-followers-v1 native queue. A callback processes at most three pages before
retrying its durable cursor. Failed handoffs remain repairable by the existing
secured daily notification maintenance; health reports pending jobs and age.
Work older than seven days is finished without fanout. Completed job diagnostics
expire after 14 days; all jobs after 21. Canonical recipient events remain the
deduplication guard. Comment deletion cascades the job. Isolated restoration
quarantines unfinished follower work before reopening traffic.

Migration 52 preserves existing preference fields and known follow dates, with no
old-comment jobs or phone opt-ins. Preserve category values on rollback; forward
repair preference controls rather than downgrade their allowlist. Physical phone
alert/display/tap acceptance remains distinct from isolated provider callbacks.

## Comment reply and mention extension — 13 September 2026

The comment service now adds a single `COMMENT_ACTIVITY` recipient intent alongside
its existing canonical comment/mention events. It reuses SocialEvent, the existing
device outbox, native queue, exact command receipts and source resolver. There is
no message-body copy, new table, provider or runtime dependency. A comment has at
most seven immediate candidates: five selected mentions, its personal post owner
and its personal parent-comment owner. Self-notifications are excluded; church
publishers are not inferred to be recipients for the church's public identity.

Phone categories `replies` and `mentions` are separate explicit opt-ins, initially
off. Enable notifications retains its existing message/request defaults. An active,
currently permitted mention takes the mention category; otherwise a qualifying
personal reply takes the reply category. The same comment never creates a second
recipient intent merely because both apply. Creation, delivery and opening recheck
the canonical post/comment, church access and personal/church speaker visibility.
Thread mute and applicable person/church mute or snooze stop optional delivery;
they do not revoke an otherwise permitted direct link. Removed mentions, deleted
comments, withdrawal, blocks and lost access cannot reveal unavailable content.

Unchanged edits, receipt retries, later opt-ins and new devices do not backfill old
alerts. Existing legacy mention events also prevent backfill. A newly selected
mention is a new recipient event. Delivery retains the existing generic preview,
quiet hours, lease/backoff limits, device/session revocation and account-bound
click handling; an available link targets the exact comment. Queue publication
runs after commit and its failure leaves recoverable intent without undoing a
successful comment. No application flow promises a heads-up phone pop-up.

The new migration extends only the category allowlist and requires a recipient for
comment activity; existing preferences and quiet-hour constraints remain intact.
The account export now includes phone categories, report/founder choices and quiet
hours. Source comments remain on their posts. A unified Activity inbox, author bells
and delivery to every thread follower remain separate unfinished scopes.

For an operational pause, the existing push flag stops optional delivery while
comments remain usable. Preserve the expanded database constraint and users'
choices during a rollback. The older application cannot save preferences containing
new category values; use a forward repair for those controls instead of deleting
opt-ins or downgrading the constraint. Physical comment-alert/tap acceptance remains
separate from the recipient's observed test-notification receipt below.

## Recipient phone observation — 13 September 2026

On live 2026.09.13.28, the recipient reports a Chrome notification visible in the
phone notification shade. A heads-up pop-up was not observed; no change to that
attention behavior was requested. Read-only production verification independently
finds two recent recipient-test deliveries accepted with provider HTTP 201, one
attempt each. The verification itself sent nothing and made no application write.

This establishes provider acceptance and recipient-reported phone receipt for
these tests. It does not establish the exact model/OS, a locked-screen state,
correct-conversation tap/reply, permission removal, account switching or iPhone
Home Screen behavior. Those remaining physical checks and founder activation stay
open. Earlier statements that no actual Web Push or phone receipt was observed
are superseded to this limited extent; automated tests remain separate evidence.

13 September 2026 — published and enabled in 2026.09.13.27. Server key validation,
native queue acceptance and secured maintenance passed. Actual Web Push provider
acceptance and physical-device observation remain open. See
[the release receipt](MESSAGING_RETENTION_REPORT.md).

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
The same secured route's explicit `?mode=probe` publishes one nonexistent delivery
reference to the private phone queue with a 60-second lifetime. Confirm its provider
receipt and the matching deployed consumer's successful invocation. It creates no
message, device, outbox row or phone notification; it is queue acceptance evidence,
not Web Push provider acceptance or observed device delivery. Local execution
requires an injected fixture publisher and cannot publish a production probe.
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

The final built notification suite now passes eight groups, including an incoming
notification while the shared post composer is dirty. Text remains until saved;
then closing the composer and following the notice rechecks the source. Founder,
announcement and permanent-closure browser suites bring this batch to 20 groups.
