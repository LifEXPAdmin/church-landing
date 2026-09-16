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

A separate optional isolated experiment measures 12,000 synthetic rows and compares
an index candidate against existing indexes. Measurements are pending; no hosted
latency or capacity improvement is claimed.

Continue this same feature through favorites, named searches, explicit matching
alerts, export/erasure/recovery, current notification owners, production browser
acceptance, guidance/release notes and exact canonical release/live verification.
Do not mark remaining private feature children complete from this checkpoint.
