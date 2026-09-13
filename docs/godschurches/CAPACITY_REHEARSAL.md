# Isolated capacity and recovery rehearsal

## Scope and reproduction

The development harness owns a fresh PostgreSQL cluster bound to loopback. It
does not accept a deployment URL or existing database, does not inherit provider
credentials, and disables outgoing delivery, push and founder/report intake.
The real account setup, church approvals, social services and built HTTP routes
remain in use. No application dependency or client code is added.

After the normal production build, run with the supported local Node runtime:

```sh
node scripts/capacity-rehearsal.mjs 900
```

PostgreSQL 17 defaults to the Homebrew installation; `TEST_PG_BIN` may identify
another local installation with `pg_stat_statements`. The duration is bounded
between 10 and 1,800 seconds. Ten seconds is a tooling smoke check, not a capacity
claim. Fixtures, authentication tokens, SQL, logs and snapshots stay under the
ignored, private `.account-test/capacity-*` directory. The owned HTTP server and
database are stopped when the harness exits. This is fictional test data only;
ordinary recovery copies continue to follow [backup operations](BACKUP_OPERATIONS.md).

## Declared workload

- Exactly 10,000 accounts, 100 churches, 100,000 posts and 500,000 comments before
  requests. One hundred active clients complete ordinary fixture signup,
  verification, adult setup and church approval. Remaining volume is generated
  fictional data, including bulk accounts without login credentials.
- Two thirds of generated posts are public, one third church-scoped. Four hundred
  thousand comments span the post set, and 100,000 additional comments concentrate
  on the latest 100 posts. Broad search text deliberately matches the generated
  posts. No fixture uploads or real device subscriptions are included.
- A burst of 100 independent actors attempts the final place in a volunteer slot
  through the canonical service. A separate HTTP burst measures the existing
  shared-IP transport limit without disabling or spoofing around it. Poll and
  repost mutations also receive concurrent exact retries. Rejected HTTP retries
  are recorded separately from confirmed canonical replay.
- Fifty authenticated clients use a two-second think time after each operation.
  Each twenty-operation cycle contains one concurrent comment retry pair, one
  Like retry pair, and eighteen reads divided among the home feed, post detail,
  search and comments. Arrivals are staggered over two seconds.
- The existing feed and detail are measured as complete HTML responses, not an
  invented feed API or browser paint metric. Search and comments use their real
  JSON APIs. Report actual peak in-flight requests; fifty clients with think time
  does not mean fifty continuously active requests.

Readers are warmed and tables analyzed before the timed workload. The harness
records statuses, decoded response bytes, latency percentiles, database statement
counts/execution time, wait-state samples and host CPU activity. The declared
local Prisma pool has twenty connections. Local measurements do not establish
Vercel/Neon production-tier capacity, cold starts or internet/phone performance.

## Query and recovery follow-up

After the measured run, capture the actual existing readers' SQL and inspect
their twelve slowest distinct query plans using `EXPLAIN (ANALYZE, BUFFERS)`.
Keep query and parameter details private. Add an index or change a query only
when the measurements identify the work it addresses. Do not remove current
permission locks or broaden audiences to improve a benchmark.

The recovery check removes an active church connection through the normal
reviewer command and rejects an account-switched form without committing a
comment. It checks that disabled push leaves ordinary social reads available.
Then it creates and restores a real local database snapshot, compares counts and
ordered row fingerprints for all four volume tables, and runs the canonical
quarantine/protected replay service. Restored sessions and elevated authority
must be retired; posts, comments and the revoked connection must survive with
their intended state. Restored traffic remains disabled and current authority
must be reconciled before reopening it.

This volume fixture contains no newer deletion journal. The separate
`retention-restore.test.ts` acceptance covers newer protected deletion/hold
records, delivery cancellation and shared-message behavior. The integrated
[release receipt](MESSAGING_RETENTION_REPORT.md) records the actual provider and
production-copy migration checks. Keep missing-media, scheduled-worker recovery,
phone observation and broader service-capacity criteria separate where they
have not been exercised by this workload.

## Current evidence

The initial 15-minute production-build workload completed with 22,319 mixed
requests, zero unexpected HTTP failures, a peak of 39 in-flight requests and
42.6% measured host CPU activity. Feed HTML p95 was 1,019.5 ms, above the proposed
one-second review target; detail HTML was 450.7 ms, search 413.2 ms and comments
396.2 ms. Database activity recorded 452,477 statements, including transaction
and monitoring calls. This is a local warmed dataset, not a production SLA.

The shared-IP volunteer burst committed one signup: one 200, twenty-nine 409s
and seventy 429s. The subsequent poll/retry probes were also transport-limited;
that run did not verify them. The original harness compared JSON serialization
order and falsely flagged retry objects whose database representation reordered
keys. It now uses structural equality and separately records confirmed pairs;
the original raw receipt remains preserved. Database checks found no duplicate
comment commitments and one canonical repost. Do not treat this initial receipt
as a complete concurrency pass.

Actual query plans identified whole-dataset aggregation of 501,014 comments in
the feed read. The candidate selects the authorized page first and bounds all
relation counts to that page, within the unchanged permission transaction.
The same four reader projections are identical before/after. The feed service
read measured 292 ms before and 116 ms after; its comment-count scan fell to
30,731 rows. The feed adds one bounded select (27 to 28 recorded statements),
with no new dependency, table, index or per-post query loop.

Twenty-six focused reader, permission-concurrency, repost and private-draft
regressions pass, including reply modes and revoked access. Types and scoped
lint pass. The first integrated rerun stopped at an unrelated report-queue test
that counted connection/transaction housekeeping along with data queries. The
test now compares the actual data-read signatures; its seven focused tests pass,
with twelve data reads for both one and thirty rows. The complete gate is being
rerun; no failed gate is presented as a release pass.

The populated recovery rehearsal passes eight checks. Its real snapshot restores
all four volume tables with matching fingerprints and all 42 migration checksums.
Canonical quarantine retires 112 restored sessions and eleven elevated grants,
preserves the revoked connection and content, and keeps traffic disabled. Its
initial short run overlapped other verification and supplies functional evidence
only. Participation's documented “already saved” acknowledgement is compared by
canonical identity/version, while social mutation receipts use structural equality.

The corrected timed workload and integrated gate remain in progress. Production
still serves the verified messaging release; optimization measurements are local.
The current thirty-attempt shared-IP participation window, denser relationship
graphs, per-post preview scaling, media load and broader worker failure rehearsals
remain separate capacity considerations. This checkpoint does not close the
owning reliability package or real-phone acceptance.
