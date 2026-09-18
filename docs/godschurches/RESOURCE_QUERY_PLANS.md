# Measured resource query plans and bounded traversal

September 18, 2026. Local investigation on the fictional fixture described in
[resource budgets](RESOURCE_BUDGETS.md), using the unchanged 2026.09.18.8 runtime.
The evidence below supports one listing index. After the shared schema slot
opened, `20260918195500_exchange_price_order` added exactly the measured ascending
candidate. Combined release gates and production publication remain pending.
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
checks; the live database still has 100 migrations and no price-order index.

Remaining: review the navigation correction's tested handoff, verify the combined
candidate and complete production migration, deployment identity and live checks.
Keep acceptance open until those steps have actual evidence. No source permission,
cursor format, service query, dependency, provider setting or production row has
changed in this investigation and local verification.
