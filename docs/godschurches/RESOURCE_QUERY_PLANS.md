## Incoming Needs query-plan evidence scope, 8 October 2026 UTC

Version **2026.10.08.8**, source `c2d6399a542dd2a47b78cb983138c2a40767d6f7`: **verified live**. [PR45](https://github.com/LifEXPAdmin/church-landing/pull/45) integrates coordinator incoming Needs privacy and the preserved progress freshness correction. The scoped Need read projection now respects contributor sharing consent. No new query-plan measurement was run for this release. Previously measured resource-query contracts are reusable only under the recorded source-applicability review; existing counts, source identity and limitations below are unchanged.

Fresh affected behavior: 18 service tests, 2 HTTPS cases and 25 full application browser groups passed (5 incoming, 10 My Needs and 10 complete Needs groups), plus separate controlled progress scenarios. [Deployment report](DEPLOYMENT_REPORT.md) records current release acceptance and reuse. Read-only release checks do not measure production load or capacity.

## My Needs release query-plan applicability, 8 October 2026 UTC

Version **2026.10.08.7**, source `89a84fe4a65cf94a827ceac584d763eee56b60e2`: **verified live**. This contribution presentation change leaves backend queries, order/cursors, schema and query-plan tooling unchanged. Applicable prior plan evidence: the unchanged plan contracts reuse [run 37733416079](https://github.com/LifEXPAdmin/church-landing/actions/runs/37733416079), source `bbc5589`, with 97 service checks, 72 full-response/cursor comparisons and 168 prepared executions. It retains its original source and fixture attribution; no new query-plan or performance execution is claimed.

Fresh seventh behavior checks: 18 service tests, 2 HTTPS cases and 20 browser groups passed, comprising ten contribution-privacy and ten complete Needs groups. Canonical/live and data evidence are recorded in [Deployment report](DEPLOYMENT_REPORT.md). Read-only release checks do not measure production load or capacity. All prior measurements and limits below remain intact.

## Saved-search and favorite release applicability, 8 October 2026 UTC

Version **2026.10.08.6**, source `dca251e58aedf04ce20aa016981242dc22ce11fe`: **verified live**. Its client privacy changes preserve the measured query, current authorization, order, cursor, schema and plan-tooling contracts. The reviewed [original plan run](https://github.com/LifEXPAdmin/church-landing/actions/runs/37733416079) remains source `bbc5589`: **97 service checks, 72 full-response/cursor comparisons across eight shapes and 168 prepared executions**. No new query-plan or performance execution is claimed; retain all original timings and host/fixture limits below.

Current behavioral verification is fresh: **65/8/118 Exchange** and separate **34/2/33 Discovery** service/HTTPS/browser checks. The changed shared reader’s inquiry, Topic, Support and scheduled-post consumers were included. Canonical identity: **source dca251e58aedf04ce20aa016981242dc22ce11fe and version 2026.10.08.6 matched the READY canonical deployment at 2026-10-08T08:55:49.988Z**. Data comparison: **165 original table fingerprints and 123 migration records remained unchanged in read-only comparison at 2026-10-08T08:57:22.850Z; no migration was applied**. Read-only release checks do not measure load or production capacity. [Deployment report](DEPLOYMENT_REPORT.md) records the acceptance scope.

# Measured resource query plans and bounded traversal

## Applicability to the handoff and saved-choice release, 8 October 2026 UTC

Version **2026.10.08.5**, source `284e054dd35222d47896562506364cdd1989af0f`: **verified live**. Query-plan evidence remains the original [run](https://github.com/LifEXPAdmin/church-landing/actions/runs/37733416079) on `bbc5589ad566abc4d3140fa7fdb92a128c665d4d`: **97 service checks, 72 full-response/cursor comparisons across eight shapes and 168 prepared executions**. The source review binds the unchanged measured contracts and retained artifacts. Ten fourth-release inquiry-list browser groups are separately reused under seven unchanged source hashes and are excluded from the fresh 55. No new query-plan or performance run is claimed.

The same-run newest median remains **176.03 → 51.26 ms** and price-low **178.68 → 41.29 ms** across the original eight measured pairs per shape. These are fictional service-call observations, not production speedup or HTTP tail-latency evidence. Preserve the original source, host, fixture and detailed results below.

Fresh affected release acceptance: **393 source/security checks, 65 service tests, 6 HTTPS cases and 55 browser groups**. Canonical identity: **2026-10-08T07:47:53.921Z**; live guest checks: **238 checks passed at 2026-10-08T07:48:54.185Z**. 165 original table fingerprints and all 123 migration records remained unchanged in read-only comparison at 2026-10-08T07:49:53.193Z; no new migration was applied. These read-only checks do not measure load or capacity. Rapid repeated Back and production/100-client headroom remain open; [Deployment report](DEPLOYMENT_REPORT.md) records the release evidence.

## Applicability to the live defaults and inquiry release, 8 October 2026 UTC

Release **2026.10.08.4**, source `5524ee9fcbf32350289279b5bc55c8f71ca27761`, reuses query-plan evidence from `bbc5589ad566abc4d3140fa7fdb92a128c665d4d`. The measured query, authorization, ordering, paging, schema, fixture and measurement contracts are unchanged; source and retained artifact hashes were reviewed. No new query-plan or performance execution is claimed.

The original [plan run](https://github.com/LifEXPAdmin/church-landing/actions/runs/37733416079) passed **97 service checks, 72 full-response/cursor comparisons across eight shapes and 168 prepared executions**. Preserve its source, host, original measurements and caveats below. Fresh affected release acceptance passed 304 source checks and 22 service / four HTTPS / 77 browser groups; [Deployment report](DEPLOYMENT_REPORT.md) records the exact evidence.

Canonical release identity passed at 06:57:34 UTC, followed by 228 live guest checks. At 07:00:49 UTC, 165 production tables and 123 migrations remained unchanged. These read-only checks are not load/capacity measurements. Broader query/performance work, rapid repeated Back and 100-client/production headroom remain open.

## Exact-source Exchange verification, 8 October 2026 UTC

Source `bbc5589ad566abc4d3140fa7fdb92a128c665d4d` passed fresh [query-plan verification](https://github.com/lifexpadmin/church-landing/actions/runs/37733416079). All 72 paired calls across eight
query shapes matched complete responses and signed cursors. Each shape has one
warmup and eight measured pairs, alternating baseline/candidate order. The
separate service profile passed 97 checks, and the SQL probe completed 168
prepared executions. The baseline remains `6d81eb56f088062de5726cfaef8f45464ffdd6b9`.
Its module hash was checked before execution; private actor/query parameters were
excluded from uploaded evidence.

The following medians use all eight measured pairs per shape in this run. They
are service-call observations, not HTTP tail latency or production capacity.

| Query | Baseline median ms | Candidate median ms |
| --- | ---: | ---: |
| Newest | 176.03 | 51.26 |
| Price low | 178.68 | 41.29 |
| Price high | 173.70 | 41.39 |
| Selective text | 55.14 | 55.28 |
| No match | 53.74 | 46.23 |
| Guest newest | 104.16 | 23.10 |
| Owned listings | 26.71 | 26.37 |
| Second page | 181.58 | 51.60 |

The fixture used 12,000 listings, 10,000 accounts and 23,000 relationship-policy
rows on a four-logical-CPU Intel Xeon Platinum 8573C runner, Node 24.21.0 and
PostgreSQL 16.15. Selective and owned reads show little change. Different hosts
and sampling windows prevent equating these results with the older late-call
medians below; no universal or production speedup is claimed.

The ordered 120-ID window still applies full current authorization and complete
canonical fallback. Returned cursors use actual returned listings, incoming anchors
retain current permission checks, and owned queries retain their original path.
No migration, index, global planner override or permission relaxation was added.
Full application acceptance comes separately from [exchange verification](https://github.com/lifexpadmin/church-landing/actions/runs/37733416066):
141 services, one HTTPS case, 50 browser groups and build `u0OdNPer11KrFSG9n4QNt`.

Release **2026.10.08.3** status: **verified live**; canonical identity
**source and version matched godschurches.com at 06:08:34.727 UTC**. Production data comparison:
**all 165 tables unchanged at 06:14:28.124 UTC**. Deployment does not turn this isolated
measurement into live capacity evidence. Broader latency/headroom and 100-client
acceptance remain open; [resource budgets](RESOURCE_BUDGETS.md) records the fresh
concurrent fixture. Dated prior results below retain their own tested sources.

## Current Exchange repair, 3 October 2026 UTC

The current fictional workload reproduces the slow generic authorization join
despite the earlier price index. The diagnostic baseline
`6d81eb56f088062de5726cfaef8f45464ffdd6b9` uses the existing canonical service,
schema and permission predicates. Broad newest and price queries switch from
five custom plans to generic plans; the generic Church join rejects about
1.2 million row combinations for 12,000 listings. No JIT compilation appears in
these plans, although the server enables JIT above its configured cost threshold.
The separate SQL probe's prepared-plan counters are not application connection
counters.

Application change `c8cdca51b303522e8768ae7c9dab8b5a7c47b337` first reads an
ordered window of at most 120 candidate IDs using the existing search, distance,
cutoff and continuation conditions. It then applies every existing authorization
predicate to those IDs. An insufficient full window falls back once to the
canonical authorized query strictly after the window's last candidate. A short
window proves exhaustion. Hidden prefixes therefore cannot truncate a page or
end pagination early. Owned listings keep the original query. Nearest ordering
applies this procedure independently within each distance band.

The external cursor still uses the last returned listing, and incoming anchors
retain full authorization revalidation. The internal candidate boundary is never
exposed as a cursor. There are no new indexes, migrations, dependencies, global
planner overrides or weakened permissions. The common path adds one SQL read;
fallback can add another within a band.

### Alternating paired measurements

Run `37086108270` on candidate
`e9708e364057d63d2621967212a2509c3464f986` alternates the original and candidate
canonical services on the same fresh fictional fixture. All 72 pairs compare
the complete response and signed cursors successfully. Each of eight shapes has
one warmup and eight measured calls with fresh clients per shape. The following
medians use calls six through nine, when the original broad queries exhibit
their repeated-call slowdown. They are not HTTP tail-latency measurements.

| Query | Baseline median ms | Candidate median ms |
| --- | ---: | ---: |
| Newest | 299.249 | 46.594 |
| Price low | 303.672 | 34.768 |
| Price high | 299.595 | 35.442 |
| Selective text | 54.958 | 55.354 |
| No text match | 50.455 | 48.411 |
| Guest newest | 176.781 | 25.180 |
| Owned listings | 25.470 | 26.144 |
| Second page | 311.417 | 46.033 |

The host was an AMD EPYC 9V74 runner with four logical CPUs, Node 24.21.0 and
PostgreSQL 16.15. The fixture includes 10,000 accounts, 100,000 posts, 500,000
comments, 12,000 listings and 23,000 relationship policies. Measurements ran
from 01:30:15 to 01:30:30 UTC. A previous paired run on the same CPU model also
matched every response and showed broad-query improvement. Selective and owned
reads show little benefit; no universal improvement is claimed. The default
connection-pool limit was not measured. These serial warm-fixture observations
do not establish PostgreSQL 17, provider latency or concurrent production capacity.

### Current bounded HTTPS workload

The unchanged resource profile passes on source
`38f61587813c1fa442363bc085007c51ee752a6b`, run `37087676431`, build
`BI6SIaGnCfIKKSzCZ30dr`. All 220 measured service reads and 920 workload HTTPS
requests pass; the latter include 20 warmups and 900 measured responses.
Collection totals 124,171,264 response-body bytes under the existing caps.
The workload runs on a four-CPU Intel Xeon 6973P-C runner with about 16 GB RAM,
Node 24.21.0, PostgreSQL 16.15, local image storage and MFA off. The receipt
matches exact source, build and fixture digest. Service measurements span
01:55:48 to 01:55:58 UTC; HTTPS spans 01:55:58 to 01:56:35 UTC.

| Concurrent clients | Requests/second | Newest Exchange p95 ms | Price Exchange p95 ms | Latest feed p95 ms | Following feed p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 17.16 | 42.73 | 33.23 | 170.25 | 201.29 |
| 5 | 33.53 | 107.20 | 96.44 | 348.64 | 322.12 |
| 25 | 35.07 | 855.92 | 903.03 | 1,033.67 | 1,031.86 |

Each path has 30 measured observations at each concurrency level, within the
unchanged ten-path mix. The earlier workload used an Intel Xeon Platinum 8573C;
this comparison is not a controlled before/after HTTP speedup. Feed p95 still
exceeds one second at 25 clients. Loopback traffic without think time or network
shaping, default pool size unmeasured, and local image delivery do not certify
provider headroom, 100-client capacity or physical-device acceptance.

### Verification and release gates

All 97 Exchange service cases pass on `fb613b1`, including compatibility,
hidden windows at 119/120/121 entries, a long hidden prefix, all-hidden results,
20/21 visible boundaries, complete pagination, varied prices and nearest bands.
Full run `37089319853` passes on source
`fb613b1664433cd0f173a35a501cb8a9e59eded3`, build
`CXMpwc5UiSg2TsppRxLiQ`: 97 service cases, 16 listing and eight search browser
groups, and one HTTPS case covering API, HTML/RSC and photo access. The runner
verifies that exact serving source before both browser checks with MFA off and
the HTTPS case with MFA enforcement configured. This is not proof of an actual
MFA challenge. Corrected browser checks await saved responses and history cleanup,
use current empty-state wording and verify visible dark enlarged-text editors.
Settings observed one expected authenticated foreground-session request and no
preference writes.

The account-switch case eventually clears private editor values, but its new
stage timings show 29.6 seconds from focus to clearing, even after save settlement.
Immediate concealment for that scenario is not established. The cause needs a
separate reproduced privacy investigation before closing that acceptance gate.
All 118 source guards, copy and TypeScript checks pass. The failed dependency
audit below prevents downstream CI signature, lint and secret checks from running;
changed files pass local lint. No all-pass release receipt is issued.

The unchanged source security gate now fails on newly published
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), affecting
`braces <=3.0.3`. As checked on 3 October, the advisory lists no patched version.
The affected dependency paths in the lockfile are development tooling through
Tailwind and Next ESLint. This is distinct from the earlier repaired
`brace-expansion` advisory. Earlier zero-advisory receipts are historical;
current release clearance requires a compatible verified fix. No audit bypass
or forced major upgrade was applied. This candidate is not release-ready,
integrated or live. No production connection, migration, write or send occurred.

## Historical September investigation

September 18, 2026. Local investigation on the fictional fixture described in
[resource budgets](RESOURCE_BUDGETS.md), using the unchanged 2026.09.18.8 runtime.
The evidence below supports one listing index. After the shared schema slot
opened, `20260918195500_exchange_price_order` added exactly the measured ascending
candidate. The migration is applied; application publication is waiting for the
provider's deployment queue, as recorded below.
No production performance improvement is claimed.

## Reproduced planning behavior

The captured price-sorted listing SQL was prepared on a dedicated local connection
with the same parameters and all current permission predicates. Under PostgreSQL
17's automatic choice, the first five executions used custom plans and the next
ten used a generic plan. Across 15 EXPLAIN ANALYZE executions, the automatic-plan
median was 139.40 ms; forced-custom was 16.76 ms and forced-generic was 144.62 ms.
The final automatic execution visited 73,259 shared blocks. All returned rows and
their order had identical hashes.

A full composite index on `(currency, intent, state, priceMinor, publishedAt DESC,
id DESC)` changed the same freshly prepared automatic query to 15 custom plans,
with median execution 0.065 ms and 80 shared block hits on the last execution.
The index occupied 827,392 bytes for 12,000 listings. The experiment ran in a
transaction and rolled back the index. No global/session planner override was
added to application code.

This supersedes neither the earlier single-owner fixture nor its rejected index
decision: the new fixture has 25 owners and dense relationship predicates. The
same candidate must be evaluated against the actual application and connection
lifetime, not accepted from EXPLAIN alone.

## Application comparison

The canonical service was measured for ten query shapes, 15 calls each, against
baseline, one ascending price index, and ascending plus descending indexes.
Every call compared the full serialized projection and signed cursors against
its original result. All 450 observations agreed. A second 450-observation run
opened a fresh application connection at each phase. Both used one connection,
current permissions and identical source rows; they are serial local tests, not
hosted concurrency evidence. The shared Mac also had the independent worker's
support suite running.

| Query | Fresh baseline p50 ms | One index p50 ms | Two indexes p50 ms |
| --- | ---: | ---: | ---: |
| Price low | 124.78 | 10.11 | 10.14 |
| Price high | 125.93 | 9.96 | 11.41 |
| Newest | 10.41 | 10.59 | 9.85 |
| Price low, minimum price | 23.02 | 10.00 | 10.20 |
| Price low, one text match | 26.11 | 26.05 | 26.60 |
| Price low, no text match | 26.41 | 26.62 | 26.68 |
| Guest price low | 17.09 | 2.67 | 2.74 |
| Own price low | 9.48 | 9.44 | 9.25 |
| Price low, second page | 126.60 | 14.59 | 14.66 |
| Price high, second page | 132.12 | 12.93 | 12.69 |

The existing connection retained the slow generic behavior after index creation:
its broad price medians stayed about 128 to 135 ms. Fresh connections materially
improved those paths. Index creation alone therefore does not guarantee every
already prepared connection immediately improves. Do not reset production
connections or force a planner policy merely to match this fixture. Normal
release verification must record the serving version and applicable limitations.

The descending index added another 827,392 bytes without a useful measured gain.
Keep only the ascending candidate for integration. Selective text searches and
newest/owned paths show no material benefit; do not advertise a universal search
speedup. Both experiment runs removed every index they created.

## Bounded results and cursor acceptance

With only the ascending candidate installed on the fictional fixture, complete
canonical-service traversals returned all 12,000 listings exactly once in each
of price-low, price-high and newest order: 600 pages per order, each at most 20
rows. Exact order matched the independent deterministic fixture definition.
Traversal times were 9.74, 9.60 and 8.76 seconds respectively, including all
permission checks. These are complete local walks, not individual-request SLAs.
The group traversal returned all 1,000 groups exactly once in 51 bounded calls,
including its final empty page. The temporary index was removed afterward.

Six fresh existing regression cases also pass with the single candidate on a
separate isolated database: permission-filtered listing pages and stale cursors;
equal-price ties, concurrent arrivals and changed anchors; authorized distance
bands; a shared event amid more than 1,000 hidden occurrences; media authority
revocation during storage; and concurrent photo bounds with exact retries.
The regression index was removed. TypeScript, focused lint, formatting, copy
and whitespace checks pass. An initial test-helper union type error was corrected
with an explicit query-array type; it did not require a runtime change.

Existing listing pages already fetch at most 21 candidates, use a signed
viewer/criteria/time-bound keyset, and reject changed or unavailable anchors.
Group discovery scans at most 200 candidates in batches of 20 while filling a
20-result visible page. Its cursor advances through scanned candidates without
exposing hidden counts. Calendar layers are capped at 20, agendas fetch at most
1,001 permitted occurrences and reject overflow beyond 1,000; hidden events are
filtered before applying that bound. Media detail reads select one authorized
source and recheck it after storage; native and referenced photo queries each
fetch at most 11 records to enforce the combined ten-photo bound. These existing boundaries need no speculative
pagination replacement or unrelated index.

## Reproduction and remaining release work

`tests/resource-query-plans.ts` runs only against the isolated fictional fixture
and rejects provider credentials or an existing experiment index. Its default
mode retains a connection, `fresh` replaces it per phase, and `walk` verifies
complete traversal with the single candidate. Use the existing test loader and
private fixture environment. Raw SQL, parameters, actor credentials and detailed
receipts stay outside the public repository. An interrupted experiment must be
inspected before removing any leftover index; the harness never silently
overwrites one. Each later run records a separate attempt with explicit success
or failure status. A deliberate fixture-guard failure verifies that failed
attempts preserve all three accepted receipts unchanged.

## Local release acceptance

The measured ascending index is now implemented by
`20260918195500_exchange_price_order`. The candidate passes the complete local
gate: 190 discovered test files, 1,222 passing tests, two expected production-stage
skips and no failures. Both skipped development-delivery cases pass in their
earlier development stage. The process exits successfully on source `517aec1`.

The production build passes with 223 runtime traces, 74,044 entries and 556 server
JavaScript files. Five built HTTPS browser groups pass without errors, including
price-high filters, exact result order and Back/scroll restoration. A protected
copy of the actual production database upgrades from 100 to 101 migrations while
preserving all 144 original application table/column fingerprints. Protected
replay completes and temporary plaintext is removed. These are local release
checks. At that local checkpoint the live database still had 100 migrations.

## Applied migration and pending application publication

The production wrapper applies the one index migration successfully at
20:53:12 UTC. Main advances normally to `5dc7f77`; its runtime is identical to the
fully tested `517aec1`, with only the two acceptance reports added afterward.
All 101 live migration checksums match the installed recovery registry. A fresh
encrypted backup restores all 144 application tables at 21:03:03 UTC, temporary
plaintext is removed, and the 79-set retention inspection reports no issues.
The exact index is valid and ready. All 144 original production row fingerprints
remain unchanged through 21:09:39 UTC. Three bounded public Exchange reads also
pass with the previous application version and the newly applied index.

The automatic Git trigger creates no observed deployment record. An explicit
deployment of the same immutable Git commit is accepted as
`dpl_2cEBAFg4XJyP3PyJzs6ih5V4xjse`, but waits in Vercel's system build queue.
Vercel reports an active deployment-trigger/build incident starting at
20:32:36 UTC. The canonical application remains release 2026.09.18.8 at this
checkpoint. This is an applied database change and a published Git commit, not a
verified application release. The separate navigation correction remains excluded.

Remaining: observe READY, confirm the canonical alias and exact serving SHA,
then finish application/browser, health, queue-consumption and runtime checks.
Preserve the existing queued deployment; do not submit duplicate attempts.
No source permission, cursor format, service query or dependency changed, and
the release verification performs no application-row writes or recipient sends.

## Verified application publication

The existing queued deployment becomes READY at 21:08:31 UTC and is verified on
`godschurches.com` at 21:19:50 UTC: release 2026.09.18.9, exact application
`5dc7f770d1c781754f27a04b0e72528f5985a004`, deployment
`dpl_2cEBAFg4XJyP3PyJzs6ih5V4xjse`. The provider build verifies the same hydration
renderer and 223 runtime traces. No second deployment is submitted.

Twenty live public/browser/privacy checks and six health checks pass. A single
reserved nonexistent-source native queue probe is accepted and consumed with no
application writes or recipient sends. Exact-deployment runtime logs from READY
through 21:20:55 UTC contain zero error or fatal rows. All 101 production and
recovery checksums match, the index is valid/ready, the 21:03 encrypted backup
restores 144 tables, and 79 retained sets have no inspection issues. All 144
original table fingerprints remain unchanged through 21:20:56 UTC.

Live newest, price-low and price-high reads remain bounded and available. There
are currently no public sale listings; the latency improvements above remain
local dense-fixture measurements rather than a production performance claim.
The application release is accepted. Hosted load, physical-device evidence and
other tasks' operator gates remain separate.
