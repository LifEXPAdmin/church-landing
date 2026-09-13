# Isolated capacity and recovery rehearsal

## Verified publication — 13 September 2026

Product **2026.09.13.28**, application
`d0549cf5dbb37015e33e1fb02d51df6da10d1269`, is live on READY deployment
`dpl_DCiJCGNKwjnr53NFiTCLrQ5aDXy5`. The independent canonical-domain assignment
and serving release match. Thirteen read-only live groups pass, including the
home feed, new and retained release notes, safe updates, private-route denial and
notification/account-deletion entry. Browser errors and application writes are
zero; the inspected deployment window has no error-level runtime rows.

The actual Vercel build has 141 clean runtime traces, 14,415 entries and 361 server
JavaScript files. All 42 migrations were already applied; this release applies
none. Independent notification/retention configuration and the existing VAPID
identity remain intact. Founder/report activation and real-phone acceptance retain
their separate open requirements. The runtime source matches the locally tested
candidate; the final commit adds only development-tooling and evidence changes.

Visible improvements: [Home](https://godschurches.com/platform),
[patch notes](https://godschurches.com/platform/releases/bounded-community-feed)
and the existing reader entry in [Explore features](https://godschurches.com/platform/features).

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
claim. Authentication tokens, SQL and small receipts stay under the ignored,
private `.account-test/capacity-*` directory. The large database, WAL and snapshot
use a private OS temporary directory outside application tracing; its location
is recorded in the private browser configuration. Retained clusters remain
stopped after the harness exits. This is fictional test data only;
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

## Bounded release and rollback

Publish the reviewed feed change only after the reader/permission regressions,
production build and trace guard pass and the timed integrity/recovery receipts
are inspected. Confirm the exact deployment is READY, the canonical domain points
to it, and its release endpoint identifies the application commit. Read-only live
checks must retain private-route denial, existing release links and safe-update
behavior. Local throughput is not a reason to increase production concurrency or
relax admission limits.

This query-only optimization adds no migration or capability setting. If a live
regression requires rollback, return production to the previously verified
messaging/retention release, then repeat canonical identity and live checks.
Preserve all 42 migrations, current protected journals, VAPID keys and capability
settings. Do not restore an older database or pre-retention application to reverse
this read optimization. Broader rollback/recovery acceptance remains open where
it involves workers, media, provider outages or current authority reconciliation.

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
with twelve data reads for both one and thirty rows.

Release verification explicitly resumed the remaining 31 files after the first
72 files and migration/build/HTTPS stages passed. The combined coverage is all
103 files, 662 passing executions and two expected skips; the resumed 161 checks
have zero failures. This is resumed coverage, not a single uninterrupted passing
gate invocation. A second attempt repeated 38 files before compilation exhausted
its heap while multiple large capacity clusters remained under the checkout.
Those stopped fixtures were preserved outside tracing, and the production build
then passed at the existing 6 GiB limit with 141 clean runtime traces. Future
capacity storage uses the external private directory described above. Types and
scoped lint also pass after that development-tooling change.

The populated recovery rehearsal passes eight checks. Its real snapshot restores
all four volume tables with matching fingerprints and all 42 migration checksums.
Canonical quarantine retires 112 restored sessions and eleven elevated grants,
preserves the revoked connection and content, and keeps traffic disabled. Its
initial short run overlapped other verification and supplies functional evidence
only. Participation's documented “already saved” acknowledgement is compared by
canonical identity/version, while social mutation receipts use structural equality.

The corrected 15-minute run passes all twelve integrity checks: 23,875 mixed
requests, zero unexpected responses, 2,166 structurally matching retry pairs and
zero differing receipts. Its peak was 28 in-flight requests, with 22.3% measured
host CPU activity. Feed HTML p95 was 293.9 ms; detail 115.6 ms, search 101.6 ms,
comments 106.2 ms, comment retry pairs 255.4 ms and Like retry pairs 176.2 ms.
The feed p95 is approximately 71% lower than the initial local run; this does not
establish production latency or an internet/phone SLA.

The 100-writer canonical final-slot race completes with one winner and a matching
canonical replay. The separate same-IP HTTP burst returns one 200, twenty-seven
409s and seventy-two 429s. A later HTTP volunteer retry remains transport-rejected;
it is not counted as a confirmed replay. Existing admission limits are preserved.
All eight populated-restore checks pass again: the actual 9.5 MB snapshot restores
in 5.5 seconds, protected quarantine/replay takes 2.1 seconds, every volume-table
fingerprint and all 42 migration checksums match, and restored traffic stays off.
Twelve actual query plans are retained privately. No competing local verification
ran during this final timed workload. The owned server and database stopped cleanly.

Production publication is verified above; the optimization measurements remain local.
The current thirty-attempt shared-IP participation window, denser relationship
graphs, per-post preview scaling, media load and broader worker failure rehearsals
remain separate capacity considerations. This checkpoint does not close the
owning reliability package or real-phone acceptance.
