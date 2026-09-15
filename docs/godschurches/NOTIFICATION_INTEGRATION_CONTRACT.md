# Complete notification integration

Implementation in progress, 15 September 2026. This extends the accepted Activity,
conversation and prayer services; it is not a release receipt.

SocialEvent remains the recipient's canonical intent, with an immutable category,
opaque source reference and source version for the new adapters. Source actions
and intents/continuations commit together. No text, private calendar detail,
church evidence or recipient contact is copied into a job or delivery. Existing
source access is checked at creation, delivery and opening. A generic unavailable
history item grants no access. Operational outcomes remain on their original
church, calendar and commitment screens when optional Activity is off.

Person/church bells are private choices on SocialRelationship, initially off and
independent of Follow/favorite/membership. A bell receives only future successful
publications. Turning it off or blocking cancels eligibility; unblocking does not
restore either person's bell. Mute/snooze suppress optional alerts. A later bell,
category, device or renewed commitment cannot backfill an earlier source action.

Supported categories are messages, requests, reports, founder announcements,
replies, mentions, followed conversations, prayer, author posts, reactions,
church requests/connection changes and commitments. Each has independent Activity
and phone controls. Existing defaults and explicit thread/prayer subscriptions
are preserved; new phone categories start off. Old four-category clients preserve
newer choices. Security/recovery email is separate; optional email/SMS/digests and
future unimplemented marketplace/feedback sources remain unavailable.

Likes and prayer acknowledgments group by their canonical post/comment. Repeated
desired-state retries and toggling do not manufacture repeated alerts. Prayer
acknowledgment summaries never identify a participant, even when a later source
view permits a separately consented name. Current undo, blocks, hidden sources
and restricted membership are respected. Existing reply/mention/conversation/
prayer-update deduplication remains one recipient intent per comment.

New post, church-review and changed occurrence/volunteer fanout uses bounded
twenty-recipient continuations and the existing native queue/maintenance model.
Current RSVP/active reservation and source-time participation are required for
change alerts. Confirmations refer only to the signed-in person's own record.
Only details-authorized calendar readers receive event links; busy-only sharing
never reveals a title. Scheduled publishing uses the existing canonical plan and
rechecks publisher authority at the actual execution time before author fanout.

Preference and bell changes have independent recovery revisions. Protected
receipts contain only opaque ownership/reference/version, never private choices.
An older restored choice is disabled for explicit review, not guessed forward.
Restore retires all outstanding continuations and devices before traffic; export
and erasure include/remove private controls through their existing owners.

Verification covers transactional retry/restart, multi-page fanout and revocation,
source-time opt-in, immutable category, unread/read-all concurrency, DST/quiet
hours, current domain authority, prayer identity, account switching and pending
UI recovery, export/erasure and protected restore. Meaningful full release and
browser checks precede exact READY/canonical/live acceptance. No production test
user changes or real email/device send is authorized by engineering verification.
Physical locked-phone/tap/reply acceptance retains its existing owner prerequisite.

## Local source checkpoint

The first integration checkpoint adds explicit bells, independent supported
channels and recovery receipts, canonical reaction/prayer/church/commitment
adapters, a bounded durable continuation, current-source projection and the
corresponding Activity/settings controls. Post-commit handoff includes immediate
publication and the saved-draft path. Restore retires the new jobs; private bell
and category choices are covered by the existing export/erasure owners.

The latest focused run passes all 15 checks across new integration, Activity and
batched sources; types and scoped lint pass. A separate 28-check run passes
Activity, new integration, outbox and real process-restart recovery. The existing
15 comment/follower checks also pass in the preceding mixed run. New tests cover
27 eligible recipients across racing pages, independent late bell/phone/device
exclusion, private prayer identity, exact retries, recovery after an unrelated
preference-version change, and current church/event access. One/thirty message
sources use 7 queries; comment sources use 15. These are local observations.

Initial fixture attempts exposed the retained SQL source/category constraints;
the additive migration now preserves those checks while admitting the new
supported sources. A fixture origin and the protected local journal path were
corrected without weakening their isolation checks. Older test expectations now
include the new category and isolate unrelated church confirmations; unavailable
opens retain the existing generic result. Failed logs are preserved privately.

Scheduling integration, remaining role-change adapters, expanded browser and
recovery/resource acceptance, the complete release gate and exact live acceptance
are still in progress. This checkpoint is not a production completion claim.
