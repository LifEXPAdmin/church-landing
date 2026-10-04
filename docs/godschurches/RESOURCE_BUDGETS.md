# Resource budgets for enabled modules

## Immutable failure evidence, 4 October 2026 UTC

The measurement harness previously overwrote `http-budget-progress.json` after
each successful stage. Its first rejected concurrent request ended the stage
before sibling requests settled, and failed-stage samples never reached a
receipt. A fictional-stream reproduction of the actual harness completed 920
calls but overwrote progress twice. A controlled stream failure after dispatch
328 left 330 attempted calls, 34,569 retained bytes and seven validated samples
in the current stage; the only surviving receipt recorded 320 calls and 34,112
bytes. These small fake responses reproduce evidence loss, not application
latency or capacity.

Each service or HTTP invocation now creates a new `resource-receipts` attempt
directory. Started, stage and terminal JSON files use exclusive creation.
Concurrent HTTP workers stop scheduling on shared cancellation and all settle
before stage/failure counters are serialized. Failed requests retain numeric
status, delivered and retained byte counts, elapsed time, body-completion and
validation flags, and a fixed failure phase. Empty validated groups have zero
counts and null statistics. Completed stages remain available when final serving
identity, database statistics or database disconnection fails. Terminal success
is published only after successful cleanup.

The HTTP workload is still 20 warmups and three 300-call stages at concurrency
1, 5 and 25. The former defensive 1,000-call guard is tightened to the intended
920 calls; before/after serving-identity probes are separately counted. Retained
body limits remain 256 MiB total and 8 MiB per response. `totalBytes` retains its
collected-body meaning. `totalReceivedBytes` counts chunks delivered to the body
reader, including an unretained crossing chunk; it is not transport-level wire
usage. Actual attempted warmup/measured counts are separate from the planned
workload and validated sample counts. Existing status, expected content/count,
cache, image type and source/build/fixture identity checks remain mandatory.

Service groups likewise preserve failed warmups and partial measured samples,
with unset response sizes represented as null. Query capture always stops on
failure. The fixed `service-budget.json` remains an immutable HTTP prerequisite;
an existing service receipt rejects a repeated service phase before cursor or
service calls. A new service measurement requires a fresh fixture. HTTP attempts
can retain independent results in the same fixture directory without replacing
old receipts. Fixture/cursor files also use exclusive creation where written by
this harness. Configuration and clean-source preflight precede attempt creation;
those refusals do not promise a receipt.

The artifact workflow explicitly selects started/stage/complete/failed receipts
and the existing candidate/service prerequisite. It excludes raw query events,
actor credentials and cursor data. Failure receipts and CLI initialization and
measurement errors use fixed codes, never raw exceptions, assertion inputs,
response bodies, paths or header values. The boundary starts after static module
loading; Node dependency-loader failures precede it. Configuration/provider
guards still run before Prisma construction and measurement attempts. The
original exception is preserved internally through cancellation, evidence-write
failure and cleanup. Existing files are never replaced to repair a collision.

Verification for this correction uses the real orchestration and reader with
fictional streams and small internal files. All 31 receipt/harness regressions
pass, including a successful 11-warmup/220-sample service phase feeding the
920-call HTTP phase, immutable retries, partial failure and cleanup ordering,
the rejected 921st call, and canaries in every forbidden provider credential,
database mismatch, malformed configuration and filesystem/source errors. These
tests execute the actual measurement and CLI initialization functions with
fictional boundaries. They do not run the database,
application server, browser, hosted workflow or a capacity experiment. The dated
measurements below remain historical evidence; integration, an authorized real
runtime check, provider headroom and production-capacity acceptance remain open.

## Current dense workload, 3 October 2026 UTC

Candidate `45159afb34426a8eaef94296f5789b73378435dc` passes the isolated
dense measurement on [run 37082673236](https://github.com/LifEXPAdmin/church-landing/actions/runs/37082673236).
The actual serving source, product `2026.09.28.42`, production build
`YmF69MzAsV80yV-sp19Js` and fixture metadata digest agree with the candidate
receipt. The digest identifies the fixture metadata, not a database snapshot.
Source CI passes 118 guards, types, copy, audit, provenance, lint and redacted
history scanning. This adds measurement infrastructure and evidence to the
accepted application below; it is not integrated or live.

The fresh fictional database contains 10,000 accounts, 100,000 posts, 500,000
comments, 50,000 follows, 23,000 relationship-policy rows, 12,000 listings,
1,000 groups and 5,001 events/occurrences. All 100 existing normalized fixture
images were byte-verified without overwriting them. Four variants per image
occupy 131,406,400 bytes. Database size was 407,387,159 bytes. This is fresh
fixture preparation, not recovery acceptance.

The runner used an Intel Xeon Platinum 8573C, four logical CPUs, about 15.6 GiB
memory, Node 24.21.0 and PostgreSQL 16.15. This runner leaves Prisma's pool
settings at their defaults; the effective connection limit was not measured.
HTTPS uses trusted loopback, no artificial latency, no bandwidth shaping and
no think time. Images come from the isolated filesystem. MFA is off for this
measurement; no browser, MFA challenge or physical-device check was run here.
The earlier application browser/security receipts retain their own exact sources.

### Service observations

There are 20 serial measured reads per path after one warmup, or 220 measured
reads and 11 warmups. Fifty initial Latest/Following reads across 25 actors are
separate setup measurements. Existing Following reads reuse signed per-account
cursors with current access checks. The service measurement window was
00:40:52 to 00:41:13 UTC; setup occurred before that window.

| Path | p50 ms | p95 ms | Maximum SELECTs | Maximum projection bytes | Store reads |
| --- | ---: | ---: | ---: | ---: | ---: |
| feed-latest | 151.9 | 155.4 | 20 | 33,599 | 0 |
| feed-following | 134.2 | 137.5 | 22 | 41,193 | 0 |
| search-posts | 46.5 | 59.2 | 13 | 4,751 | 0 |
| search-people | 19.9 | 21.2 | 13 | 3,076 | 0 |
| exchange-newest | 257.3 | 263.0 | 16 | 14,403 | 0 |
| exchange-price | 256.6 | 260.0 | 15 | 14,318 | 0 |
| exchange-detail | 26.4 | 28.8 | 18 | 1,188 | 0 |
| groups | 24.0 | 25.3 | 17 | 12,274 | 0 |
| calendar-200 | 42.0 | 45.5 | 21 | 123,560 | 0 |
| image-thumb | 60.8 | 101.4 | 26 | 21,064 | 1 |
| image-medium | 61.2 | 64.2 | 26 | 351,408 | 1 |

Initial Latest creation has median 152.8 ms and p95 192.5 ms; Following creation
has median 726.9 ms and p95 802.1 ms. Projection bytes exclude full HTML and
browser resources. SELECT counts include permission/lock reads; occasional
maintenance can add a statement. These samples do not establish production tails.

### Complete HTTPS observations

All 920 workload requests returned 200 with expected content. Twenty warmups
precede three 300-request stages with 30 observations per path at 1, 5 and 25
clients. All 900 measured responses also retain no-store headers. Feed HTML
checks a fictional-post marker; JSON checks expected row counts, while images
check content type. Browser JavaScript, paint, subresources, uploads and writes
are outside this workload.

| Path | 1 client p95 ms | 5 clients p95 ms | 25 clients p95 ms | Largest response bytes |
| --- | ---: | ---: | ---: | ---: |
| feed-latest | 218.2 | 565.8 | 1,940.0 | 388,124 |
| feed-following | 291.5 | 513.2 | 1,942.0 | 416,768 |
| search-posts | 62.1 | 160.6 | 974.2 | 4,751 |
| search-people | 30.5 | 85.7 | 867.9 | 3,076 |
| exchange-newest | 272.2 | 409.8 | 2,110.4 | 14,403 |
| exchange-price | 272.4 | 421.9 | 2,259.0 | 14,318 |
| groups | 39.7 | 131.0 | 1,854.5 | 12,288 |
| calendar-200 | 51.8 | 363.9 | 1,101.2 | 123,560 |
| image-thumb | 69.1 | 454.6 | 2,027.6 | 21,064 |
| image-medium | 69.3 | 448.6 | 1,762.8 | 351,408 |

The stages achieved 8.33, 18.94 and 17.25 requests/second respectively, with
peak in-flight counts matching their intended concurrency. HTTP measurement
ran from 00:41:14 to 00:42:26 UTC and collected 124,174,838 response-body bytes.
Server readiness and release identity reads are outside workload counters.
Database statistics show zero rollbacks/deadlocks and no additional temporary
bytes across HTTP measurement. Those cumulative counters do not isolate query
plans or identify the cause of the higher latency.

The harness caps workload requests at 1,000, each collected response at 8 MiB,
and total collected response bodies at 256 MiB. A streaming reader reserves
bytes across concurrent responses before retaining each chunk; exceeding a cap
aborts sibling requests. These are collected-body limits, not wire/TLS limits.
Six focused tests cover exact boundaries, oversize and concurrent cancellation,
stream failures, empty bodies and invalid configuration. Only aggregate JSON
measurements are uploaded; actors, cookies, databases and build output are excluded.

### Interpretation and remaining gates

Several paths exceed one second at 25 clients in this loopback run. Exchange
listing reads are also relatively expensive serially, so their current query
plans are the next bounded investigation. This does not establish a regression
against September's different hardware, PostgreSQL version and fixture. The
previous price-index repair is already present and must not be reimplemented.
Production-equivalent PostgreSQL 17, external delivery, actual provider headroom,
the 100-client target and responder acceptance remain open. No production
connection, migration, write, send or provider workload occurred. Build-time
dependency and font downloads are distinct from the measured application workload.

## Saved feed pages verified in isolation, 3 October 2026 UTC

Candidate `890c0f92ad9bb9c84ecdf91d17055c15fe76a725` preserves saved page order
while rechecking current eligibility in increasing windows. It stops when 30
eligible rows and one continuation are known, or the saved set is exhausted.
The first window has 120 references and later windows grow to at most 1,920.
Long revoked prefixes still fill the page. The cursor stays immediately after
the last returned reference, so a restored gap is not skipped by lookahead.
The same permission transaction, current source/hidden/repost filters and
expired-page fallback remain in use for discovery and legacy saved feeds.

The hosted fixture contains 10,000 fictional posts and 10,000 Likes. Each
Public/Weekly size uses one warmup and seven measured reads of a real signed
page cursor. Seeding and initial ranking are excluded. The 100/1,000/10,000
reference sets share that same database. All reads assert the exact 30-row
order and continuation. Additional cases cover long revoked prefixes, restored
gaps, exactly 30 remaining rows and complete revocation. Seven pure paging
tests also cover sparse/duplicate reference equivalence and read failures.

| Saved references | Public median ms | Weekly median ms |
| --- | ---: | ---: |
| 100 | 115.727 | 85.528 |
| 1,000 | 127.999 | 118.128 |
| 10,000 | 133.478 | 123.819 |

On baseline `6650d3a01fa3a4a609b9a8c43767163f19bce3f3`, the 10,000-reference
case sent all 10,000 IDs to the eligibility query. The candidate sends 120 in
this common eligible-page case. Across all queries in the read, fixture-ID
occurrences fall from 10,270 to 390 and serialized query parameters from about
463 KB to 19 KB. Ordinary SELECT counts remain 21 Public and 20 Weekly, with
an occasional additional maintenance read. Parameter counts are not rows
visited by the database or bytes transmitted over the network.

The baseline used AMD EPYC 9V45; this candidate used AMD EPYC 7763. Both used
Node 24.21.0 and PostgreSQL 16 on separate GitHub runners. Baseline 10,000-row
medians were 1,311.643 ms Public and 1,205.595 ms Weekly. These observations
are not a controlled latency speedup comparison across the different hosts.
Seven-sample p95 is just the maximum, not a production tail estimate. Sparse
revocation can require additional queries. The dense workload below, real
provider headroom, production PostgreSQL 17 and 100-client hosted capacity
remain separate acceptance gates.

### Candidate verification

[Source CI 37080713248](https://github.com/LifEXPAdmin/church-landing/actions/runs/37080713248)
passes 112 guards, copy, generated-client types, advisory audit, provenance,
lint and redacted history scanning. The 29 new pure checks cover ordering,
paging and resource-candidate identity. [Hosted runtime 37080713094, attempt 2](https://github.com/LifEXPAdmin/church-landing/actions/runs/37080713094/attempts/2)
passes 34 service/measurement cases, 22 browser groups, two HTTPS cases and
production build `m1oyjnhORwjWb5rWERoaO`. Both server phases verify the exact
serving SHA. Browser checks use MFA off; HTTPS uses enforce mode without
exercising an MFA challenge. Narrow and enlarged-text screenshots were inspected.
No physical-device acceptance is claimed.

Preserved failures explain the QA corrections: await completed account-change
concealment before restoring the original account; await rendered page IDs after
navigation; normalize the isolated denomination fixture and run it before other
fixtures. Assertions retain exact order and access behavior. The first attempt
on the final source passed services but the unchanged Google Fonts loader failed
to parse a returned font URL. The same-source retry passed without a font change.

Private logs, all measurement samples, screenshots and the five-category receipt
are retained. The release-evidence consistency checker passed on the clean
candidate at 00:18:51 UTC. The shared hosted runner retains the artist profile
and adds discovery verification without large workstation artifacts. This is
ready for designated release-owner integration review, not merged or live.
No production connection, migration, write, send or deployment occurred.

## Discovery ordering measurement, 2 October 2026 UTC

The exact-order optimization in candidate
`b626ba8564a53c7572b3fae68196578764a0518f` replaces repeated remaining-list scans
with per-author queues and a heap. It retains the earliest eligible candidate,
the prior-19-post author window, church identity grouping and the earliest-row
fallback when every remaining author is blocked. At most six author heads can
be blocked in that window. Ranking stages, permission checks and cursor formats
are unchanged.

On Apple M4 and Node 22.23.2, `scripts/benchmark-discovery-variety.mjs` compares
the frozen historical implementation with the candidate using one warmup and
nine alternating timed pairs per size and pattern. It checks exact output object
identity before timing and records all samples, source and dirty state. The
recorded checkout was clean. Seven ordering tests cover boundary and fallback
cases, duplicate entries, church/person namespaces and 150 seeded sequences.

| 10,000-post pattern | Historical median ms | Candidate median ms |
| --- | ---: | ---: |
| One author | 825.892 | 0.730 |
| Five author groups | 680.137 | 1.272 |
| Round-robin 100 authors | 10.240 | 1.338 |
| All distinct authors | 10.413 | 2.216 |

These are isolated CPU microbenchmarks. They do not measure database access,
request latency, client rendering or production capacity. The saved-page
investigation and later runtime acceptance appear above. The dense resource
workload below has not been rerun against this candidate. It is not integrated
or live.

## Historical dense workload, 18 September 2026 UTC

Measured September 18, 2026 UTC against the application code in the verified
2026.09.18.8 release. This is an initial engineering budget and measured local
workload, not a user-capacity promise or a hosted service-level agreement.

## Source, fixture and method

Application runtime is `f36d02c2e779ac7bb97131c9be80703c5c4e690c`, identical in
application, configuration, schema and dependencies to live main `0ced807`.
The intervening commits contain reports and test helpers. The existing verified
production build was reused for these measurement helpers.

An independent clone of the retained fictional dense fixture was upgraded from
90 to all 100 current migrations. The original was preserved. The measured clone
contains 10,000 accounts, 100,001 posts, 502,363 comments, 50,000 follows and
23,000 relationship-policy rows. Its added data has 12,000 listings spread across
25 owners, 1,000 groups with current owner memberships, and 25 calendars with
200 private events each, plus one original event. Each measured reader retains
500 follows, 230 relationship choices and 40 group ownerships. Current source
permission checks and bounded output remain enabled.

The 100 synthetic images were reconstructed from deterministic noise through the
current normalizer, with all four variants and matching manifests. This is fixture
preparation, not backup restoration evidence. They occupy 131,406,400 bytes.
The database occupies 408,983,219 bytes after preparation.

Host: Apple M4, 10 logical CPUs, 16 GiB memory, PostgreSQL 17, Node 24.20.0.
HTTPS uses a trusted local certificate and loopback, with no artificial latency
or bandwidth shaping. The application connection pool is capped at 20. A2 had
an independent support suite on the shared Mac; it was preserved. Initial load
averages were about 4.1 to 4.3 over one minute. These are contextual observations,
not a controlled before/after speed comparison. Real delivery and external fetches
were disabled. No cloud experiment, production write, provider purchase or schema
change occurred.

Service measurements use 20 serial observations per path after one unmeasured
warmup, 220 measured calls total. Initial Latest/Following reading-set creation
was measured separately for 25 actors. Following rereads use the actual signed
per-account cursor and retain current-access rechecks. HTTP has 20 warmups and
three stages of 300 requests at 1, 5 and 25 clients. Each stage has exactly 30
requests for each of ten paths, with no think time. Complete response bodies and
status are checked. JSON paths assert their expected row counts and no-store
headers; feed HTML asserts a fictional-post marker, not a rendered-post count;
image responses assert their content type. All 900 measured responses separately
record no-store headers in the receipt.

The first harness incorrectly created a new Following set on each read and hit
the existing 20-active-set guard. That failed log is preserved. Exactly 20 sets
created by that failed attempt were cleared only from this isolated clone; the
harness now measures creation separately and reuses the cursor. No application
limit or permission was changed.

## Service cost

Times are milliseconds; bytes are serialized service projections or image bodies,
not the complete HTML page. SELECT counts include permission and lock reads.
BEGIN/COMMIT and other statements are counted separately in the private receipt.

| Path | p50 ms | p95 ms | Maximum SELECTs | Maximum projection bytes | Store reads |
| --- | ---: | ---: | ---: | ---: | ---: |
| feed-latest | 72.5 | 81.0 | 27 | 34,424 | 0 |
| feed-following | 164.0 | 170.3 | 23 | 41,200 | 0 |
| search-posts | 17.1 | 20.2 | 13 | 4,751 | 0 |
| search-people | 7.2 | 7.5 | 13 | 3,076 | 0 |
| exchange-newest | 9.8 | 10.4 | 15 | 14,023 | 0 |
| exchange-price | 129.3 | 136.3 | 15 | 13,938 | 0 |
| exchange-detail | 9.9 | 10.3 | 18 | 1,169 | 0 |
| groups | 9.6 | 10.1 | 17 | 12,274 | 0 |
| calendar-200 | 18.5 | 20.0 | 21 | 123,560 | 0 |
| image-thumb | 25.2 | 38.6 | 26 | 21,064 | 1 |
| image-medium | 24.9 | 28.7 | 26 | 351,408 | 1 |

First reading-set creation is a different cost from an existing reading-set read.
For latest, the 25 initial reads have p50 73.9 ms and p95 99.4 ms.
For following, the 25 initial reads have p50 479.0 ms and p95 510.8 ms.

## Complete HTTPS responses

All 920 requests, including warmups, returned 200 and their expected content.
Total workload response bodies were 121,514,870 bytes. One release-identity read
and server-readiness health checks are outside those workload counters. Browser subresource requests, client
JavaScript execution/paint, uploads and writes are not part of this read workload.
Each of the following paths has 10% of requests; feed rows are HTML and other
rows are API JSON or binary images.

| Path | 1 client p95 ms | 5 clients p95 ms | 25 clients p95 ms | Largest response bytes |
| --- | ---: | ---: | ---: | ---: |
| feed-latest | 135.8 | 315.3 | 591.4 | 375,290 |
| feed-following | 223.6 | 355.3 | 673.2 | 401,854 |
| search-posts | 29.3 | 84.2 | 485.6 | 4,751 |
| search-people | 14.0 | 35.3 | 460.8 | 3,076 |
| exchange-newest | 18.5 | 47.0 | 671.1 | 14,023 |
| exchange-price | 145.9 | 168.6 | 623.5 | 13,938 |
| groups | 21.5 | 48.4 | 549.0 | 12,288 |
| calendar-200 | 29.4 | 273.6 | 459.2 | 123,560 |
| image-thumb | 39.7 | 346.7 | 1006.0 | 21,064 |
| image-medium | 37.6 | 326.9 | 995.2 | 351,408 |

| Clients / peak requests in flight | Measured stage seconds | Requests/second |
| --- | ---: | ---: |
| 1 / 1 | 17.48 | 17.17 |
| 5 / 5 | 7.30 | 41.11 |
| 25 / 25 | 6.98 | 42.98 |

The 25-client image p95 reaches about one second despite a local filesystem
store. Increasing clients from 5 to 25 hardly increases throughput in this short
mix. Do not infer a sustainable 25-user production ceiling, hosting bottleneck
cause, or approval for the existing 100-client/one-second pilot target. The earlier
hosted feed and medium-image failures remain in [pilot capacity](PILOT_CAPACITY.md).
Five hundred registered users remains a goal, not measured production capacity.

## Database observations and next query investigation

During the complete HTTP workload, observed database transaction commits increase
by 2,078, with no increase in rollbacks, deadlocks, temporary-file bytes or database
size. Buffer hits increase by 7,073,782 and physical block reads by two. These are
database counter deltas, not unique data, network transfer or a bill. The final
observation has 21 connections, including the measuring connection; it is not a
sampled peak. Historic counters from the cloned database are excluded.

Captured current SQL was re-executed read-only with EXPLAIN ANALYZE and buffers
after timing finished. Ten plans cover representative slow statements. The
price-sorted listing statement takes 19.13 ms with a forced custom plan versus
147.16 ms with a forced generic plan on identical parameters and unchanged rows.
Shared block hits are 1,309 versus 73,288, with zero physical or temporary block
reads in either. The generic plan has repeated permission-related subplans and
uses existing listing indexes; both inspect the 12,000-row fixture. This supports
a focused prepared-plan and index investigation, not an index recommendation yet.
The earlier single-owner 12,000-row experiment did not select or benefit from its
candidate price index, so that rejected change is not blindly reinstated.

The current Latest hydration plan also visits dense comment data for exact
permission-filtered counts; Following candidate checks have material planning and
execution costs. Search and group queries retain bounded result pages, and the
calendar query caps the agenda at 1,001 fetched rows with an explicit 1,000-entry
operating limit. Keep authority and stable cursor behavior while investigating
these paths. No permission cache, hidden-count shortcut, reduced page target or
global planner setting was introduced.

## Initial review budgets

These are regression review thresholds for this exact fixture and workload. A
threshold prompts investigation; it never permits bypassing privacy or lowering
acceptance. Compare a clean, equivalently configured run before attributing a
regression to code. Record concurrent work and source/build identity.

- Preserve service page sizes: 30 feed posts, 20 search/listing/group results,
  and the existing 1,000-entry calendar limit. This measured calendar has 200 entries.
- On the same fixture, review any increase beyond the recorded maximum SELECT
  count. Explain legitimate extra source checks explicitly; do not delete a guard
  merely to meet a query count. Following has one observed optional extra SELECT.
- Review serialized projection/HTML growth above 110% of the recorded maximum
  for unchanged fixture content. Do not apply gzip estimates to already compressed
  images: the measured thumb/medium are 21,064/351,408 bytes.
- Initial same-workload HTTP p95 review thresholds are the observed 25-client p95
  plus 25%, rounded upward to 50 ms. They are not user-facing promises:

| Path | Review above p95 ms | Response-byte review above |
| --- | ---: | ---: |
| feed-latest | 750 | 412,820 |
| feed-following | 850 | 442,040 |
| search-posts | 650 | 5,227 |
| search-people | 600 | 3,384 |
| exchange-newest | 850 | 15,426 |
| exchange-price | 800 | 15,332 |
| groups | 700 | 13,517 |
| calendar-200 | 600 | 135,916 |
| image-thumb | 1,300 | 23,171 |
| image-medium | 1,250 | 386,549 |

- For initial Following set creation, review serial p95 above 650 ms on this
  fixture. Repeated reading-set creation is a separate, bounded operation; retain
  the 20-live-set/account and global snapshot/reference guards.
- One authorized image derivative performs one uncached store read and checks
  source access before and after it. This HTTP mix delivered 184 image bodies,
  including warmups. Budget 184 store reads for an equivalent uncached hosted
  adapter, before retries; the actual local run used zero provider operations.
- Four variants make 400 fixture image writes and 131.4 MB of retained bytes for
  100 example images. Production content and normalization vary. Track operation
  counts and bytes separately from active CPU, provisioned memory and currency.
- Preserve the existing 70% provider-headroom review and 85% bulk-experiment
  pause rules. Refresh actual account allowances and usage before expanding a
  pilot. This task does not claim current pricing, complete billing or restored
  Resend dashboard access, and does not expand the earlier cloud-test allowance.

## Reproduction and acceptance

Use only a new fictional dense fixture clone and separate loopback ports, never
production data or the other worker's database. Apply current migrations, preserve
the original, and use the existing isolated environment guards. Place private
browser configuration and dense actor receipts under the invoking worktree's
ignored `.account-test` directory. `tests/resource-budget-fixture.ts` adds the
measured resource mix and synthetic image files; it is not a general data seeder.

Run `scripts/qa-resource-budgets.mjs` with the existing `tests/register.mjs` loader,
the private fixture directory, and `seed`, then `service`, then `http`. Supply only
the fixture environment. The HTTPS server must be the recorded production build,
with external delivery disabled and a verified certificate. The harness requires
the prepared server identity and the response checks described above. It limits timed HTTP work
to fewer than 1,000 calls and 256 MiB of response bodies. Retain failed attempts
and initial set-creation evidence; do not disable application guards to complete
a load test. Raw query parameters, actor credentials and detailed receipts remain
private.

### Current candidate identity contract

The measurement helper now requires a clean checkout and an explicit private
`measurement-candidate.json` beside `resource-fixture.json` before the service
phase. Record the verified candidate rather than copying the historical release:

```json
{
  "schema": 1,
  "sourceSha": "<full 40-character checkout and serving commit>",
  "productVersion": "<verified YYYY.MM.DD.N product version>",
  "buildId": "<exact .next/BUILD_ID>",
  "fixtureSha256": "<SHA-256 of the exact resource-fixture.json bytes>"
}
```

The placeholders are instructions, not an accepted receipt. The helper rejects
source, build and fixture mismatches, binds saved cursors and service/HTTP
receipts to the same candidate, and checks the serving release SHA, product SHA
and product version before and after HTTP measurement. `server-ready.json` must
match the local HTTPS origin, candidate runtime source and recorded build ID.
This checks receipt consistency; the readiness file is not an independent build
attestation, and the fixture metadata digest is not a database snapshot digest.
Preserve previous receipts and use a new owned fixture directory when changing
candidates. Fifteen focused guard tests reject mismatched or missing identity.

### Historical acceptance

Fresh acceptance: fixture guards and migrations, 220 successful serial service
observations, 50 initial feed reads, all 920 HTTPS reads, ten read-only query plans,
TypeScript, scoped lint, copy and diff checks. The measurement adds no runtime
code, dependency, schema, provider setting, production write or recipient send.
No new full application suite or production deployment is required for these
measurement helpers; the existing verified runtime release remains applicable.
Newly unlocked pagination/index, expanded restore and cross-module recovery
acceptance keep their own tasks and must use actual evidence.
