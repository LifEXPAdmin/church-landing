# Four feed choices

## Canonical release verified — September 14, 2026 UTC

Product **2026.09.14.14**, application **c83b19205c89834976a30f11137d6f998edb9757**,
is READY in **dpl_EJee3oWa1zmU82Z4Hmeh3LxZzuJJ**. Independent canonical assignment
and the live release/build endpoint match. Latest, Friends, Top This Week and
Trending are released as one complete feature in Home and My feed, with saved
choices and searchable Feed Settings access.

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

Ranked feeds store only an ordered array of post IDs. A set is valid for one
hour; physical removal follows the bounded allocation or maintenance sweep. Scores,
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

The production build at runtime 6d89c68 passes all ten four-feed browser groups:
guest/account choice separation and fresh sessions; searchable feed settings and
existing mute management; Home/My feed and List/Pages;
320/390/1280-pixel controls; disjoint ranking pages, Back and Refresh; lost save
acknowledgement with identical retry bytes; current friendship removal; account
switching; expired current-page draft recovery; and both ranked empty states.
The accepted run has zero page errors, production mutations or external sends.
Narrow and wide focused-reader captures and the 320-pixel settings group were
visually inspected. The existing retained-privacy, comment-reader and content-note
suites separately pass eight, five and nine groups on the same feed services.
Six settings registry/return-contract checks, types and focused lint pass for
the final settings addition. Earlier runs
found and repaired a native-history paging race. Two earlier runs reported a
React hydration warning around Refresh following Back; development and production
diagnostic runs did not isolate its cause. The final ordinary production suite
passes without the warning. Browser assertions now wait for committed Back
content and account scope rather than assuming those follow URL changes
synchronously. This is not a claim that an underlying hydration defect was fixed.

## Measured costs and recovery

Compared with the preceding application build, unique route-plus-layout
JavaScript grows 5,228 raw / 1,642 gzip bytes for Home, and 1,477 raw / 505 gzip
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

## Complete local acceptance before publication

All 130 discovered test files are covered: 806 passing executions and two expected
production delivery skips, with no unresolved failures or cancellations. The
foundation gate on fad1462 completed additive upgrade, synthetic restore, fresh
migration constraints, both production builds, development HTML/RSC privacy and
production restart/session checks. It stopped at an old production assertion that
expected a private church post in default Home. Latest is now explicitly public;
the corrected publishing file and every remaining explicit/discovered test pass
on the same owned isolated cluster and unchanged application code after restart
over verified HTTPS. Original failing logs and the separate continuation receipt
are retained; this is combined acceptance, not a claimed uninterrupted gate run.

The final settings navigation addition in 6d89c68 passes six registry/return
contract checks, types/lint, the ten-group four-feed browser suite and the six-group
Settings suite. Together with the unchanged-service privacy/comment/content-note
suites, 38 browser groups pass with zero page errors. No provider dependency or
additional schedule is introduced. All test mutations remain in isolated fixtures.

## Live and operational acceptance

The canonical build completes at 19:23:26 UTC with migration 50 applied and its
runtime trace check passing: 147 traces, 15,329 entries and 372 server JavaScript
files. Eighteen public live groups pass, including all four choices, guest
persistence, current ranked availability, narrow/wide layout, private denials,
prior release links and signup. Four secured health groups pass with no alerts.
Seven connected-Chrome groups verify the actual signed-in account, each mode,
Home/My feed/Close preservation, existing author controls and Feed Settings'
focused return to the account default. Browser errors and deployment-scoped
error/fatal rows are zero. Physical-device behavior is not claimed from Chrome.

Live verification creates four bounded ranking metadata records: two public and
two account-owned snapshots. The signed URLs and database records reconcile
exactly. No production post, Like or preference data changes: whole-table
fingerprints match the pre-check baseline. No grant, message, invitation or
provider delivery is issued. Snapshot expiry and cleanup are verified in isolated
fixtures; ordinary live reads are not described as having zero database writes.

All 50 live migration checksums match. Installed checksum and installation
metadata each record 50, preserving the prior 49 and the unchanged local
backup-retention source hash. The installed encrypted daily backup/restore passes
50→50 at 19:29:29 UTC, preserving 93 restored tables and removing plaintext.
This ordinary restore is separate from the protected 49→50 upgrade/replay above.
The nightly wrapper verifies 30 backup sets with no refresh, expiry issues or
removals. Feed snapshot cleanup ships in the existing deployed retention route;
no additional worker or schedule is required.

The complete early-feed feature is ready for private task closure. Broader
Local/Following/Your Church/advanced-filter and operational acceptance scopes
remain distinct; their overlapping four-mode and Settings work must be credited
without closing those broader parents.
