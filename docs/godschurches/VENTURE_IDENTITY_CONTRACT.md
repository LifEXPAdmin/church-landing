# Foundry venture identity and bounded help

September 28, 2026 UTC. E23-01 implementation contract, prepared for integration.
Foundry lets adults describe a venture and request practical help. A profile is
not a verified business, an investment offering, a contract of employment, proof
of intellectual-property ownership or a promise of sales. This document adds no
runtime feature and approves no exploratory matching or financial capability.

## Scope and existing owners

Inspected source: `c3e8722240106e8b1dc3e68679113fa8fb5ebecf`.
The shared-foundation mapping prerequisite is complete. The focused E23 packet
requires owner/team roles, truthful stages, public information, help requests,
intellectual-property visibility and an explicit funding boundary. Its September
26 amendment places builder-to-marketer and first-customer help within the
existing collaborator-request scope, still exploratory until the owning contract
is accepted. It authorizes neither a separate social network nor a sales promise.

| Existing owner | Reuse without broadening authority |
| --- | --- |
| `account-sessions.ts`, `social-boundary.ts`, `social-operations.ts` | Current eligible adult account/session, same-origin and expected-account checks, bounded input, serialized permissions, versions and exact retry receipts. |
| `profiles.ts`, `relationships.ts` | Current readable personal identity, explicit profile disclosure and canonical bilateral blocks. A profile name or follow is not venture control. |
| [adult contact contract](ADULT_CONTACT_CONTRACT.md) | Consent, request audience, acceptance, withdrawal, private conversations and blocked contact remain canonical. Do not create a second inbox or automatic introductions. |
| [volunteer contract](VOLUNTEER_OPPORTUNITIES_CONTRACT.md) | Existing church opportunities, applications and assignments retain their church owner and approval semantics. A venture help request cannot manufacture a church assignment or completed-service record. |
| [business identity](BUSINESS_IDENTITY_CONTRACT.md) and [campaign trust](CAMPAIGN_TRUST_CONTRACT.md) | These prepared contracts do not implement either source. Future business associations and support links require their own accepted runtime adapters and current source authority. |
| `resource-contracts.ts`, current report/support and retention owners | Venture identity has no implemented source adapter. Register only actual services; integrate private reporting, export/erasure and protected replay before writes. |

There is no venture service, persisted founder/team authority or application route
at this checkpoint. Marketing pages and a free-text personal profile are not a
substitute. Implement the canonical venture owner once; do not create a fake
church, group, business, post or calendar event to carry venture authority.

## Identity, team and permissions

A venture is one canonical source with a stable ID and exactly one accountable
eligible adult controller in the initial version. "Founder" is an explicitly
self-described public role, not a verified legal status. The controller owns the
platform profile, not automatically the venture's company, assets or ideas. A
church/business association is a separate authorized link and grants nothing.
Do not support an organization controller until its own exact authority adapter
exists; never copy a church grant into a venture grant.

Creating a private draft grants its creator only that draft's control. Current
control permits explicit bounded editorial invitations. Separate draft editing,
publishing, help-request management and access administration. A named team
member, collaborator, mentor or supporter has no permission merely by being
listed. The controller delegates only explicit capabilities they currently hold;
editors cannot self-promote, transfer control, invite others or publish unless
those exact actions were granted and accepted.

An invitation binds one venture, inviter authority generation, eligible recipient,
explicit capabilities, policy, expiry and expected version. No capability becomes
active before the recipient's deliberate acceptance. Revocation/expiry/account
ineligibility invalidates it; later regranting cannot revive old invitations or
pending operations. Every read/write rechecks current source, capability and
generation, including exact receipt replay. Use current privileged assurance for
newly privileged grant/transfer actions under the existing account owner.

Publishing a person's team identity or role requires separate consent for that
exact public field/version. Permission to edit a private draft is not consent to
be displayed. A person may remove their public attribution without granting
another person access; removal does not erase someone else's independent source.
The public role label does not certify expertise, employment, licensing or service.

Transfer is a separate versioned action requiring the current controller, the
recipient's consent and current eligibility. It transfers profile administration
only and says so before confirmation. It cannot convey equity or intellectual
property. Account deletion, suspension or loss of the sole controller never
auto-promotes an editor; freeze management and use an explicitly authorized
recovery path. No founder-support exception silently grants control.

## Stages and public claims

Use the explicit initial stage vocabulary IDEA, VALIDATING, PROTOTYPE,
PRELAUNCH, OPERATING and PAUSED. These are founder-reported states, not verified
success levels or an automatic progression. Expose this same vocabulary in the
interface and server and reject unknown values. Every stage/date and metric
remains attributed to its reporting source. Editing stage does not certify
revenue, customers, product readiness, legal registration or regulatory approval.

An idea or mockup must be labeled as such where the product is shown. A prototype
video, rendering or demo link cannot appear as proof a finished product ships.
Planned, in-progress and reported-complete milestones are distinct; an update
does not create verified achievement, money received or a service certificate.
Corrections preserve attribution/history and can reverse an earlier report.

The public projection is deliberately selected: venture name, problem, proposed
solution, current stage, limited industry/help categories, current public founder
and team identities with consent, safe demo links, public progress and approved
help requests. Show an explicit public preview before first publication and
material audience widening. An unknown/missing audience remains private. Search,
counts, cards, shares and cached browser views use the same current source policy.

Public claims cannot offer shares, revenue participation, debt/investment returns,
guaranteed income/sales, a financial entitlement or future pay dependent on success
through this first feature. There are no equity allocation fields, investor
subscriptions, funds, escrow, checkout or payment records. A "help" button, external
demo or campaign link cannot provide an alternate entry point to those features.
Reject unsupported structured requests at the server; private report/moderation
and scoped review handle deceptive free text without claiming perfect detection.

## Drafts and intellectual-property disclosure

Private draft data is visible only to the current controller and explicitly
authorized current editors. It is absent from public endpoints, static rendering,
search/counts, metadata, sitemaps, share previews, notification bodies and ordinary
profile exports. An editor invite reveals only the minimum invitation identity
and duties; it does not expose the pitch before acceptance. Membership in a
church, group or professional network never unlocks a draft.

Explain before publication that public text and demos may be seen and copied by
others. The platform does not promise confidentiality, patent protection, an NDA,
exclusive ownership or assignment of contributed work. Do not collect trade
secrets, identity/financial documents, arbitrary files or private source code as
required pitch fields. A restricted draft is an access boundary, not a claim of
legal protection. Unsupported uploads remain unavailable.

Publish only the explicit allowlisted projection, not the entire draft object.
Private planning notes, contact details, collaborator messages, application answers
and internal review data never become public when the venture is published.
Private and public descriptions must not share an accidental fallback. Withdrawal
conceals current platform projections; do not promise recall of external copies.
New consent or reopening cannot restore a prior removed field automatically.

Demo URLs use safe HTTPS parsing with explicit allowed forms, no credentials,
scripts, embeds or background provider fetches. Label them as external and open
only after a deliberate current-source check with no opener/referrer. An external
URL is not evidence of a working product or authority over that domain. Support,
commerce and sensitive-upload links require their canonical adapter rather than
being accepted as generic demos to bypass their gates.

## Bounded help and consented introductions

Help requests state the exact venture, requesting actor, problem/offer, desired
contribution, expected scope/time, current status, compensation disclosure and
source/version. Supported initial purposes are bounded feedback, skills help,
equipment/resource help and clearly described adult collaboration. Requirements
are expectations, not verified credentials. Do not reuse child screening or
church volunteer approval for ordinary venture work.

Voluntary and paid work are distinct. A voluntary request explicitly says no pay
is offered, with any permitted expense terms separately stated. Paid work must
use an accepted owning opportunity/terms service before it becomes actionable;
a free-text promise does not implement that service. If compensation is unknown,
mark the request unavailable for commitment pending clarification. No commission,
equity, revenue share, speculative future pay, hiring or purchase commitment is
created by accepting an introduction. Specialized employment/compensation policy
and money-flow approvals remain separate from this contract.

Discovery or interest alone does not introduce people or share their private
contacts. "Offer help" may open the existing adult request flow only through a
current venture/source adapter, recipient preference and explicit participant
consent. It cannot automatically send a message, add a member, apply to another
resource, follow a venture or disclose a third person's identity. The person
offering help acts personally unless a separate current organization adapter
authorizes that exact commitment. No church resources or business promise can be
offered merely because the person manages this venture.

An introduction involving a third person needs that person's prior consent for
the exact recipient, purpose and disclosed fields. There is no address-book import,
contact scraping, mass outreach or auto-matching pipeline in this first contract.
Unaccepted/withdrawn introductions disclose no private contact and cannot be
resurrected by unblocking, regranting or replay. Reuse canonical bilateral blocks
and current account eligibility; blocking prevents new contact while retained
participant history follows its existing source's contract.

Request status distinguishes OPEN, PAUSED, CLOSED and WITHDRAWN, with versioned
changes and a deliberate current-authority transition. Interest, an accepted
conversation, a volunteer assignment and confirmed work are different events.
Material changes to scope/compensation invalidate pending commitment decisions;
never silently apply new terms to an earlier acceptance. Closing a request does
not delete a participant's independently retained conversation or claim completion.

The exploratory builder-to-marketer/first-customer amendment fits these fields
and consent boundaries. Its useful-outcome evidence can describe feedback,
an agreed introduction or founder-reported progress without publishing private
customer identities, copying sales records or promising a sale. Writing this
contract does not approve a separate matching feature, automatic introductions
or launch that exploratory workflow. Keep that explicit acceptance gate open.

## Related sources, reports and lifecycle

Link canonical equipment listings, church opportunities, business identities,
storefront products or reviewed campaigns only after their implemented source
adapter permits the relationship. Recheck both owners and viewer access; do not
copy the other source's audience, capacity, price, verification badge or payment
destination. A personal offer stays personal. Removed, closed, paused or hidden
sources stop supplying actions immediately. An external support link never creates
an investment contract or internal payment record.

Venture lifecycle distinguishes private draft, published, archived and removed.
Archive removes active discovery/help actions; removed or inaccessible sources
return a generic unavailable state. A moderation hold is independent of the
editor's publication state and cannot be cleared by an ordinary edit. Reopening
requires current authority and rechecks consent, source links and review status.

Add a native venture report adapter to existing report/support services before
public launch. Fraud or impersonation allegations are not automatic findings.
Review access is source/action scoped; general support assignment grants no
private draft access. Public unavailable copy omits private allegations, reporter
identity and internal reasons. Existing reconsideration policy stays truthful
about who can review it and whether independent review actually exists.

Account export contains only the requester's currently permitted personal data,
not the whole team's private draft, other participants' answers or reviewer notes.
Erasure removes personal attribution and revokes dependent authority under accepted
retention rules without transferring control or deleting another participant's
canonical messages. Protected restoration must reapply removed consent, revoked
grants, erased fields and source holds; unknown venture controls fail closed.
Integrate the compatible recovery client, populated migration, audit and erasure
before the first venture write. No new retention duration is chosen here.

## Required implementation acceptance

Implement the usable draft/editor, discovery/profile, team invitation, bounded
help and report/recovery behavior with its required child tasks. Optional gated
sources stay unavailable. A mockup, contract, source-only test or copied profile
does not complete this runtime feature. Include at least:

1. Pending/revoked/expired editor invitations, no self-promotion, wrong-venture
   access, controller loss, exact retries and concurrent transfer/publish changes.
   Display-role consent stays independent from accepted editorial permission.
2. Private pitch fields absent from every public projection, count, export and
   preview; publication uses exactly the displayed allowlist. Account changes,
   source revocation and network recovery conceal stale private editor data while
   preserving appropriate owner-bound unsent inputs and immutable retry bodies.
3. Idea/mockup and founder-reported milestones remain clearly labeled. Unsupported
   equity/revenue/return terms, payment URLs disguised as demos and private-contact
   disclosure cannot become an accepted platform workflow.
4. Explicit recipient and third-party introduction consent, canonical blocks,
   personal versus organization offers, material term changes, withdrawal, and
   no automatic message, grant, sale, service record or contact exposure.
5. Revalidate related sources on read/action; no widened audience or copied money
   state. Exercise protected export/erasure, populated migration and restore/replay,
   including revoked then renewed authority that must not revive old consent.
6. Verify full browser/API/data flow on narrow and keyboard layouts, clear
   loading/empty/unavailable/error states, recoverable version conflicts, bounded
   permission-filtered queries and no unsolicited provider requests.

This handoff changes documentation only. Integration review, complete runtime
verification and real policy/operator/provider acceptance remain separate. The
exploratory discovery amendment and investment/payment gates are not activated.
