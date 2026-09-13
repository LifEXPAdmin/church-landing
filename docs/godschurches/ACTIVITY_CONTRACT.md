# Personal activity and read boundaries

The service foundation and consuming interface are verified locally on 13
September 2026. Publication verification is next; production is
2026.09.13.30 with 43 migrations, not this 44-migration candidate.

The existing SocialEvent is the canonical intent. Activity adds only its ordered
sequence and recipient read marker, plus a monotonic read-through position on
SocialPreferences. No message, comment, request purpose or report evidence is
copied. Account erasure and source retention continue to remove the same records.
Existing message history/read state and outbound delivery records remain owned
by their existing services.

The initial categories expose completed sources: messages, contact requests,
replies/mentions, authorized report alerts and founder announcements. Other
domain adapters, reactions, author bells and broader preferences remain open.
In-app and phone choices remain independent. Optional activity cannot remove a
pending request, signup result or canonical conversation from its owning screen.

Only the currently eligible signed-in recipient reads or changes this personal
state. The read page contains at most twenty groups, stable timestamps, exact
event/unread counts, an account-bound snapshot boundary and a continuation cursor.
Messages group by conversation, comments by post, requests by request and reports
by case, separately by category. The private response contains no source text or raw actor identifier. Existing
source resolvers batch current authority before supplying a link; only then are
display names read within the same transaction. A church speaker is named as the
church, without exposing its internal publisher. Removed or restricted sources produce a
generic unavailable item; their retained personal event count does not imply
continuing source access. Current hidden message prefixes and optional mute/
category controls remain respected. Counts describe the recipient's activity
intents, including generic unavailable history, never provider delivery or reading.

The boundary uses database sequence allocation under the shared lifecycle gate,
not an event timestamp. Later arrivals remain unread even if their timestamp is
older or equal. Mark all read advances only through the displayed server boundary;
it applies to all categories, independently of the visible filter. Marking a
group updates its existing recipient events only through that boundary. Exact
body retries use SocialOperation; changed-body retries conflict. Read markers are
monotonic, do not alter preference versions and cannot mark another person's
message as read. Ordinary conversation reads additionally clear corresponding
message activity through their existing canonical read position.

Pagination uses a fixed snapshot boundary and the last group's event sequence.
Newer events enter on refresh, without pushing later groups out of an in-progress
page traversal. Cursors are private, bounded and bound to the signed-in account;
they grant no permission. Page/source reads use the existing shared account read
gate, writes its exclusive gate, and all HTTP results are no-store.

Verification must cover exact counts/grouping, one/thirty source-query bounds,
older timestamp arrivals, mark-all races and exact retries, source loss/revocation,
account switching, mute/preferences, legacy migration and isolated restore.
The interface reuses the existing social transport, account identity checks and
unsaved-work navigation protection. Pending read changes retain their exact body;
terminal errors require a fresh view. Visibility, focus and reconnection refresh
without interval polling. Switching accounts clears the former view. Menu and
Messages link to Activity without changing the primary navigation or QR ordering.

## Accepted service boundary and local evidence

`readActivity` and `activityCommand` in `lib/platform/activity.ts` own projection
and read writes. `GET /api/platform/activity` accepts `view=inbox` (default), an
optional supported `category` and opaque `cursor`; `view=open&id=…` resolves a
currently owned event again. POST accepts `read` with a current event `id`, or
`read-all`, together with `ownerId`, `mutationId` and the returned `boundary`.
The existing SocialReceipt acknowledges writes. `ActivityPage` in
`activity-types.ts` defines items, exact unread totals, capabilities and pagination.
No internal group/source key is exposed for an unavailable item. Invalid input
is 400, changed sign-in 401, ineligible setup 403, unavailable ownership 404 and
changed retry/snapshot position 409. If retention removes the newest event behind
a cursor, refresh the snapshot; do not silently substitute a different boundary.

The additive migration orders older intents deterministically by timestamp/ID
under its DDL transaction, preserves all original fields, then resumes sequence
allocation. Legacy read markers start empty; no delivery or welcome is backfilled.
Exports include only the recipient's read metadata and serialize sequence values
as decimal strings. Existing deletion/restore ownership is retained.

The foundation checkpoint had fifty-two focused service/regression checks pass across activity, batched sources,
comment alerts, outbox, founder welcome/announcements, report review and export.
Seven activity groups cover empty/denied HTTP boundaries, 25-group pagination,
concurrent/older-timestamp arrivals, exact retries, account changes, unavailable
church sources, thread/author muting and canonical message read positions.
Actual isolated dump/restore preserves read state and sequence advancement; the
older-schema upgrade preserves all 1,408 original event rows and 165 preference
rows in that fixture. Types and scoped lint pass. The real HTTPS export test was
outside that initial service-only fixture and subsequently passed in the full
production HTTPS release gate below. Failed
fixture attempts (a missing comment reference, tombstone shape and test-only
BigInt serialization) were corrected; an unstarted HTTPS fixture was not claimed
as an application failure or a passing browser test.

The integrated candidate passes 36 focused service/navigation executions, types,
scoped lint and two release-content checks. This includes church display identity
and cancellation of a queued alert after Activity is read; a later arrival still
delivers exactly once through the isolated transport. A fixture tried to mutate
an immutable comment author and a transport stub returned the wrong type; both
were corrected and the final run passes. Full HTTPS/browser evidence is pending.

Actual metadata reads remain constant: one or thirty message sources use seven
queries, versus 210 individual lookups; one or thirty outbound comment sources use
thirteen, including the new read-boundary check. Complete Activity, including
authorized display names, uses twenty-one data queries for one event or 20,000
events across 500 posts, returning at most twenty groups. Five local populated
reads took 89.5–129.8 ms; an all-read page took 59.0 ms. Two actual query plans
are retained privately. Counts and reads stay scoped to this recipient, with no
per-item source query loop or client polling. These measurements are local,
not a production latency promise or completion of broader capacity acceptance.

This receipt satisfies the consuming interface's source/read-boundary dependency
for the five listed categories. Broader event adapters, author bells, preference
expansion, parent integration and real-device acceptance remain open.

## Delivery and migration operations

Activity read markers cancel an optional alert that has not started delivery.
The recipient-initiated phone test is unaffected. A provider request already in
flight or delivered to a device cannot be recalled by a later read change.
Opening an older notification still resolves current source access independently.

The fresh encrypted production-copy rehearsal upgrades 43 to 44 migrations,
preserves all original columns across 92 tables and passes protected deletion
replay. No production data is modified by that rehearsal. Keep migration 44 on
rollback; prefer a forward repair. Before returning to an older runtime that does
not inspect Activity read markers, pause optional push delivery to avoid sending
alerts already marked read. Restore with outbound delivery disabled until the
existing deletion replay and release authorization checks pass.

## Integrated candidate acceptance — 13 September 2026

All 111 discovered files are covered: 700 passed, zero remaining failures and two
expected production-phase skips. Both builds, fresh/upgrade migration, synthetic
backup/restore and real HTTPS process restart passed. Two older raw-row privacy
assertions needed bigint-aware serialization; the gate retained 72 successful
files (474 checks) and resumed all 39 unfinished files (226 checks). No runtime
source changed after the builds. Failed attempts are retained as evidence.

The final complete built-browser run passes twelve groups with no page errors:
grouping, category/count agreement, pagination, source/detail/Back, individual and
all-read writes, a lost committed acknowledgement and identical retry, later
arrival preservation, two-page persistence, conflict concealment, stopping an
uncertain retry, failed reads/reconnection, focus/visibility recovery, withdrawn
source concealment and an account switch while an old response is in flight.
Messages/Menu entry, Explore and release notes work at 320/390/1440-pixel widths.
The mobile screenshot was inspected. These are isolated Chrome fixtures, not a
new physical-phone observation or production notification send.

The Activity entry adds 3,654 compressed bytes beyond the compiled Menu entry's
shared chunks. All 143 runtime traces are clean (14,763 entries, 366 server JS
files). No runtime dependency, private-body store, new event table or polling
loop was added. The browser script is `scripts/qa-activity-browser.mjs`; run with
Node24, the existing isolated HTTPS fixture directory and `NODE_EXTRA_CA_CERTS`
set to that fixture's certificate. Both browser and intercepted Node requests
validate that certificate; global TLS verification is never disabled.
