# Exchange search implementation in progress

September 16, 2026 UTC. This is a local feature checkpoint, not a release receipt.
Production remains the separately verified `2026.09.16.10 / 5806549`.

The existing listing owner now supports explicit availability, item condition,
church-only/public audience, exact currency and item/hour/task price comparison,
free offers, country/catalog-town radius and approximate distance-band sorting.
Authorization precedes every bounded page. Signed cursors bind the viewer,
criteria, ordering and one-hour fixed page time; a separate signed page reference
keeps background access rechecks consistent. Changed anchors require refresh.
The existing town catalog supplies five bounded bands; no private/device location
store or search provider is introduced.

The interface groups extra controls, retains visible text/type search and offers
removable applied-filter chips, Clear, bounded displayed counts and approximate
area explanations. Listing and editor returns accept only validated local result
URLs. Browser history retains only route/account/scroll metadata, with restoration
after the existing access guard allows the page.

Local acceptance: 11 input/cursor/catalog/navigation checks and 23 integrated
listing service checks pass. The latter include equal-price keysets, concurrent
arrivals and anchor edits, current private church and bilateral relationship rules,
authorized paging across five distance bands, and preserved listing/image/recovery
behavior. All 93 migrations, populated upgrade preservation and isolated full
fixture dump/restore pass. Type checking, lint (no errors) and authored-copy checks
pass. Fixture reviewer coverage and the ten-listing hourly cap remain enforced.

The optional isolated experiment uses 12,000 synthetic rows, seven reads per
query and a paired candidate price index. Existing-index medians: newest 19.25 ms,
low price 18.33 ms, high price 17.97 ms, nearest 11.08 ms. Each first-page read uses
15 total database queries and returns 20 rows, with 14,580 to 14,638 response bytes.
The price index is not selected in the captured plans and does not improve price
reads (candidate medians 18.80/19.27 ms). Keep existing indexes. Later warm-cache
changes on other sorts are not attributed to the price index. Actual captured
listing query plans, parameters and experiment logs remain isolated. No hosted
latency or capacity improvement is claimed.

The next local service checkpoint adds private favorite references, named searches
and explicit matching alerts. One additive migration creates three bounded owned
stores and extends the existing recovery/notification constraints. Tombstones and
opaque recovery receipts prevent older backups or late original writes from
recreating removed choices or consent. Favorites never copy listing text. Account
export includes owned choices only; erasure removes them. Saved criteria use the
same strict query parser and current named-place validation.

First publication queues the existing persisted fanout owner only when earlier
opt-in searches exist. Twenty-search batches reuse current listing authority and
criteria; one recipient/listing receipt deduplicates overlapping searches and
retries. Reopened listings do not create a second publication job. Current saved
consent, version, eligibility, source, blocks and audience are rechecked for
Activity and transport. External previews remain generic and email is not enabled.
Exchange phone delivery requires dated category consent and a current device.
Older settings forms preserve categories they did not display.

Expanded local acceptance: all 39 focused checks pass (11 input/cursor/catalog/
navigation and 28 listing/saved/alert service checks), all 94 migrations and the
populated upgrade pass, and a complete fixture dump/restore preserves the new
stores and previous data. These checks exercise overlapping alerts, late consent,
reservation/reopen suppression, private church denial, exact price and radius
criteria, blocks, opt-out and restrictive missing-row/reordered-receipt recovery.
Type checking passes. Remaining acceptance includes complete owned UI, lost-response
browser behavior, saved-choice export/erasure examples, phone/device/quiet-hours
integration and the final complete gate. No real sends or production writes.

Continue this same feature through favorites, named searches, explicit matching
alerts, export/erasure/recovery, current notification owners, production browser
acceptance, guidance/release notes and exact canonical release/live verification.
Do not mark remaining private feature children complete from this checkpoint.

## Integrated acceptance checkpoint

The complete owned interface is implemented, including safe return destinations
from favorites, deliberate editing of existing searches, removable saved choices,
explicit alert selection and immutable retry confirmation. Filter dropdowns have
explicit accessible names. Four new production-build browser groups and all 16
existing listing groups pass on isolated HTTPS fixtures. Browser Back restores
criteria and scroll. Favorites survive sign-out and remain account-only; a lost
successful reply creates one choice. Named-search update and removal preserve
versions and consent. Narrow, enlarged-text and dark layouts fit without overflow.

The focused gate now passes 41 checks (11 query/navigation and 30 integrated
service checks), all 94 migrations, populated upgrade and complete restore.
New nonempty export/erasure acceptance proves another publisher's content is not
exported or modified. Mock phone transport proves dated category/device consent,
no late opt-in delivery, quiet hours, delayed retries, generic payloads and
cancellation after search opt-out. No real sends occur. Product notes are prepared
for the next version; complete-gate, protected upgrade and exact canonical live
acceptance remain required before release/completion.

## Final browser and recovery repairs

Application source `93f9067` and isolated product `2026.09.16.11` pass 58
public/access checks and all 23 browser groups (seven search/saved-choice and
16 listing regressions), with zero browser errors or live application writes.
Forty-two focused service/query checks pass, including verified-adult save
eligibility. Resuming a public listing now uses the signed-in recovery guard so
an uncertain favorite save can confirm its original request after focus changes.
Maximum-length unbroken search chips wrap at 320 pixels with enlarged text.
Privacy guidance now describes private saved choices and restrictive restoration.

The first complete-gate run stopped on the Activity fixture's old explicit
category list. Its only mismatch was the newly supported Exchange category;
all other Activity checks passed. The expectation is updated and those shared
Activity/preferences/notification checks now join the focused Exchange gate.
The full gate is rerun on the final source rather than accepted from the failed
receipt. The production domain remains on the earlier release until it passes.

The local candidate checks 200 runtime traces, 65,640 entries and 507 server
JavaScript files, excluding private fixtures, environment files and the Prisma
configuration loader. Compared with the earlier isolated listing build, listed
browse/detail chunks increase by 4,850/4,848 gzip bytes. Those are local compressed
artifact measurements, not a network latency or hosting-capacity claim.

## Settings follow-through and remaining gate

Runtime `e2c1c93` adds the newly available Settings, Exchange folder in this
same feature cycle. It reuses current listing, saved-choice, contact and alert
destinations. The capability map keeps private pickup defaults and financial
controls behind their owning prerequisites. Twelve targeted Settings/navigation/
release checks, types, lint and copy checks pass. The rebuilt preview passes
59 public/access checks and eight integrated search/saved/Settings browser groups;
its 200 runtime traces and exact hydration artifact pass. The earlier 16 listing
browser groups remain applicable to unchanged listing services and components.

The final-source full gate then exposed one additional old category expectation
in the comment-notification suite. Its mismatch is the added Exchange in-app
category, with the other 14 comment-notification checks passing. This explicit
expectation is updated, all other category assertions are audited, and this
suite joins the focused Exchange regression set. The full gate is rerun with
the Settings finishing integration included. Production remains on .10 until
the complete gate and exact release/live acceptance pass.
