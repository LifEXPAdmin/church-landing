# Founder announcement contract

13 September 2026 — founder controls are enabled in 2026.09.13.29 after
authenticated identity, scoped appointment and operational checks. The real founder
page loads with sending available; no production announcement was prepared or sent.
See [the activation receipt](MESSAGING_RETENTION_REPORT.md).

## Deliberate founder controls

The founder inbox links to `/platform/messages/announcements`. The API requires
the configured verified founder ID, current eligible adult account and scoped
global report-review capability on every read, write and exact retry. A hidden
link is not authorization. Draft preparation remains available while messaging
intake is paused; sending additionally requires functioning founder operations.

Drafts use the existing canonical message services and social mutation receipts.
They contain at most 4,000 characters, with at most 20 open drafts per founder.
The founder explicitly selects 1–100 currently eligible welcome recipients from
50-member pages. There is no automatic all-members selection or scheduled campaign.
Saved text and recipient selection produce a separate preview that sends nothing.
Sending requires the exact current version, a preview less than 15 minutes old,
and an explicit confirmation. Editing invalidates the earlier preview.

The dedicated page preserves local text on conflicts, requires a deliberate
current-version decision and retries uncertain requests with the identical body.
The shared unsaved-work guard protects navigation/update actions. Account changes
conceal private work. Private responses are uncached; recipient names and links
are projected through current block/account visibility, including Deleted member.

## Canonical delivery and preferences

Each selected recipient has one terminal receipt within the campaign. Send commits
only selected pending work. The private native queue carries an opaque campaign ID;
bounded workers create each canonical `FOUNDER_ANNOUNCEMENT` message and its
recipient receipt atomically under the existing permission/write lock. Retried or
concurrent workers cannot duplicate a message. A failed post-commit queue handoff
does not disguise a successful send; daily secured maintenance retries pending work.

Send and each worker recheck current founder authority, eligible adult recipient,
the original non-revoked welcome mapping, bilateral blocks and independent founder
announcement opt-out. An unavailable recipient is skipped. Revoked founder access
pauses processing; account restriction cancels pending work. Pending campaigns
expire after seven days. No campaign enables general DM sending or changes ordinary
DM preferences, friends, age/parent rules or previously revoked contact consent.

Members retain personal replies when announcements are off. Announcement inbox
alerts and optional push use the separate founder category. Current channel choices,
conversation mute/read state, blocks, quiet hours and device ownership are rechecked
by the shared notification source/outbox before delivery. Push always uses the generic
lock-screen preview. Announcements never count as personal answers in Unanswered.

## Retention and progress

The page reports conversation delivery counts, not phone acceptance or readership.
Terminal campaigns clear their duplicate draft body and retain aggregate counts.
Individual recipient diagnostics expire 14 days after completion. Canonical messages
follow participant/report retention. Their removal and diagnostic expiry cannot
reactivate terminal campaign work. Account erasure removes owned campaign data and
recipient metadata; source message ownership stays with the canonical conversation.
Restoration must cancel historical campaign work before traffic.

## Local verification

The current combined announcement/welcome/message/outbox/account-deletion run
passes 49 tests, superseding the earlier 41-test subset. Four isolated browser groups verify preserved conflict text, explicit preview
with zero sends, exact retry after a lost send acknowledgement, one canonical
message, truthful progress, recipient links and account-switch concealment. Production
build/runtime traces, types and scoped lint pass. Fixture transports send no real
provider traffic. No production announcement, user backfill or physical-phone
delivery is claimed.
