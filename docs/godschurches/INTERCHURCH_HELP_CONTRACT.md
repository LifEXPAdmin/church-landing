# Interchurch requests, offers and collaboration

Contract definition, 26 September 2026 UTC, inspected against `ebe95fb`.
This defines the missing first version. It does not establish implemented
interchurch requests, new church grants, production migration or live acceptance.
The [Church Needs contract](EXCHANGE_NEEDS_CONTRACT.md),
[volunteer contract](VOLUNTEER_OPPORTUNITIES_CONTRACT.md) and current source remain
the owners of existing quantities, assignments, permissions and private consent.
The volunteer contract's original implementation-status introduction is historical;
the current application already has applications and independent shifts.

## Existing owners and the missing delta

Keep `ExchangeListing` as the organization-owned publication and audience owner.
An interchurch request extends an explicitly marked `CHURCH_NEED` listing with
one typed help-request record; do not create a second writable title, church,
audience, moderation state or publication lifecycle. The marker must distinguish
this protocol from an item need before any action is offered. A listing cannot
simultaneously own a quantity need and an interchurch request. Its single-listing
inquiry entry stays disabled. Enforce these shapes in both commands and storage.

Current item-need validation requires an item category and requested-items text
and forbids price/service fields. Add an explicit help-purpose branch in input,
publication and storage validation while preserving ordinary needs. Give help
category, duties, compensation and proposed time exactly one canonical owner.
Do not insert dummy item categories or separately editable duplicate duties and
deadlines to satisfy the old parser. Any existing listing date projection must
be derived from the typed time owner.

The extension owns requested duties, category, compensation, proposed time,
named coordinator consent, and its versioned outcome. Offers and their bilateral
agreements are separate bounded records. Existing `ExchangeNeedContribution`
records identify a personal contributor, with no responding-church authority;
they cannot be relabeled as organization offers. `ExchangeInquiry` deliberately
excludes structured needs and reserves a whole listing, so it cannot become a
multi-responder collaboration store.

| Existing source                                                                         | Reuse boundary                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exchange-policy.ts`, `exchange-listings.ts`                                            | Current organization owner, approved connection, privileged authentication, publication, audience, moderation and source withdrawal.                                                                              |
| `church-permissions.ts`, `church-assignment-permissions.ts`                             | Effective current grants, role dependencies, explicit assignment, no self-grant, revocation and audit. A position title grants nothing.                                                                           |
| `exchange-need-policy.ts`, `exchange-handoff-policy.ts`                                 | Named adult consent and current connection/grant/appointment epochs. Extract a shared capability-aware resolver if needed; do not invent a listing for the responding church to call the old manager-only helper. |
| `adult-contact-policy.ts`                                                               | Current adult eligibility, new-contact audience, bilateral blocks and purpose-limited access.                                                                                                                     |
| Calendar, `PostVolunteerSlot`, `PostVolunteerSignup` and volunteer services             | One canonical event/shift and capacity pool, individual consent, approval, cancellation and truthful completion.                                                                                                  |
| Existing private boundaries, operation receipts, Activity/outbox and retention controls | Account pinning, exact retries, notification consent, export/erasure and restrictive recovery.                                                                                                                    |

## Authority is separate from personal willingness

Request publication keeps the existing Exchange permissions. The misleadingly
named `PUBLISH_EXCHANGE_LISTINGS` capability currently permits creating a church
draft; actual publication requires `MANAGE_EXCHANGE_LISTINGS`. Preserve that
implemented distinction and current privileged-session checks.

Organization offers require a new explicit church capability,
`COMMIT_INTERCHURCH_HELP`, through the existing reviewed grant/position machinery.
Current Exchange management is permission to publish/manage listings, not an
existing permission to pledge church resources. Do not silently broaden it or
automatically grant the new capability to managers, founders, coordinators or
existing position holders. The first real appointment needs the established
authorized provisioning route and its reviewed evidence. Migration adds no grant.
The existing platform operator `MANAGE_CHURCH_ACCESS` route may provision the
first supported capability after reviewed authorization. This platform permission
is distinct from a church-level grant with the same name. Ordinary church
assignment/delegation requires both current church access-management authority
and the capability being delegated, and prohibits self-grants. Do not give an
ordinary church manager a new bootstrap exception.

| Action                                | Current authority and required deliberate choice                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create a request draft                | Approved connection and current Exchange publisher or manager for the owning church.                                                                                                                                                 |
| Publish or manage a published request | Current owning-church Exchange manager, current privileged authentication and all existing publication/source checks.                                                                                                                |
| Receive and review private offers     | The exact eligible adult who explicitly accepted request-coordinator responsibility and still has current owning-church management authority.                                                                                        |
| Make a personal offer                 | Current eligible adult offering only their own participation or resources, with source/contact permission. No represented church is inferred.                                                                                        |
| Make or confirm an organization offer | Current `COMMIT_INTERCHURCH_HELP` for the selected responding church, current approved connection and privileged authentication, plus that adult's explicit acceptance of responder responsibility and the displayed resource scope. |
| Grant the new capability              | Existing platform provisioning owner for reviewed initial setup; ordinary church delegation retains both required grants, explicit choice and audit. No ordinary self-appointment path.                                              |
| Commit a named person's participation | That person's own existing volunteer/application consent and the required current coordinator acceptance, where the canonical service supports it. Organization agreement cannot supply it.                                          |

A publisher who created a church request draft retains the existing right to edit
that own draft while their grant is current; a current manager may also edit it.
This does not authorize publication or management of a published request.

`APPOINT_COORDINATORS` records a church contact appointment and explicitly adds
no software permission. Membership, a role title, directory status, public church
listing, moderation, calendar access or accepted volunteering also grants no
organization commitment power. A grant for church A cannot represent church B.
Existing church status is not independent proof of qualifications, asset ownership,
screening or real-world appointment.

An organization offer binds the immutable responding church, named consenting
adult, current capability/connection/dependency epoch and consent version. It
describes only resources the delegate explicitly confirms they may offer. A
proposed team size is coordination intent, never a list of signed-up people.
No offer writes another person's signup, RSVP, employment/position, church grant,
guardian relationship or screening record. Changing represented church requires
a fresh offer; it cannot transfer private history to another organization.

## Request fields and truthful public projections

The first categories are preaching, worship, AV, children's support, equipment,
transport and other permitted ministry help. A request must show its purpose,
expected duties/resources, requesting church, approximate service area, proposed
date/window and source time zone, and voluntary or paid terms. Use existing
bounded plain-text, place, supported currency and exact minor-unit amount helpers.
Reject excess input without shortening it. No files or arbitrary questionnaires
are needed for offers in this first version.

Voluntary means no service fee; disclose any proposed expense reimbursement
separately. Paid requests state a fixed amount and supported currency per described
task or supported rate unit. An offer may propose different terms privately, but
both sides must acknowledge the exact final amount, unit and reimbursement
conditions. Do not present negotiable or incomplete amounts as an agreed payment.
This coordinates help; it creates no checkout, deposit, escrow, tax receipt or
qualification guarantee. Existing prohibited-service and transport exclusions
continue to apply.

The current responsible adult deliberately chooses the coordinator display
information that may appear with the request. Use permitted display name/role
and the owning church, not sign-in email, private phone/address or private account
identifiers. Losing the named coordinator's authority stops new offers until a
new adult explicitly accepts; it does not expose old offers to other managers.

The existing `PUBLIC` and owning-`CHURCH` audiences retain their meaning.
An owning-church-only request is not secretly shared with other churches because
it is labeled interchurch. Cross-church discovery in the first version needs a
deliberately public request. Private offers remain private even when the request
is public. Partner-specific publication waits for its separate audience contract.

Public cards, HTML/RSC, metadata, search and aggregates omit responder identities,
offer counts tied to people, private terms, selected participants and contact
values. Approved organization cards describe current recorded church status
without presenting it as an independent trust or screening certification.

## Offers, selection and agreement

Identify the acting person from the current session. A personal offer and an
organization offer have explicit, immutable kinds. Each contains one bounded
capability/resource proposal, proposed dates, compensation and conditions, and
the request/terms version reviewed. At most one current offer per request/person/
representation target is allowed; terminal history stays distinct from a fresh
deliberate attempt. Organization offers also enforce their immutable church and
authority/consent epoch on every operation.

The requester coordinator and that offer's named responder are the private pair.
Other responders, ordinary managers and newly appointed delegates gain no private
offer or agreement history. A request can select multiple offers through separate
bilateral agreements without revealing those pairs to one another. A shared team
conversation or roster would need its own deliberate participant consent.

| State/action                      | Authorized result                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft to published request        | Current manager publishes valid current fields and a self-accepted named coordinator. No capacity or private consent is created.                                                            |
| Submit offer                      | Eligible personal adult or explicitly authorized organization delegate submits current terms. No agreement, reservation or fulfillment is implied.                                          |
| Decline or withdraw pending offer | Exact coordinator declines, or named responder withdraws. Preserve a minimal versioned receipt; do not silently resubmit.                                                                   |
| Select offer                      | Exact coordinator proposes an agreement with a frozen terms version and their explicit acknowledgment. Responder acknowledgment is still pending.                                           |
| Confirm agreement                 | Named responder reviews and acknowledges that same current terms version, with both sides' current authority and consent rechecked atomically. Only then show Confirmed.                    |
| Material amendment                | Authorized participant proposes new terms. Invalidate affected acknowledgments, mark Needs review and require both sides to acknowledge the new exact version.                              |
| Cancel confirmed agreement        | Either current participant cancels remaining uncompleted help once. Preserve truthful completed work and any outstanding equipment return.                                                  |
| Record completion                 | Current named requester coordinator explicitly records what was completed against the current agreed scope. A responder's report is evidence for review, not automatic fulfillment.         |
| Close request                     | Current manager may stop new offers or cancel with a reason, but Fulfilled requires the current named coordinator's validated completion receipt. Closure alone never completes agreements. |
| Reopen or reapply                 | Fresh deliberate current-version action. Old offers, acknowledgments, contact consent and canceled commitments remain terminal.                                                             |

The first completion rule requires the current named coordinator to attest that
the requested scope was delivered, every selected required agreement has its
explicit completion receipt, and no associated physical return remains outstanding.
Otherwise show partly fulfilled, canceled, or help delivered with a return still
due, as appropriate. The server validates this rule before recording Fulfilled;
a general manager's closure label cannot substitute for the coordinator's receipt.
Unmet scope and corrections require a bounded explanation and versioned history.

Concurrent selection/confirmation, changed terms, closure and cancellation must
share the existing permission transaction and expected-version checks. Exact
logical retries use the same body/key and return a safe receipt only after current
authority checks. Different bodies with the same key conflict. Unknown network
outcome is not a new offer or agreement. Atomically pin the displayed request,
offer and agreement-terms versions, both current authority/consent epochs and
contact version during selection, confirmation and amendments. A material change
to any member of this tuple invalidates both prior acknowledgments.

Scope, quantity, compensation, dates/zone, represented church, named responsible
adult, contact recipients and equipment return conditions are material. Where a
canonical event or shift is linked, its relevant version/change/cancellation is
also material. A material change cannot silently move an agreed commitment or
leave old contact disclosure active. A new agreement version needs renewed
acknowledgment; cancellation stops new acceptance and any reminder owned by an
actually implemented linked service. First-version agreement-change notices do
not imply a new standalone calendar-reminder service.

## Contacts, revocation and recovery

Offer submission uses the current contact-request audience for the named
coordinator. Selection accepts only this scoped interaction; it does not create
a general conversation or change global preferences. Missing consent fails
closed. Phone/email sharing is optional and purpose-specific; the website's
private interaction remains usable without forcing public phone disclosure.

Store separately chosen contact values only for the exact confirmed pair and
terms/contact version. Never copy authentication email, a private profile field
or another person's address automatically. Either participant can withdraw their
contact sharing without losing the ability to cancel. Contact-only withdrawal
immediately removes disclosure without claiming the underlying help or return
obligation was completed or canceled. Changed recipients or
replacement appointments require fresh consent and never inherit the old values.

Recheck current source, both adult accounts, audience, blocks, named responsibility,
organization capability and connection/dependency epochs before direct reads,
writes, retained UI, export, receipt replay and delivery. Revocation or recovery
quarantine immediately conceals private logistics and prevents new confirmation.
Regained membership, reissued grants, unblocking and restored backups never revive
old consent. A source-unavailable owner retains a minimal withdrawal/cancellation
path without learning current source details or another participant's data.
A revoked adult may withdraw their own responsibility/contact consent, but may
not edit an organization's commitment scope or declare fulfillment. Replacing a
responsible adult requires a fresh scoped agreement and the remaining participant's
consent; no private history is transferred. Keep a minimal owner-only outstanding
obligation/return-report path after source loss. Reporting a return is not authority
to attest another party's receipt or to change previously completed work.

Export only the actor's authored offer, their own chosen contact settings and
currently permitted agreement receipt. Account erasure removes private values,
ends unfinished personal responsibility and preserves only necessary anonymous
operational history under the existing retention/hold policy. Do not erase another
participant's legitimate receipt or claim an outstanding loan was returned.
Contact/operational copies expire or clear through the existing retention owner;
formal dispute evidence is selected deliberately through existing private reports.

Use opaque monotonic recovery controls for request/offer/terms/consent versions
and terminal actions. Quarantine older restored records and preserve tombstones
where needed. A restore or compatible older writer must not resurrect a withdrawn
offer, canceled commitment, private contact, revoked delegation or superseded
acknowledgment. Publication/notification stays unavailable during uncertainty.

## Canonical time, people and equipment

A first-version request may own a proposed standalone help window using the
existing local-time/IANA-zone parser. Reject invalid or ambiguous local times and
an end before its start. This proposal is not a calendar event, RSVP or volunteer
reservation. Calendar/shift association is a separately identified expansion;
once present, it references the original occurrence/slot and rechecks its current
versions. Do not create a mirrored personal event or a second pool of places.

An organization offer to arrange volunteers cannot sign them up. Later linked
participation requires each adult's current application/approval through the
canonical owner. Existing application-required mode, capacity races, cancellation
and completion protections apply through every entry point.

Equipment offers must distinguish providing equipment with its operator, giving
an item and a physical loan. A loan requires a named consenting custodian, return
deadline and agreed return responsibility before confirmation. In the first
version that custodian must be a consenting member of the supported private pair,
or belong to an already supported canonical loan owner with its own consent/access
contract. Unsupported third-party custody stays unavailable. Its outstanding
return is tracked separately from delivery/completion, with reasoned versioned
corrections. Reuse a canonical Need/Exchange loan receipt when one already owns
that handoff; never copy its return state into a second writable record. A
standalone collaboration loan needs an actual persisted return owner before that
mode can be offered. Unsupported modes must be unavailable in both UI and API.
The later equipment catalog owns availability windows and collision prevention;
this first version must not advertise inventory-backed reservation guarantees.

## Child-related boundaries

The [family launch decision](FAMILY_LAUNCH_DECISION.md) remains unchanged. Adult
participation and an organization grant establish no child access or screening
clearance. A children's-support category can describe a prospective need, with
unsupported child-facing fulfillment explicitly unavailable. It cannot accept offer submissions, selection
or confirmation for child-facing duties until the owning reviewed policy and enforcement gate
exist. Describing the same duty under Other cannot bypass this restriction.
Require an explicit duty classification on both request and offer and enforce its
policy gate independently of the category label. Missing or unsupported
classification fails closed for acceptance; free-text wording is not evidence of
screening or a reliable substitute for the gate.

Permitted adult logistical work must explicitly exclude child records, child
contact, supervision and unsupported safeguarding duties. Do not collect child
names/locations, health information, identity/background-check files, training
evidence or arbitrary screening forms. Real appointments, reviewed safeguarding
policy and fulfillment pilots need their own actual evidence; fictional tests
cannot clear those gates.

## Required implementation and acceptance

The next interface and persistence tasks must deliver a coherent usable first
version through private offers and explicit outcomes. An attractive empty screen,
client-only state or an enabled button backed by no service does not satisfy it.
This definition alone does not complete its implementation children or parent.

- Finish current-field editor/preview, categories/date/area discovery, request
  detail, private incoming/outgoing offers and bilateral agreement/outcome views.
  Include loading, empty, retry, stale-version, unavailable and unsaved-navigation
  states, current help/copy and account-switch concealment.
- Prove member/title/manager-only denial of organization offers, cross-church
  grant denial, archived/revoked dependency denial and exact-retry denial after
  revocation. Show that explicit authorized offers still cannot assign another
  adult or create any church, family or screening privilege.
- Prove separate private pairs for two selected offers, guessed-ID and HTML/RSC
  denial, optional contact sharing, named coordinator replacement, restored
  membership and blocked/unblocked behavior without historical consent revival.
- Exercise concurrent selection, bilateral acknowledgment of one exact version,
  material amendments, cancellation and truthful partial/completed/return states.
  Date passage, accepted offers and a listing Closed label cannot prove fulfillment.
  Include unauthorized Fulfilled closure, request/offer edits racing confirmation,
  contact withdrawal during agreement and coordinator revocation with a return due.
- Integrate typed current-source Activity/outbox notices with separate dated
  optional external consent. No automatic phone/email opt-in from offering help.
  Keep previews generic, dispatch bounded, retries deduplicated and cancellation,
  revocation, source changes and quiet hours authoritative. Reuse the existing
  queue and recovery dispatch; no new scheduler or provider is required.
- Bound page sizes and text, use stable cursors and batched authority reads, and
  measure relevant queries/payload/client cost. Public discovery must not eagerly
  load offers, contact values or rosters. Add no dependency for existing primitives.
- Extend report evidence, export/erasure, holds, cleanup and protected restore.
  Check the marker on publication and published edits, duplicate/reopen, quantity-need
  configuration, inquiry enabling, withdrawal and discovery/detail projection.
  Each generic path must use the typed owner or reject the operation; missing or
  unknown extension shapes fail closed. Never copy old private offers on duplicate.
  An older build that bypasses extension invariants is not a compatible rollback.
  Also rehearse actual older-client reads/writes of active and revoked direct/role
  grants containing the new `ChurchCapability` value, including unfiltered reads.
  Enum readability is a separate risk from additive columns. Establish a compatible
  rollback build or compatibility deployment before provisioning any real new grant.
- Before release, verify actual service/HTTP and built-browser flows, responsive
  and enlarged-text layouts, required full regression, additive migration/data
  preservation and compatible recovery. The release owner then records READY,
  canonical-domain/serving identity, live behavior and task readback separately
  from real provider, physical-device, appointment and pilot acceptance.

The definition was checked against the focused packet, current permission and
source owners, and independent authority/privacy reviews. No new runtime test,
grant, production write or deployment is claimed by this document. Real initial
provisioning of `COMMIT_INTERCHURCH_HELP` remains a reviewed owner action, not a
side effect of adopting the contract. Equipment catalogs, partner lists, reusable
requests and recurring collaboration retain their separate later scope.
