# Personal activity and read boundaries

The service foundation is verified locally on 13 September 2026. The consuming
interface and integrated release verification remain pending; production is
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
by case, separately by category. The private response contains no source text,
actor identity or raw source reference. Existing source resolvers batch current
authority before supplying a link. Removed or restricted sources produce a
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
The consuming interface remains gated until that evidence is recorded here.

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

Fifty-two focused service/regression checks pass across activity, batched sources,
comment alerts, outbox, founder welcome/announcements, report review and export.
Seven activity groups cover empty/denied HTTP boundaries, 25-group pagination,
concurrent/older-timestamp arrivals, exact retries, account changes, unavailable
church sources, thread/author muting and canonical message read positions.
Actual isolated dump/restore preserves read state and sequence advancement; the
older-schema upgrade preserves all 1,408 original event rows and 165 preference
rows in that fixture. Types and scoped lint pass. The real HTTPS export test was
not run by the service-only fixture and remains part of the release gate. Failed
fixture attempts (a missing comment reference, tombstone shape and test-only
BigInt serialization) were corrected; an unstarted HTTPS fixture was not claimed
as an application failure or a passing browser test.

Actual metadata reads remain constant: one or thirty message sources use seven
queries, versus 210 individual lookups; one or thirty comment sources use twelve.
The complete Activity read uses nineteen data queries for one event or 20,000
events across 500 posts, returning at most twenty groups. Five local populated
reads took 38.0–123.2 ms; an all-read page took 51.4 ms. Two actual query plans
are retained privately. Counts and reads stay scoped to this recipient, with no
per-item source query loop or client polling. These measurements are local,
not a production latency promise or completion of broader capacity acceptance.

This receipt satisfies the consuming interface's source/read-boundary dependency
for the five listed categories. Broader event adapters, author bells, preference
expansion, parent integration and real-device acceptance remain open.
