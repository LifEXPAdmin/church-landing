# Exchange search, saved choices and optional alerts

September 16, 2026. The verified starting point is `2026.09.16.10 / 5806549`;
report-only checkpoint `11e3706` records that release. This contract covers the
next unified feature cycle, not a completed release. Reuse the canonical listing
service, current audience predicate, location catalog, owned commands, protected
recovery and notification delivery owners.

## Existing behavior to preserve

Literal title/description/request/service-area search, intent and category
filters, country/town entry, owned status filters and bounded current-authority
pagination are already implemented. The released acceptance proves private
church absence, bilateral block/mute behavior, exact prices, mobile form entry
and safe guest account returns. Extend these paths; do not create another index
service, organization authority store or contact mechanism.

The original search requirement includes intent, category, distance band, church
scope and status. No child-location search, household coordinates or inferred
profile location is permitted. Business delegation remains separate from the
released personal/church listing authority and does not gate their search.

## Query and privacy contract

Every supported route parameter is single-valued, bounded and server validated.
Empty native-form fields normalize to the documented default. Unknown keys,
duplicate keys, invalid enums, incompatible money choices and unsupported towns
fail explicitly. Literal percent, underscore and backslash remain literal search
characters. Search covers the existing four text fields; hidden owner/contact or
private account data never enters search text.

Public browsing defaults to currently **Active** listings. Reserved listings
require an explicit reserved-status choice and are labeled reserved. Closed,
archived, removed, erased, moderated or recovery-quarantined listings are absent.
My listings retains its existing explicit owned lifecycle filters. A public
status parameter cannot select Draft or Archived. Existing detail/history rights
remain separate from availability in search.

Visibility choices are all permitted listings, public listings, or one of the
viewer's currently approved churches. Church selection narrows the existing
audience predicate; it never grants access. A stranger receives no private count,
label, cursor anchor or distance. Every result, image and saved-item follow-through
rechecks current ownership, membership, account state and bilateral blocks.

Condition is an item-condition enum. Free-only means an actual Free item or
explicitly Free service; requests are not free offers. Free-only cannot silently
combine with a paid range. Category/type/condition combinations retain their
meaning even when they produce an empty result.

Money filters require an explicit supported currency and compare exact integer
minor units without conversion or rounding. Bounds may include zero and must be
ordered and within the existing supported maximum. Price comparison also chooses
a basis: item, hour or described task. Item prices select For sale; hour/task
prices select the corresponding paid Service unit. Sorting or filtering must not
treat an hourly rate and an item's price as interchangeable. Selecting a pricing
basis does not activate payment, booking or fulfillment.

Location is an explicit country and named town from the current catalog. With no
radius, a chosen town keeps the current exact-town meaning. Supported radii reuse
10, 25, 50, 100 and 250 km. Radius search is within the selected country and uses
named town centers, not homes or device coordinates. Explain that border areas
may need a different country selection. No GPS request or profile-location write
occurs. Distance presentation and nearest-area ordering use those approximate
bands; they do not expose exact coordinates or claim travel distance.

## Ordering, pagination and measured cost

Newest remains the default. Supported alternatives are low/high price for one
explicit currency/basis and nearest approximate area for an explicit town/radius.
Equal values use publication time and opaque ID as deterministic tie-breakers;
owned newest uses its existing update time. Nearest ordering processes the
catalog bands in order, with stable newest ordering inside each band.

The page remains twenty visible rows plus bounded lookahead. Apply authorization
and selected filters before every database page. Do not fetch an arbitrary first
pool and silently discard distant or unauthorized rows afterward. Reuse the
country catalog and current distance calculation to select town IDs by band.
Distance ordering uses a bounded number of authorized band queries, avoiding a
new coordinates store and per-card lookups. Cards retain their small projection;
full text remains on the authorized detail/editor path.

Bind continuation cursors to the viewer, normalized query, sort and a fixed
first-page time using the existing signed-cursor approach. Recheck the current
anchor and source eligibility. Later arrivals and changed sort values belong in
a refreshed result set; they must not duplicate stable rows across pages.
Changed filters, account or unusable anchors give a deliberate refresh path.
There is no promise to preserve access after revocation.

Existing lifecycle/publication/owner indexes remain. Add only measured B-tree
indexes needed for country/town availability and currency/unit/price ordering.
Literal substring text remains a filter, not a claim of full-text indexing.
Measure representative query counts, database plans, payload bytes and latency
on isolated data before claiming improvement. No hosted load experiment or new
search provider is part of this feature.

## Interface and navigation

Keep the search field and type navigation visible. Group additional filters
behind a clearly labeled control, with applied chips, individual removal, Apply
and Clear. Show bounded displayed-result counts, not hidden/global totals. State
currency/basis, reserved availability and approximate country/town scope clearly.
Handle no-image and long-title cards, empty results, failed reads and retry at
320/390-pixel widths, enlarged text, keyboard use and dark appearance.

Safe URLs retain normalized filters and sorting. Listing entry has a validated
local return destination; browser Back restores filters and approximate scroll.
Current-access checks still run when a cached page resumes. Do not store listing
bodies or private result sets in persistent browser storage.

## Owned favorites and named searches

Reuse owned-session transactions, strict fields, versions, immutable operation
receipts and export/erasure conventions. Favorites are listing references, not
copied title, photo, price or location. Only a currently readable listing may be
added. Owners may remove an unavailable reference without recovering its content.
Unavailable favorites display a generic state and never become broken private
detail links. Favorites do not follow, contact, reserve or notify the listing owner.

Named searches store a bounded normalized query, excluding pagination and return
destinations. They are owner-only, survive sign-out, support deliberate update
and removal, and have explicit limits and stable pagination. They never infer
sharing or alert consent. Account export includes only owned choices; erasure
removes them. Protective restoration cannot silently reinstate a removed choice
or newer alert opt-out.

## Optional matching-listing alerts

Finish this existing child in the same feature cycle once saved searches exist.
Use the existing Activity/outbox/fanout/maintenance delivery system and a named
Exchange notification category. No parallel scheduler, queue provider or email
store. Each search requires explicit alert opt-in. Channel preferences, dated
push consent, registered device, quiet hours, account eligibility, blocks and
current listing audience remain mandatory.

Only a new matching publication after the applicable search/alert opt-in is
eligible. Editing criteria, retrying publication, reopening a listing or delayed
worker delivery must not repeatedly alert the same owner about that listing.
Multiple matching saved searches deduplicate per recipient/listing. A stored
match record may bind this consent and source receipt but carries no copied body.
Deleting or changing a search, opting out, reserving/withdrawing the source or
losing access prevents sensitive delivery and removes actionable private previews.
Activity history may retain only its generic owned unavailable state.

Process recipient pages with bounded persisted progress and exact retries.
Recheck current consent and source immediately before actual transport. Use a
generic matching-listing alert without title, price or location in external
previews; opening it resolves current access. No automatic phone or email opt-in,
no alerts for the publisher's own listing and no real sends for test acceptance.
Wire the existing marketplace alert preferences to the same owner; unrelated
giving/payment preferences keep their own prerequisites.

## Acceptance and release

Finish the newly available Settings entry in this same cycle. The
[Exchange settings map](EXCHANGE_SETTINGS_CONTRACT.md) links current listings,
general-area entry, saved choices, contact requests and notification preferences
without duplicating a preference owner or enabling financial controls.

Prove invalid/combined filters, exact zero/two/three-decimal money, approximate
boundary distances, equal-sort keysets, concurrent changes, blocked/muted actors,
private church denial, no precise coordinates, lost-response saves, competing
favorite/search edits, unavailable references, export/erasure and restrictive
restore. Alert tests cover deduplication, late opt-in, criteria changes, no current
access, device/channel opt-out, quiet hours, failed transport and recovery.

Exercise actual production-built browser filtering, Back/return, saved choices,
sign-out/sign-in, narrow layouts and failure recovery on isolated fixtures. Finish
guidance, release notes, configuration, migration rehearsal and exact canonical
deployment/live acceptance in this same feature cycle. Keep real appointments,
business authority and consenting-adult fulfillment pilots distinct. Final batch
review remains last.
