# Seller ownership and external storefront catalogs

September 28, 2026 UTC. E21-01 definition, prepared for integration. The first
catalog presents seller-supplied products and deliberate external checkout links.
It creates no internal order, payment, inventory hold or digital entitlement.
This definition does not activate a seller, storefront, provider or commerce.

## Existing owners and missing scope

Inspected source checkpoint: `799d7074c2e5a3c2e827d03fe3ac0f272f147f17`.
The shared gap mapping is complete and the integration owner has accepted the
business identity contract. There is no implemented storefront, product, business
or artist resource in the inspected runtime registry. Their actual services must
exist before a catalog can claim to support those owner types.

| Existing source | Reuse boundary |
| --- | --- |
| `profiles.ts`, `public-profile.ts`, `portal-policy.ts` | Current eligible adult account and permitted public identity. A member-only profile is not permission to publish private identity/contact fields as a seller. |
| `church-permissions.ts`, `church-assignment-permissions.ts`, `church-management.ts` | Explicit church capabilities, acceptance and revocation. Existing profile, media, volunteer or exchange duties are not catalog authority. |
| [business identity](BUSINESS_IDENTITY_CONTRACT.md) | Distinct business scope, accountable representation, consented public contacts, assertion expiry and disputed claims. A checked fact does not certify products. |
| [artist identity and releases](ARTIST_RELEASE_CONTRACT.md) | Artist stewardship is separate from church identity and supplied credits. Release-edit/publish grants do not grant catalog or financial powers. |
| `exchange-input.ts`, `exchange-options.ts` | Reuse exact decimal validation and currency conventions where applicable. An exchange listing/reservation is not a product, stock hold, checkout or order. |
| `media.ts`, `media-access.ts` | Approved processed image pipeline, current source purpose, rights and audience. A new catalog image needs its own explicit adapter. |
| `resource-contracts.ts`, `content-moderation.ts` | Canonical source addressing and actual scoped moderation adapters. A registry address or report ticket grants no new authority. |
| `account-export.ts`, `account-erasure.ts`, `retention-controls.ts` | Export, lifecycle, encrypted backup and protected replay before new writes. |

Do not rebuild existing exchange, artist-release or media behavior under a Shop
label. Preserve their source identity, privacy, grants and completed acceptance.

## Accountable seller and catalog authority

A storefront has a stable canonical ID and exactly one immutable typed seller
reference: PERSON, CHURCH, BUSINESS or ARTIST. Product IDs belong to that storefront
and remain stable across edits, categories and profile links. Display names, URLs,
email addresses and product titles are not ownership identifiers. A person owning
a business and managing a church does not merge their scopes.

The seller chooses the public seller presentation and separately consented support
contact/link. Keep responsible account IDs, grant history, claim proof, sign-in
emails and private addresses out of public projections. Show who offers the product
without inventing an endorsement, theological approval or checked seller badge.
Explain any supported factual badge according to its source's exact current meaning.

| Seller kind | Required current authority |
| --- | --- |
| PERSON | The current eligible adult account owns the personal storefront and deliberately publishes the seller presentation. Another person's profile or a displayed creator credit cannot be selected as owner. |
| CHURCH | An eligible currently connected account with explicit catalog duties for this church, accepted through the existing church assignment owner. A title, broad leadership label or access to edit the church profile is insufficient. |
| BUSINESS | An eligible representative with an active grant for this exact business and catalog action under the accepted business source. An unreviewed draft business cannot obtain a public shop by creating a catalog. |
| ARTIST | The current eligible artist steward plus an explicitly supported catalog capability for any delegate. Team membership, a church attribution or release-edit authority is insufficient. Unsupported artist stewardship/transfer modes stay unsupported. |

Define separate catalog actions for editing drafts, publishing/editing live
products, archiving/unpublishing and managing catalog delegation. Map them to
explicit source-scoped capabilities before implementation activation. A draft
editor cannot modify a live checkout destination. Only a current publisher can
approve a complete version for public delivery, with bound privileged assurance
for organizational/delegated privileged actions. Ordinary personal ownership does
not inherit an unrelated church MFA gate.

Invitations need exact seller/capability/version acceptance and current eligible
accounts. Revocation, expiry, source closure or lost prerequisite immediately ends
the corresponding authority. Delegates cannot grant themselves more powers or
replace the seller. No automatic grants, role presets, owner backfills or universal
organization hierarchy. Catalog ownership transfer is unsupported in this first
version; an ordinary product edit cannot change seller, redirect responsibility
or reuse another seller's badges. Account erasure still follows its canonical owner.

## Product identity, content and lifecycle

Use DRAFT, ACTIVE and ARCHIVED states with positive versions and explicit actions.
Drafts remain private to current authorized editors. Activation validates the whole
product and seller; archiving conceals its public content and checkout. A retained
owner receipt may show an unavailable state without leaking it to unrelated viewers.
Seller closure, source restrictions and moderation independently gate every product.

Initial descriptive product kinds are PHYSICAL_GOOD, DIGITAL_GOOD, COURSE and
TICKET. Books, shirts and physical music belong to physical goods; recordings or
ebooks offered externally belong to digital goods. A product description does not
host a file, license content, create course enrollment, reserve a seat, mark RSVP,
issue a ticket or guarantee fulfillment. Fundraising belongs to its separate
campaign source, and cannot be disguised as a product to avoid its review rules.

Use bounded plain-text name, description, seller-defined category, supported product
kind, price disclosure, availability disclosure, permitted images/alt text, external
destination and support presentation. Reject arbitrary HTML, executable URLs,
unknown owner/state fields and oversized envelopes. Establish concrete field/page/
image limits in the implementation's shared input contract; errors retain safe
unsent draft data without truncating it or pretending a failed save succeeded.

Options such as size, color, format or ticket category are descriptive entries with
stable local IDs and ordered labels. No stock quantity, selected-option persistence
or local quantity control represents a cart or reservation. Clearly label options
as information to confirm on the seller's external site. Do not append a choice to
the checkout URL unless an accepted provider-specific link grammar supports that
exact public product/variant mapping. Default links may open the external product
page where the buyer makes the final choice.

Images require explicit seller authority and a current assertion of permission to
publish. Reuse processing, limits and metadata removal through a catalog-specific
image purpose and current product audience. No scraping external product artwork,
hotlinking arbitrary images, copying private profile photos or serving uploaded
files as digital purchases. Use an honest text fallback before the image adapter
exists. Changing source material requires its own current rights assertion.

## Price and availability truthfulness

A price is seller-reported descriptive data, not an accepted charge. Store exact
minor units with an explicitly supported currency and price basis; use existing
currency precision validation without silent rounding or conversion. FREE, FIXED,
FROM and SEE_EXTERNAL are explicit disclosures. FREE is deliberate zero cost;
missing price is SEE_EXTERNAL, never free. FROM identifies the described option
or basis and cannot imply every variant has that price. No cross-currency ranking.

Show "Price reported by seller" and its update date. State that the external
checkout determines final price, taxes, shipping, fees and availability. Do not
invent discount savings, tax-inclusive totals, exchange rates or an amount due.
An external API is not active and must not be named as the price source merely
because a product URL points there. Later provider-sourced prices need their own
authenticated policy, freshness and reconciliation contract.

Availability is AVAILABLE, UNAVAILABLE, PREORDER or UNKNOWN, reported by the seller
with its update time. It is not real-time inventory. Display the source/date even
when recent; do not show a green live-stock indicator. Unknown or stale manual
information must invite confirmation externally, not promise availability. A
freshness threshold, if later used, requires an explicit policy, not a guessed
duration. Unavailable products have no checkout action. A preorder must be labeled
as such with seller-supplied expectations, never a guaranteed shipment date.

## Deliberate external checkout

The public action names the external destination and explains that the named seller
and external site handle the resulting order, payment, delivery, cancellation,
refund and support. God’s Churches receives no order or payment confirmation in
this version. Clicking, returning to the page or a URL query such as success=true
cannot create "Purchased", a receipt, a donor badge, enrollment or access rights.
No platform commission, payment provider relationship or guarantee is implied.

The initial link is an explicitly published public HTTPS product/checkout page,
not a private payment session, cart token, download, redemption, login, invite or
account-management URL. Parse and validate the URL server-side: reject credentials,
IP literals, local/private hosts, custom ports, trailing dots, backslashes, control
characters, malformed encoding and executable/non-HTTPS schemes. Validate the
parsed host against the accepted catalog destination policy, not a substring or
display label. Reject shorteners and generic redirect endpoints. Host/path/query
rules must preserve the exact intended public product; no silent stripping of
variant selection or tokens. Unknown query keys/fragments require a canonical
public link or supported exact adapter, not a guessed safe rewrite.

The real publication policy must identify accepted destination hosts/link forms
and review responsibilities before external actions activate. There is no active
provider allowlist or claim of a safe/trusted checkout in this definition. Syntax
validation alone does not prove ownership, safety, availability or fulfillment.
Do not fetch arbitrary destinations, follow redirect chains on the server, scrape
prices, preconnect or load provider scripts while rendering a product. Deliberate
navigation uses noreferrer/noopener and sends no private profile/application data.

A change to destination, seller presentation, price or material product terms is
an explicit versioned publisher action with a review of the changed fields. Bind
the accepted destination to the exact published product version. Concurrent edits
or stale retries cannot restore an old target. A request immediately before opening
rechecks current product/seller/moderation/destination permission; stale retained
pages must conceal or refresh the action. Never accept an arbitrary redirect target
from a request parameter. Previously copied public external links cannot be recalled.

Without an active provider integration the platform cannot observe an external
checkout's success or failure reliably. Explain that availability is determined
externally; offer a deliberate retry of the current permitted link and the seller's
consented support route. A known unsafe/unavailable target disables the action.
Do not claim a provider preview, payment retry, order recovery or successful purchase.
An external destination changing after publication needs reporting/correction;
do not imply that syntactic validation continuously monitors the external site.

## Source projections, reports and recovery

A Shop tab or linked profile projects the same canonical permitted products. It
does not copy them or change their owner. Unsupported business/artist adapters
remain unavailable. A public catalog cannot disclose a private owner profile,
church member list, application, grant or source proof. Categories, collections,
search, counts, thumbnails, metadata and cached details apply current visibility
before pagination. Hide/archive/moderation/rights expiry invalidates all projections.

Integrate product impersonation, prohibited-item and unsafe-destination reports
with the existing source-specific moderation pipeline before public launch. Actual
operator policy, review scope and product-category rules must be accepted; no
automatic reviewer or legal approval is invented here. A seller cannot bypass a
restriction by editing the URL, changing category or restoring an old product.
Platform reporting concerns this listing; external order support belongs to the
displayed seller/provider route. Never collect payment credentials or ask buyers
to upload sensitive order/payment evidence into public product comments.

Use current session, source checks, same-origin boundary, bounded queries, expected
versions and exact logical operation receipts. Unknown save outcome reconciles the
same operation; changed payload/key reuse conflicts. New data needs export/erasure,
retention and protected recovery before release. Restore cannot revive revoked
delegates, hidden products, removed images, withdrawn rights or obsolete checkout
destinations. Compatible writers preserve new records or reject unsupported edits.

## Required implementation acceptance

- Complete persisted catalog manager, storefront and product journeys with actual
  empty/error/conflict/retry states, clear seller identity and external support.
- Person, church, business and artist scopes enforce their actual supported grants;
  wrong seller, draft editor, revoked delegate and stale session cannot alter or
  recover a checkout destination. Unsupported owners are not simulated.
- Malformed/unsafe/private URLs and unknown destination policies fail closed;
  rendering generates no unsolicited provider request or private referrer disclosure.
- Exact price precision, explicit FREE/FROM/unknown distinctions, descriptive
  variants, source/date-labeled availability and unavailable checkout are truthful.
- Clicking/returning/retrying causes zero internal orders, payments, inventory holds,
  fulfillment records or digital entitlements, including forged success parameters.
- Product changes project once across Shop tabs; moderation/archive/rights expiry
  conceal cached detail actions and images before another attempted navigation.
- Export, erasure, populated upgrade/restore and compatibility preserve unrelated
  sources and revocations; measure bounded query/payload cost and batch references.
- Built browser/HTTP/service verification covers narrow/enlarged and accessible
  layouts, unknown outcomes and current source rechecks. Integration-owner migration,
  recovery and live release acceptance remain separate from these definition checks.

Native order identifiers and checkout/fulfillment extensions remain their later
gated tasks. Nothing in this catalog activates billing, subscriptions or commerce.
