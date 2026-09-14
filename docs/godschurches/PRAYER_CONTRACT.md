# Prayer and private follow-up

14 September 2026 UTC · Implemented; complete release gate passed, publication pending.

See [feature acceptance](PRAYER_ACCEPTANCE.md) for the 134-file gate, 55 browser
groups, protected upgrade, measured costs and remaining release verification.

The current feature covers prayer on every eligible canonical post, comment and
reply, a first-use guide, acknowledgment and undo, explicit name sharing, private
follow-up saves, author updates and optional update delivery. It also retains the
original user option to hide reaction counts. The existing PRAYER post type is
not an acknowledgment service. No prayer record or guide completion influences
feed ranking, badges, streaks, permissions or spiritual status.

## Record and permission boundaries

`PrayerGuideReceipt` stores one private accepted guide version per account.
`PrayerRecord` has one owner and one canonical target. A post ID is always the
permission context; a nullable comment ID selects a comment/reply instead of the
post. Compound foreign keys and a checked target key prohibit cross-post targets.
Acknowledgment, explicit name sharing, private save and update subscription are
independent fields under one versioned owner/target record. Removing a save or
subscription never retracts an acknowledgment. Names start hidden and require a
deliberate choice. Counts and permitted names use current source and participant
visibility; private saves and guide choices never enter public profile responses.

Reuse current post/comment audience, block, moderation, account and church
authority checks. New acknowledgments require the current guide and an open,
eligible interaction target. Commands use current-session social receipts,
desired states, version checks and exact-body retries. A guide receipt verifies
only that the account accepted the guide, never that prayer occurred.

## Canonical author updates

An author update is an ordinary canonical comment or reply plus small
`PrayerUpdate` metadata identifying its prayer target and update kind. It stores
no duplicate body. Existing author/church-publisher authority, comment limits,
edit/delete, reports, moderation, deep links and audience rules still apply.
Updates use the source's existing audience, with no audience-widening option or
automatic public testimony. A reply to a prayer target remains in the existing
thread. Private follow-up views resolve the source again and conceal unavailable
content; a removed saved item can be cleared without recovering its hidden body.

Explicit update subscribers receive only later author updates. Extend the
existing comment-owned continuation and canonical recipient event instead of
adding a provider, queue or copied-text feed. Conversation and prayer streams
use bounded pages with durable progress and current access/consent rechecks.
One reply/mention/conversation/prayer update has at most one recipient intent.
Optional prayer phone alerts have a separate initially-off category and consent
start. Late subscription, re-subscription, device creation or phone opt-in cannot
backfill earlier updates. Existing mute, quiet hours, read cancellation, expiry,
maintenance and restoration quarantine remain authoritative.

## Interface and acceptance

Pray opens the guide/current target controls. After the guide, I prayed records
the person's statement with clear undo, pending, conflict and same-request retry.
Names are an explicit per-target choice. Private saved prayers support pagination,
reload, removing saves and independent update opt-in. Author update kinds include
requesting prayer, an update, praise and a completed follow-up, all attributed to
the author rather than a platform claim. Count hiding is a presentation choice
in the existing browser display owner, including Like and prayer counts.

Verify guide-version changes, direct endpoint gates, post/comment/reply parity,
concurrent set/undo, current and revoked audiences, explicit name disclosure,
private ownership, update authority, source removal, exact retries, existing
delivery integration, source deletion/export/erasure and protected restoration.
Check keyboard/focus, reader touch boundaries, reload and recovery in isolated
fictional browser fixtures. Measure queries and shipped JavaScript. Finish the
full release gate, protected/installed recovery, exact READY/canonical identity
and live checks before closure. Actual physical phone acceptance stays distinct.
