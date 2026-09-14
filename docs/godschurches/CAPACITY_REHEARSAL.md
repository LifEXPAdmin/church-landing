# Isolated capacity and recovery rehearsal

## Hosted failure and chronological index repair — September 14, 2026

The first protected cloud run used a disposable Vercel preview, private Blob
store and Free Neon PostgreSQL 18.6 at fixed 0.25 CU, with the same fictional
volume and dense relationships. Production uses PostgreSQL 17, so this is not an
exact version replica. Outgoing delivery, scheduled jobs and queue triggers were
disabled. The initial stable test alias was outside default deployment protection;
preflight stopped before load, and all-URL protection passed before testing.

At 25 clients, 2,115 requests over 182.5 seconds had no unexpected responses.
Feed p95 was 1,181.7 ms, above the proposed one-second target. At 50 clients the
guard stopped after 1,021 requests in 75.8 seconds, with 46 unexpected responses:
two synthetic Like targets were correctly denied and the remaining failures
accompanied a database outage. No 100-client stage ran. The provider error was
PostgreSQL `53200` / out of memory in a tuple sort, followed by crashed/unreachable
connections. Read-only inspection confirms the database restarted at 09:06:19 UTC.
Protected health recovered afterward; its queues had no overdue work. This is a
failed hosted capacity gate, not a demonstration of the desired operating envelope.

The actual feed-page plan sorted about 98,000 candidate posts before returning
31 IDs. A measured index on status, moderation state, publication time and ID
changes this to an ordered index scan of 31 rows with the same canonical policy.
Individual hosted `EXPLAIN ANALYZE` observations for page selection were 265.1 ms
before and 1.3 ms afterward; these are query observations, not an HTTP speed ratio.
The additive migration creates only that index and preserves every record and
permission. A corrected 50/100-client run is active on unchanged compute. Its Like
targets use current canonical read/version state, and each account attempts only
one additional upload across the rerun. All cumulative ceilings include the failed
run; no allowance is silently reset. Final migration/restore/regression, deployed
acceptance and disposable-resource cleanup are pending.

Before the index addition, the complete gate passed all 120 discovered files:
738 passes, two expected skips, zero failures. That receipt remains separate from
the required new migration gate. The initial hosted run accepted 69 uploads,
preserved 275 matching successful retry pairs and passed three owner/other-account
private-image comparisons. Its 3,146 total calls included preflight/verification;
image-read attempts were 929 and upload attempts 71. Production application writes
and real outgoing messages were zero.

## Dense media staircase and bounded previews — September 14, 2026

The first sustained staircase finished at 08:11 UTC against the `.7` candidate
before the additional preview repair below. All fourteen integrity checks pass,
including 4,709 identical retry pairs and three owner/other-account private-image
comparisons. All 175 canonical photo uploads succeeded. Across the three stages,
51,813 requests returned no unexpected responses or admission throttles.

| Active clients | Timed duration | Requests | Requests/second | Peak in flight | Feed p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 25 | 180 seconds | 2,316 | 12.71 | 11 | 344.2 ms |
| 50 | 180 seconds | 4,603 | 25.28 | 27 | 354.8 ms |
| 100 | 900 seconds | 44,894 | 49.75 | 63 | 639.4 ms |

At 100 clients, thumbnail p95 was 437.0 ms, medium-image 583.5 ms, upload
982.7 ms, detail 440.2 ms, comments 349.0 ms and search 352.7 ms. Maximum app
RSS was 1,547,888 KiB; host-wide CPU averaged 24.35% across ten logical cores.
The largest connection sample had 24 connections, including inspection clients
and PostgreSQL parallel workers; the application pool was capped at twenty.
These are Apple M4/16 GiB local observations, not a one-vCPU Fluid or 0.25-CU
Neon capacity claim. All aggregate stage health checks had no alerts.

The populated snapshot restored in 6.08 seconds; protected replay took 2.38 seconds.
All nine content/media/social-policy fingerprints and 46 migration checksums
matched. Replay quarantined 112 sessions and eleven elevated grants and left
traffic disabled pending current authorization review. Eight recovery groups and
twelve initial integrity groups passed. Production writes were zero.

The same run revealed 5.61 GB cumulative PostgreSQL temporary writes: nested
comment `take: 6` trimmed in application memory after retrieving 30,851 rows for
the page. The candidate now selects at most six visible comment IDs per post
with a parameterized lateral query, then hydrates only those IDs through the
existing canonical visibility predicate within the same permission read lock.
No schema/index, public cache, dependency or permissions are added.

On the unchanged dense database, twenty alternating warm service-read pairs have
identical complete feed projections. Feed service p50 improves 148.1→77.1 ms and
p95 158.0→82.2 ms. The actual comment hydration plan returns 180 rows instead of
30,851, with zero temporary blocks; ID selection also returns 180 rows with zero
temporary blocks. The retained original sort used 3,112 KiB on disk. A separate
5,000-comment regression matches canonical newest-six ordering with timestamp
ties, blocks, suspension, deactivation, hidden/deleted comments and church identity.
These service measurements exclude HTTP/network and do not replace the final
built-load rerun. The full release gate was interrupted to incorporate this
measured repair; its partial log is retained. Final regression, corrected built
load and exact deployed acceptance are still pending.

The candidate adds `node scripts/capacity-rehearsal.mjs 900 --staircase`.
It retains the existing integrity burst, then runs 25/50/100 authenticated clients
with two-second think time: three minutes at 25 and 50, then fifteen at 100.
Each stage records full-response p50/p95, status classes, bytes, requests/second,
requests in flight, PostgreSQL connections/waits and database counters, host CPU,
application RSS/CPU samples and a bounded aggregate health snapshot. Host CPU
includes the load generator and PostgreSQL; it is not function CPU billing.
The client sample is HTTP, not a hydrated browser or physical phone.

The fixture adds 50,000 follows, 20,000 mute and 3,000 block rows, 100 inert stored
link previews and 100 real normalized avatar images. One private-library upload
per client/stage uses the canonical upload route, and owner/other-account byte
access is checked afterward. Read traffic includes feed/detail HTML, comments,
post/people search, private thumbnail and medium-variant image bytes (up to 800 pixels). Duplicate comment
and like requests must return identical successful receipts. Expected 429 abuse
throttles are separate from unexpected responses; failure prevents increasing
load. No outgoing provider send or production record is used.

The local HTTPS proxy adds 80 ms request latency and an aggregate shared 100 Mbps
down / 20 Mbps up byte budget, with per-stream backpressure. Its two-stream check
transferred exactly 2,097,152 bytes in 2,099 ms at 8 Mbps. This models a shared
network; it does not emulate cloud CPU allocation or real mobile loss/jitter.
The harness accepts no external target or provider credentials. Source hash,
local build ID, fixture settings and private raw receipts are preserved.

The initial ten-second-per-stage functional run passed fourteen staircase checks,
twelve baseline integrity groups, twelve actual query plans and eight populated
restore groups. All nine content/media/social-policy table fingerprints and
46 migration checksums matched; protected replay quarantined sessions/grants and
kept traffic disabled. Health used two aggregate data reads, and account cookies
alone received 401. These short-run times are not a sustained capacity claim.

That run reproduced a shared-network photo limit: 30 uploads succeeded and the
next 14 received 429, with zero unexpected responses. The candidate now gives
images a separate 300-attempt IP window while retaining 120 global attempts/minute,
ten changes of each kind/account/15 minutes, and unchanged sign-in budgets. Two
new admission/concurrency tests plus existing image-boundary and release checks
pass (seven checks). The sustained image-limit run above passed without throttles.

The build initially exhausted its existing 6 GiB heap while enumerating retained
fixture databases. Seven stopped clusters were preserved outside the trace root;
the unchanged build passed. Both security harnesses now place new PostgreSQL/WAL
files in an owned private temporary directory and record that path in `cluster.json`.
Small receipts and guarded image fixtures remain in `.account-test`. Nothing is
erased to obtain a build result. Initial health tests also found a UTC comparison
error and a missing fixture preview prerequisite; both were corrected, and all
four health checks pass, including a real database lock timeout. Final candidate
regression and exact deployed acceptance remain pending.

Actual provider inventory and remaining access limits are in
[operational health](OPERATIONAL_HEALTH.md); explicit growth/cost scenarios and
cloud-test quota considerations are in [the pilot envelope](PILOT_CAPACITY.md).

## Photo process recovery and cleanup repair — live, 13 September 2026

Seven isolated recovery checks use real killed/restarted processes and guarded
local files. They cover partial/all-variant writes before commit, lost success
after commit, provider deletion before ledger acknowledgement, concurrent retry,
missing/truncated image bytes and a block during image delivery. Exact upload
retries preserve one asset/history record; lost success after commit writes zero
additional variants. Previous profile photos remain readable throughout recovery.
No real provider, production account or retained user photo is used.

The fault test reproduced a cleanup defect: losing a database commit response
creates a stale ledger entry for an already READY image. Twenty such records
occupied the entire bounded page indefinitely, leaving later garbage untouched.
The existing lifecycle transaction now removes only those matching obsolete
records, never READY files. The next bounded pass reaches later garbage. No new
queue, table, dependency, authority or grace change is introduced. The prior
history test now asserts that a later deliberate deletion receives a fresh grace
period before advancing the fixture's clock.

The final recovery/history run passes 16 checks; the maintenance and album
regressions separately pass ten checks. Types, scoped lint and release-content
checks pass. Product **2026.09.13.30**, application
`cb850fe9b1ff3ca6b8d21d196f0b63e948e7a133`, is READY on
`dpl_6kJAqCknYw48VoX4vy2q8PryV3sh`. Independent canonical assignment and
serving identity match. Thirteen read-only live browser/HTTP groups pass with
zero writes or page errors; the inspected deployment error window is clear.
Actual Vercel compilation passes 141 clean traces, 14,417 entries and 361 server
JavaScript files. All 43 migration checksums match; none was added or applied.

Combined full regression coverage passes all 106 discovered files: 683 passes,
zero remaining failures and two expected skips. This is explicitly resumed
coverage: 38 unchanged development service files contributed 283 checks, followed
by 400 checks and the fresh/upgrade, encrypted restore/replay, both production
builds, HTTPS and restart stages. An old cleanup assertion was corrected to expect
the removed obsolete record. Compilation then exhausted its existing 6 GiB heap
with 42 stopped fixture databases (104,946 files) under the checkout. Those
databases were preserved outside application tracing, and both unchanged builds
passed with the same heap. A private resume helper also needed the normally
created empty sink directories. Failed attempts are retained; this is not an
uninterrupted successful gate or a measured application speed improvement.

At 19:41 UTC, the actual private-Blob/deployed-image-worker probe passed six
groups: unauthorized denial, authorized empty run, four private variants with
unsigned reads denied, actual worker removal and inert repeat, plus unchanged
user/asset counts and no remaining probe. Operational writes were exactly one
maintenance record created/deleted and four tiny objects created/deleted; no
account, asset or retained user photo changed. The existing notification and
retention maintenance runs also pass with no sends, erasures, pending work or
failures. The working device binding and VAPID identity remain intact.

No queue, schedule, provider configuration or permission changed. Broader service
health, dense-relationship capacity and physical/owner acceptance remain open.
[Visible release notes](https://godschurches.com/platform/releases/photo-cleanup-recovery)
and existing photo entries in [Explore](https://godschurches.com/platform/features)
describe only the shipped repair. Notification recovery below remains a dated
isolated receipt and is included in the subsequent full regression coverage.

## Notification worker recovery — 13 September 2026

Six new isolated checks pass using real disposable worker processes, the canonical
outbox service and a loopback HTTP provider simulator. Workers are killed after a
committed lease both before sending and after simulated provider acceptance.
Restarted processes respect live leases, recover expired leases and preserve the
single canonical message, event and delivery intent. A lost provider acknowledgement
can cause another generic push attempt; this is not an exactly-once delivery claim.

The checks also prove that a stale worker cannot overwrite a newer lease, a later
block or session revocation prevents sending, a real PostgreSQL advisory-lock
timeout rolls back the claim, and eight failed worker attempts reach the existing
terminal guard. Seventeen existing outbox, service-worker and subscription checks,
TypeScript and scoped lint pass. The shared fixture removes duplicated test setup;
there is no application code, schema, dependency or provider-configuration change.

The normal full test gate discovers `tests/notification-recovery.test.ts`.
These tests use isolated database fixtures and local HTTP only: no production
application writes or real phone sends. This verifies process recovery, not a
new native queue deployment or physical-device result. Missing-media recovery,
broader service health and the remaining capacity/owner acceptance stay open.
Production remains **2026.09.13.28 / d0549cf**.

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
