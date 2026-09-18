# Resource budgets for enabled modules

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

Fresh acceptance: fixture guards and migrations, 220 successful serial service
observations, 50 initial feed reads, all 920 HTTPS reads, ten read-only query plans,
TypeScript, scoped lint, copy and diff checks. The measurement adds no runtime
code, dependency, schema, provider setting, production write or recipient send.
No new full application suite or production deployment is required for these
measurement helpers; the existing verified runtime release remains applicable.
Newly unlocked pagination/index, expanded restore and cross-module recovery
acceptance keep their own tasks and must use actual evidence.
