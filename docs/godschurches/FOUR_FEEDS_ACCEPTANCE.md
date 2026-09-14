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

Fifteen isolated service/migration checks pass: all four selection contracts,
window boundaries and fixed examples, tie order, changing Likes between pages,
current friend/audience/mute/block permissions, exact preference and Like retries,
account switching, current-page expiry recovery, public snapshot reuse and an
additive migration rehearsal with an explicitly different database time zone.
Legacy `through`/`anchor` and older-page links retain their publication boundary
without broadening Latest beyond public discovery.
Type checking and the focused React/service lint review pass. The first test run
caught and repaired an implicit database-time-zone conversion in raw ranking and
expiry queries; the passing checks use explicit UTC boundaries.

Four additional end-to-end checks verify the 500-row sweep boundary, secured
inspection versus cleanup, explicit feed choices in account export and erasure
of owned ranking sets/preferences. Current sets survive cleanup, inspection
writes nothing, and unrelated retained conversation history survives erasure.

The production build at runtime fad1462 passes all nine four-feed browser groups:
guest/account choice separation and fresh sessions; Home/My feed and List/Pages;
320/390/1280-pixel controls; disjoint ranking pages, Back and Refresh; lost save
acknowledgement with identical retry bytes; current friendship removal; account
switching; expired current-page draft recovery; and both ranked empty states.
The accepted run has zero page errors, production mutations or external sends.
Narrow and wide focused-reader captures were visually inspected. Earlier runs
found and repaired a native-history paging race. Two earlier runs reported a
React hydration warning around Refresh following Back; development and production
diagnostic runs did not isolate its cause. The final ordinary production suite
passes without the warning. Browser assertions now wait for committed Back
content and account scope rather than assuming those follow URL changes
synchronously. This is not a claim that an underlying hydration defect was fixed.

## Measured costs and recovery

Compared with the preceding application build, unique route-plus-layout
JavaScript grows 4,672 raw / 1,477 gzip bytes for Home, and 950 raw / 349 gzip
bytes each for discussion and profile. Gzip uses level six per file; these are
build assets, not measured network transfer or startup time. The local production
trace contains 147 traces, 3,305 entries and 372 server JavaScript files, without
private fixtures/environment files or the Prisma configuration loader.

The isolated PostgreSQL 17 diagnostic uses fictional records only. At 500
candidates, Latest performs 19 statements in 21.38 ms versus the earlier reader's
20 statements in 21.35 ms. Initial weekly ranking performs 27 statements in
35.55 ms; continuation performs 21 in 18.22 ms. At 10,000 candidates, weekly
initial/continuation take 131.26/66.90 ms and Trending initial takes 176.26 ms.
A 10,001-candidate pool returns explicit 503 after 12 statements in 32.48 ms,
without allocating an additional ranking set. Typical signed thirty-ID page
cursors are 1,059–1,087 characters. These are local diagnostic observations,
not a hosting capacity or public-latency guarantee. Fictional probe posts are
withdrawn after the run; production is unchanged.

The encrypted production-copy rehearsal completed at 18:48:41 UTC. Isolated
migration 49→50 preserves all original columns across 92 tables, verifies all
migration checksums and passes protected control replay. The plaintext restore
is removed. Production access used verified TLS and a read-only transaction
default; no production modification or outbound delivery occurred.

Still required in this feature cycle: complete security/support gate and retained
browser regressions, installed migration-checksum propagation and post-release
backup, exact canonical deployment, actual live checks and private reconciliation.
The feed cleanup implementation is part of the deployed retention route; the
separate installed local backup-retention module is unchanged and its checksum
must still match. Broader Local/Following/Your Church/advanced-filter and
operational acceptance scopes remain distinct.
