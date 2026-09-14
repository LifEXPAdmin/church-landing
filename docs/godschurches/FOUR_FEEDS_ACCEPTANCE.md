# Four feed choices

## Implementation checkpoint — September 14, 2026

The local candidate adds Latest, Friends, Top This Week and Trending as one
feature in Home and My feed. Publication and complete browser/operational
acceptance are still pending. The serving application remains 2026.09.14.13.

Latest is public-only and includes eligible own posts. Friends uses accepted
mutual friendship plus both current follow edges; it excludes self and pending or
one-way relationships. Current church, source, moderation, mute and block checks
remain authoritative. Retained Friends cards also recheck friendship eligibility.

Top This Week counts distinct active non-self Likes first received within the
previous 168 hours. Trending sums `2 ** (-likeAgeHours / 24)` over the previous
72 hours. Each calculation includes its lower boundary and excludes its snapshot
instant. Ties use publication time then descending post ID. Older posts qualify
through recent Likes. Plain reposts share the original interaction target and do
not create additional ranked copies; quote commentary has its own Likes.

The existing Like record gains nullable `firstLikedAt`. Known first-active and
pre-lifecycle dates are preserved; ambiguous later history remains unknown.
Initially inactive rows acquire a date only on a real activation, and known dates
never renew on toggles or receipt replay. Migration comparisons and raw ranking
windows explicitly use UTC. Existing account, Like and preference fields remain
unchanged by migration.

Private `SocialPreferences.feedMode` and `feedVersion` reuse the current account,
version and exact-receipt boundary. Other preference versions/fields are separate.
Guest choices use a supported-mode cookie which signed-in defaults ignore. URLs
carry a signed owner scope; switching accounts resets an old scope to the new
account's own default. Home/My feed share a selector and mounted reader; List and
Pages remain presentation choices. Unknown preference results retain the original
request, and feed changes check the existing post/comment draft workspace.

## Stable reading and operating bounds

Ranked feeds retain only an ordered array of post IDs for one hour. Scores,
bodies, reading activity and per-visitor identity are not stored. All subsequent
pages recheck current discovery and source permissions before hydration. The
ordering stays fixed while visible Like counts stay current; deliberate Refresh
recalculates active votes and excludes newly zero-score entries.

Current-page cursors also carry a signed, compressed list of at most thirty IDs.
After the ranking store expires, that current page can still hydrate through
current permissions and preserve mounted drafts; continuation requires Refresh.
Latest/Friends use signed publication keysets and a fixed upper boundary. Cursors
bind the mode and account/public-viewer scope; signatures are verified before
bounded decompression.

Public initial reads may reuse an ordering calculated within the last thirty
seconds; deliberate Refresh bypasses reuse. Allocation alone uses a small shared
snapshot-storage lock. Candidate metadata is bounded at 10,001 references; a
pool larger than 10,000 fails explicitly instead of returning an incorrect
truncated ranking. Storage is bounded at twenty live sets per account, 10,000
sets and one million references globally. Expired sets are removed in batches of
500 on allocation and by the existing retention worker. Account erasure removes
its sets and saved choice. No new provider, dependency or schedule is required.

## Checks completed at this checkpoint

Fourteen isolated service/migration checks pass: all four selection contracts,
window boundaries and fixed examples, tie order, changing Likes between pages,
current friend/audience/mute/block permissions, exact preference and Like retries,
account switching, current-page expiry recovery, public snapshot reuse and an
additive migration rehearsal with an explicitly different database time zone.
Type checking and the focused React/service lint review pass. The first test run
caught and repaired an implicit database-time-zone conversion in raw ranking and
expiry queries; the passing checks use explicit UTC boundaries.

Still required in this feature cycle: complete security/support gate, built
browser and retained-draft acceptance, measured query/bundle costs, protected
recovery and installed worker/checksum propagation, exact canonical deployment,
actual live checks and private task reconciliation. Broader Local/Following/
Your Church/advanced-filter and operational acceptance scopes remain distinct.
