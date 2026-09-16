# Exchange listing ownership, audience and lifecycle

September 16, 2026. Implementation contract for the first adult Exchange listing
journey. The inspected baseline is the verified `2026.09.16.9 / 4b834fb` release,
with report-only checkpoint `1c8efc4`. Exchange was reserved at that baseline;
the [implementation receipt](EXCHANGE_IMPLEMENTATION.md) tracks the subsequent
unpublished service and interface. This contract is not a publication receipt.

The current focused listing brief retains the original blueprint's steps 075 to
082: distinct intents, scoped ownership/audience, local discovery, fulfillment
separation and practical safety. Its first usable version is adult-owned free
and for-sale listings. Wanted, services, church needs, delegated organizations,
quantity commitments and real-world pilot acceptance keep their own prerequisites.
The original exclusions remain: no checkout, investment listings, securities,
loans, medical-transport claims, child-location search or guaranteed seller safety.
Later commerce/storefront architecture is not activated by a displayed price.

## Current reuse and missing implementation

| Boundary | Existing owner | Required Exchange integration |
| --- | --- | --- |
| Identity and current account | Owned-session transaction gate, adult eligibility, account restrictions and primary authentication | Every write rechecks the current eligible adult; account suspension, deactivation, deletion and changed sign-in deny it. |
| Resource identity | `resource-contracts.ts` | `exchangeListing` stays reserved until a real authorized service and its gates exist. A church-directory submission is a different resource. |
| Church authority | Approved connection, explicit effective capabilities and authenticator policy | New listing duties need named scoped capabilities; church membership, profile category, title, follow or existing post permission must not appoint a listing delegate. |
| Relationships | `social-policy.ts`, relationship commands and protected recovery | Bilateral blocks apply to personal listings, contact and discovery; mute/snooze filter discovery. No parallel relationship store. |
| Commands and retries | Social transport, operation receipts, body limits and durable budgets | Owner and actor come from the session; strict fields, version checks and immutable exact retries. |
| Media | Existing private upload, processing, byte delivery, garbage and retention services | A listing-specific reference must recheck the current source before metadata and bytes; no unowned object reference or second upload provider. |
| Reports and moderation | Existing community reports, scoped decisions, author notices, appeal and protected journals | Register canonical listing targets and selected evidence with the current service before publication. Do not make a second report inbox. |
| Account lifecycle | Export, erasure, account restrictions and protected restoration | Include only the owner's listing data in export, retire their sources and references on erasure, and replay restrictive controls before restored data can be served. |

The identity/registry/relationship foundation tasks have actual completed receipts.
That baseline had no listing table, service, endpoint, report target or listing
media adapter. Those are engineering work within this feature, not evidence of
an external access blocker. Actual church delegation requires real appointments;
no production grants may be invented for acceptance.

## Listing record and validation

Keep one canonical listing with an immutable opaque ID, immutable logical owner,
creating actor, independent positive version and server timestamps. Personal
ownership names the adult account. Future church ownership names the church and
keeps the acting delegate separate. Do not transfer ownership through edit input.
Business/family/child scopes have no current authority service and remain rejected.

Published fields are deliberately entered for this listing:

- Intent: `FREE` or `SALE` in the first working version. Display Free and For sale.
  Free is the blueprint's Blessing intent. Unsupported intent payloads are rejected,
  including fields belonging only to Wanted, Services or Church Need.
- Title: trimmed plain text, 3 to 120 characters. Description: plain text, 1 to
  5,000 characters for publication. No embedded HTML or automatic remote link fetch.
- Item category and condition come from small server-owned enumerations. Initial
  categories cover household items, furniture, clothing, books, electronics,
  ordinary tools and hobby/sports equipment. No arbitrary category creation.
- Free has no price or currency. Sale requires an explicitly selected supported
  ISO currency and a positive integer amount in that currency's minor unit.
  Validate the typed decimal string exactly against the supported currency's
  fraction digits; do not round excess precision, use floating-point arithmetic
  for stored money, infer currency from a symbol or perform conversion. Bound the
  stored amount to 99,999,999 minor units. Price is display information only.
- The supported currency list must be explicit in the server contract and visible
  in the editor. Initial codes are USD, CAD, EUR, GBP, AUD, NZD, JPY, CHF, SEK, NOK,
  DKK, MXN, BRL, INR, ZAR and KWD, with their standard zero/two/three fraction
  digits. Tests cover JPY, USD and KWD. No provider payment availability is implied.
- Locality is an explicit coarse country/town choice from the existing location
  catalog. Never copy private profile location or store precise device coordinates,
  pickup address, phone, email, gate code or delivery instructions in a listing.
- Audience: `PUBLIC` or one currently eligible `CHURCH` scope. A church audience
  requires the owner's current approved connection and actual scoped reporting
  coverage. A personal listing shared to a church remains personally owned.
- Optional photos have bounded ordering and plain-text alternatives. Each reference
  is owned, processed and attached through the media service. No remote image URL,
  client storage key or another listing's attachment ID is accepted as authority.

Drafts may be incomplete but must be structurally valid, bounded and owned. A
draft does not become public because it has an image, price or public-audience
selection. Publishing validates the complete current record and every source.
Changing intent clears incompatible fields through one explicit validated save;
an old full-snapshot request cannot reintroduce fields from the previous intent.

## Initial permitted-item boundary

This first release is for ordinary physical items in the listed categories.
It excludes unlawful/stolen/counterfeit/recalled items; weapons or ammunition;
alcohol, tobacco, drugs and medicines; explicit adult material; live animals;
personal data, accounts or identity documents; and financial products, loans or
investments. Services, transport, housing, fundraising and employment are not
ordinary-item categories and remain unavailable until their own contracts.

The editor explains these limits and requires the publishing adult to confirm
that they are allowed to offer the item and have described its condition honestly.
An allowlisted category or account-email verification is not a safety guarantee.
Free-text evasion remains reportable; do not claim an automated category check
certifies legality, authenticity, ownership or seller trustworthiness.
Use the existing accurate-information and unlawful/abusive-content rules. No
platform payment, deposit, shipping insurance, escrow, refund or dispute outcome
is promised. Never collect card, banking, government-ID or investment information.

## Authorization matrix

All cells also require the current resource lifecycle and source policy. A link,
cached card, prior successful edit, profile role or client capability is insufficient.

| Actor | View | Create | Edit/status/archive |
| --- | --- | --- | --- |
| Eligible adult personal owner | Own draft and retained management record; public projection still reflects current restrictions | Personal draft; publication only after validation and reporting coverage | Own record with exact version and current eligibility; cannot erase a moderation restriction or change logical owner |
| Church organization delegate | Only currently permitted church-owned management data; personal records remain personal | Church identity only with a new explicit scoped publishing capability and its activation gate | Named manage/publish authority in that church, rechecked after revocation; organization keeps ownership when the delegate leaves |
| Ordinary approved church member | Eligible published public records and published church-audience records in their current approved church | Their own personal listing, including a permitted church audience | No changes to someone else's listing or the church's listing |
| Signed-in stranger | Only eligible published public projection | Their own personal listing if verified adult | No change to another owner; contact remains separately consented |
| Guest or unverified account | Eligible published public projection only, with a safe account-entry path | No listing write | No listing write; church-only metadata and bytes are unavailable |
| Bilaterally blocked account | No personal listing discovery/detail/media or new contact with the other account | Their own unrelated listing remains available | Cannot change the other's record or bypass through another module; retained case evidence keeps its separate review scope |
| Child, inactive, suspended or deletion-pending account | No Exchange personal/church account access through an otherwise invalid session; public guest content does not certify adult identity | No listing write or contact | No listing mutation, even with a copied adult form or stale operation key |
| Assigned reviewer | Only selected report evidence and the minimum current source under the original and current scopes | No seller identity or listing-management grant is created | Scoped moderation only; no price/content/owner edit, no arbitrary private browsing and no restoration of withdrawn author content |

Public viewing uses the existing active public-account eligibility. It reveals
only the intentionally published item, coarse area, status, price and ordinary
author label. Personal profiles keep their own account gate. A block is a signed-in
account boundary; public publication does not promise that signed-out strangers
cannot view the same intentionally public item.

Church-owned publishing/managing and church-scoped moderation need distinct named
capabilities: `PUBLISH_EXCHANGE_LISTINGS`, `MANAGE_EXCHANGE_LISTINGS` and
`MODERATE_EXCHANGE_LISTINGS`. Publishing permits creation and management of the
delegate's own church drafts; management permits current church listing changes,
publication and archive. Both always act as the church, retain the internal actor,
and follow the existing privileged-authentication policy. Moderation grants only
scoped case/source decisions. None is implicitly added to an existing position
template or account. Assignment/revocation uses the existing reviewed church
access owner and its sensitive-action confirmation, never the listing editor.
The current global community reviewer does not gain private church
evidence merely because a new resource type is registered. Missing real scoped
coverage keeps that publication unavailable with an honest explanation. Business
delegation remains unavailable because no business ownership/role service exists.

## State transitions, privacy and recovery

| Transition | Owner requirement and consequence |
| --- | --- |
| New to Draft | Session-owned creation and stable receipt. Incomplete fields remain private. |
| Draft to Active | Complete validation, current audience/owner, allowed item confirmation and operational report coverage. |
| Active to Reserved | Explicit owner status change. It is not a binding reservation, payment, named recipient or fulfillment proof. |
| Reserved to Active | Explicit owner reopening with current validation; no former contact/follow is restored. |
| Active/Reserved to Closed | Explicit owner closure. Ordinary discovery stops; legitimate history has only its authorized projection. |
| Closed to Active | Explicit versioned reopening with the same complete publication checks. |
| Draft/Active/Reserved/Closed to Archived | Remove ordinary discovery and public detail/media eligibility. Keep only owner management and justified canonical case/handoff evidence. |
| Archived to Draft | Owner reopens privately; publication is a separate deliberate action with fresh checks. |
| Any moderation restriction | Independent of owner status. Owner edits/duplicates/retries do not undo it. Review uses existing protected decision/reconsideration semantics. |
| Permanent owner erasure | Remove private drafts, personal references and unreported text/media; selected case evidence follows the existing retention owner. Retained shared history must not identify the erased account. |

Audience narrowing or withdrawal takes effect on direct HTML/RSC/API, discovery,
metadata, contact entry and every photo derivative. Prior public metadata/bytes
already viewed cannot be recalled; no private source enters a public CDN or
service-worker cache. Widening requires an explicit current owner action and full
validation. Lost church membership hides the church-bound listing until its owner
makes a permitted new choice; it must not silently become public.

Saved draft recovery reads only the current owner's canonical draft. Duplicate
creates a new private draft, no recipient/history/review state, no inherited
successful-operation receipt, and no automatic publication. Initially copy the
editable item fields; require deliberate photo selection instead of silently
duplicating provider storage or widening an old attachment's audience.

All commands use the existing serialized account/lifecycle gate and durable social
receipt protocol. Authorization and enablement are rechecked before replay where
the action requires current privilege. Exact retries never repeat publication,
status changes, uploads or notice intents. Changed bodies with the same key and
stale versions conflict, preserving typed fields. Unknown fields and forged owner,
organization, reviewer or asset identifiers are rejected rather than ignored.

## Contact, reports and follow-on contracts

An account/profile link is not consent to contact. The first listing detail can
lead to the existing owner profile and adult contact controls only under their
actual preferences, block and current eligibility rules. Do not expose direct
email/phone/address fields or silently submit an inquiry. Listing-specific inquiry,
quantity reservation, handoff and fulfillment require their canonical workflow
and race tests; a manual Reserved label does not complete those tasks.

Publication requires its listing report adapter, current reviewer coverage and
tested source restriction/retention/recovery behavior. Extend the existing report
target union and canonical lookup, scoped queue filter, selected evidence,
moderation commands, author decision/appeal, deletion and protected restore paths.
Listing source versions, original church review scope and current scope remain
bound. Do not copy gallery bytes, contact information or unrelated histories into
a second evidence store. Reports about an existing private conversation continue
to use its actual selected request/message, including preserved participant
evidence after a block. Future inquiry targets must add their own adapter before
that module activates. A report alone never grants permission to contact.

Wanted/Services/Church Need must keep intent-specific fields and exclusion rules;
they are not disguised Sale listings. Quantity commitments and fulfillment remain
different records, with cancellation, partial completion and race prevention.
No new implementation may turn a commitment into proof of payment or a public
virtue score. Real-world Exchange pilot observation remains a physical/participant
acceptance step and cannot be manufactured with fixture data.

## Feature completion checks

Complete the usable feature through its server, editor, detail/My listings,
optional-photo integration, status/draft controls, safety/report/block adapters,
account lifecycle, release notes and exact deployed behavior in one cycle.
The contract alone does not establish implementation or publication.

Use an isolated owner/delegate/member/stranger/blocked/child matrix through service,
HTTP, HTML/RSC and image bytes. Cover alternate account/lifecycle revocation,
audience narrowing, removed delegation, changed exact retries, publication failure
with retained text, duplicate/status races, currency precision, unsupported intents,
closed/archived sources, report scoping, selected evidence, owner erasure, protected
restore and interrupted upload cleanup. Test phone/large-text editor navigation
and a real browser reload after save. Run relevant existing regressions and the
full gate for the integrated security/media/lifecycle change.

Before release rehearse the additive migration on a protected production copy,
verify exact READY/canonical/serving identity, compare original data projections,
align the installed recovery registry and verify current live boundaries. Production
test listings, grants, contacts, messages and payments are not needed for those
read-only checks. Keep actual operator, provider and physical-device limits precise.
