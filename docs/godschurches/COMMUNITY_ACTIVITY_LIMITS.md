# Community activity limits

September 14, 2026 UTC · candidate 2026.09.14.11

## Behavior and ownership

New committed community actions use the existing account limiter inside their
command transaction. The defaults are ten posts per hour, thirty comments per
ten minutes and thirty deliberate follows per hour, per acting account. Personal
and church publishing share that actor's post allowance. Direct posts, private
draft publication, quote posts and new plain reposts all use the same allowance.
Person and church follows share the follow allowance. A failed transaction does
not consume a slot; a concurrent same-account request cannot overshoot the limit.

Existing exact receipts replay before new-activity admission. Duplicate plain
reposts and an already-followed desired state do not spend a slot. Distinct valid
posts may use similar text; no content classifier or similarity rule is added.
Private draft saves, edits, removals, unfollowing and blocking remain available.
Current source/actor authority remains enforced. A waiting response keeps text
and choices, includes a readable waiting time and sends HTTP `Retry-After` with
private no-store headers. Expiry permits a new attempt.

Direct creation retains its existing `requestKey` interface and stores new
immutable input fingerprints in `SocialOperation`. Changed reuse conflicts,
including after the post has subsequently been edited. Long supported keys are
hashed to a bounded receipt key. Historical posts have no original fingerprint;
their authorized canonical retry behavior remains compatible, without rewriting
old text or inventing a historical payload. New replay receipts contain a digest
and the existing minimal result, never another post-body store. Account erasure
uses its existing owner-wide receipt cleanup.

Private workspace and comment publication keep their existing receipt owners.
An exact legitimate retry does not spend another activity slot; independent
transport flood limits still apply. Signed-in posting uses the existing
240-attempt/15-minute account transport budget instead of the sign-in IP cap.
Link-preview requests retain their separate stricter transport protection.
Shared church Wi-Fi does not share the new activity allowance.

Existing five-mention-per-comment validation, mention eligibility, and the
five-new-reports/ten-minute limit remain. Report duplicates and exact retries
remain free under their existing owner. Personal invitations retain their
separate consent, verification, bilateral completion and bounded acceptance
history rules; receiving a consented invitation does not consume another
person's manual-follow allowance or change signup eligibility.

## Configuration and operational checks

Omit these optional variables to use the defaults:

| Variable | Default | Accepted values |
| --- | --- | --- |
| `COMMUNITY_POSTS_PER_HOUR` | 10 | Integers 1–100 |
| `COMMUNITY_COMMENTS_PER_10_MINUTES` | 30 | Integers 1–300 |
| `COMMUNITY_FOLLOWS_PER_HOUR` | 30 | Integers 1–300 |

Blank or invalid explicit configuration fails closed for new activity. Existing
receipts and private drafts remain available. The secured aggregate health route
reports parsed limits under `configuration.socialActivity` and raises
`community_activity_configuration` attention for an invalid value. It returns no
raw configuration, person identity or content. Tune these operational defaults
from actual evidence; they are not capacity promises. No provider purchase,
schema change, new table, runtime dependency or worker is required.

Each admitted new action adds one atomic limiter upsert inside the existing
transaction. Rejection reads the existing expiry to supply the wait. Direct
creation reuses the bounded receipt store; other writers retain their existing
receipt ownership. No new browser polling, automatic retry or background queue
is added. No performance improvement is claimed.

## Acceptance checkpoint

Eight isolated suites pass 70 tests with zero failures. These cover ten committed
posts and thirty comments at their default ceilings, mixed draft/quote/repost
admission, concurrent overshoot prevention, changed-input conflict, exact replay,
private-save preservation, follow/unfollow/block behavior, invalid configuration,
32 signed-in posts from a shared synthetic address, and original report and
invitation regressions. Populated 49-migration preservation and dump/restore pass.
Types and scoped lint pass. Production test writes and external sends are zero.

The full fresh-fixture gate, built mobile waiting/recovery checks, exact deployment
and live acceptance remain pending. Canonical production is still the preceding
verified release; this candidate checkpoint is not a live completion claim.
Keep broader moderation and operational prerequisites open, and final review last.
