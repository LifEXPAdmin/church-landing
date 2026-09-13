# Adult message implementation receipt

## Integrated interface verified locally — 13 September 2026

Messages now occupies the mobile and desktop navigation slot, while Home and
Menu retain My feed. Profile Message reuses the contact-policy lookup and resumes
the canonical conversation; renewed acceptance after unblock keeps that same
history. Requests link to their accepted conversation. Inbox rows show authorized
identity/avatar, canonical latest text/date and own unread state. Desktop combines
the bounded inbox and selected thread in one authorized read; mobile fetches the
thread without the hidden list. The workspace stays out of unopened page chunks;
global navigation reads only scalar activity counts. No dependency is added.

The text composer retains exact unconfirmed bodies and allows deliberate current
access review after a conflict. Account replacement, unsent Back/navigation and
safe-update protections pass. Bounded active-page catch-up preserves sequence and
excludes unseen messages from read markers, including the obscured navigation/
keyboard area. One observer covers the rendered message ends. Mute, archive and
clear-for-me retain distinct canonical behavior; new incoming messages restore
an archived inbox entry without unmuting. Selected old-message links and Report
open only an owned bounded window and the selected evidence. In-app choices do
not change contact permission. Presence, delivery/read receipts and outbound
notifications remain unavailable.

Nineteen enabled and nine paused messaging browser groups, plus eight enabled
and five paused contact regression groups,
pass with no page errors. The two-account browser flow goes from a profile through
request/acceptance to a real send and persisted inbox resume. Types, production
build and scoped lint pass. Fresh service/navigation checks cover owned selected
windows, outsider/cleared cursors, desktop batching and revoked-consent resume.
The complete release gate is still pending at this checkpoint. Paused checks
confirm retained history/cleanup while new sends stay unavailable. The earlier
synthetic test assertions were repaired to wait for
actual server confirmation and to scroll a message into view before expecting a
read marker; a native controlled checkbox is checked after its saved response.
The paused inbox assertion now derives its expected count from canonical state,
since the fixture deliberately archives one conversation. Actual dark/largest-
text surfaces and 320/390/1440 layouts were inspected. These
are automated browser results, not new physical-phone observations.

A fresh encrypted PostgreSQL 17 production backup restored and rehearsed all
three additive migrations (33 to 36), preserving original-column fingerprints
across all 77 existing tables. New messaging tables remain empty in that restored
production fixture and legacy contact preferences default to NOBODY. Production
has not yet been changed by this milestone. Actual reviewer coverage, independent
escalation/recovery and retention/erasure operations still gate new intake;
parent, broader activity/delivery and owner acceptance remain open.

## Durable in-app activity verified locally — 13 September 2026

The existing SocialEvent owner now stores unique source references for contact
creation, acceptance and text messages. It does not copy their private bodies.
Current authorized projections recheck adult eligibility, recipient request
policy, bilateral blocks, accepted consent, visible/read positions and personal
mute choices. Operational pending-request counts remain available when optional
request alerts are off. Versioned request/message alert choices extend the
existing SocialPreferences owner without changing contact permission. Email,
push, external delivery and broader quiet-hour scheduling remain unimplemented.

Fresh checks pass: 43 service groups and ten enabled plus ten paused HTTP groups,
including exact event deduplication, invalid mixed-source database shapes,
orphan/outsider suppression and independent alert preferences. The first enabled
HTTP invocation lacked its matching test environment switch; the corrected run
passes all ten checks. Types, scoped lint and production build/runtime tracing
pass. Migration `20260913000300_message_activity_intents` is isolated-only; its
backfill derives reference IDs and dates from canonical source records. No new
worker, table or runtime dependency is added. Inbox/profile/reconnect UI and the
complete first messaging release gate remain next. Production is unchanged.

## Text/history service verified locally — 12 September 2026

The service extends the existing sorted two-person conversation membership from
[the contact milestone](ADULT_CONTACT_REPORT.md). One immutable message record
holds each accepted text send, with an increasing conversation sequence and
unique sequence constraint. Personal read/mute/archive/hidden-prefix state is
separate from membership and never grants permission. It adds no attachment,
presence, encryption claim, worker or runtime dependency.

`adult-messages.ts` and `/api/platform/messages` provide authorized send, bounded
history/inbox reads and versioned personal choices through the existing social
receipt and abuse-limit owners. Current eligible participants alone can read
retained history; new sends additionally require current accepted consent,
bilateral block checks and real reporting availability. Block/unblock does not
restore consent. Request preferences cannot override an accepted conversation
or a block. Exact retries return IDs/sequence receipts without a second message
or quota charge, including after operations pause. Stale permission versions
conflict before a new send.

History pages hold at most 50 messages and inbox pages 30 conversations.
Conversation-owned cursors prevent cross-thread reads. An indexed last-message
lookup avoids copied preview bodies or fetching an entire history; related
people, states and unread counts are batched. The one-versus-thirty-conversation
fixture confirms a constant query count. This is a bounded-work check, not a
production latency claim. Read markers advance monotonically and do not create
another participant's read receipt. Archive keeps history; a new incoming
message restores the recipient's inbox without unmuting. Clear affects only the
owner's acknowledged prefix and never erases the other participant's history.

Selected message reporting reuses the private case workflow. A participant may
report only a message in their retained visible history; currently authorized
case review sees that selected item, never unrelated messages or full threads.
Credential-checked account export includes the owner's authorized message view
and own conversation choices, excluding their cleared prefix and other threads.

The existing shared read lock is extracted into `withAccountRead`; `withPostRead`
adds its existing post/church context. Personal contact/message reads reuse the
same session and revocation boundary without loading unrelated church-page data
or inheriting its connection-count limit. The read-only/concurrent-reader and
exclusive-revocation tests pass. A fresh static runtime import graph across 546
modules finds no cycles.

Fresh checks pass: 16 message-service groups, 32 contact/report/account-export/
read-lock regression checks, and nine enabled plus nine paused contact/message
HTTPS groups. They cover actual persistence, outsiders, current accounts and
origins, both participants, replay/conflicts, quotas, cursors, read positions,
mute/archive, hidden history, blocks, report scope and export. The first combined
run lacked a preview for its export HTTP check; the subsequent built run passes
that check. A stale blocked-write test expected 403 where the preserved version
contract returns 409; it now verifies both stale-version conflict and current-
version denial, and the five affected HTTP groups pass on rerun.

Types, scoped lint and production build pass. Runtime tracing passes 128 traces,
10,899 entries and 322 server JavaScript files, with no private fixture,
environment or Prisma configuration-loader paths. No new physical-phone result
or real messaging activity is claimed.

Migration `20260912233100_adult_message_history` is isolated-only, alongside the
unreleased contact migration. The actual inbox/history composer, profile resume,
foreground reconnect/visible read integration and durable in-app activity remain
next. The complete integrated release gate and production backup/migrations are
pending. Production remains reporting `2026.09.12.24` / `e710170`, with 33
migrations. Common real reviewer/retention/erasure requirements, parent and
physical/owner acceptance remain open. No task is closed as live by this receipt.
