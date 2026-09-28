# Campaign trust, external destinations and honest progress

September 28, 2026 UTC. E20-01 implementation contract, prepared for integration.
The first campaign feature describes a need and opens a reviewed external support
destination. It collects no money, processes no order or refund, holds no funds,
and issues no payment or tax receipt. This document activates no campaign,
reviewer, provider, production permission or policy.

## Reconciliation

Source checkpoint: `a920470d6db6f0d0227cf4066d1eecbff1cbac7b`.
The shared-foundation mapping prerequisite is complete. The focused E20 packet
requires organizer authority, beneficiary identity, reviewed destinations, goal
currency and source-labeled progress. Its initial version has manual reporting;
provider-confirmed synchronization is a separate gated expansion. Contract
definition has no additional task-specific activation gate.

| Existing owner | Required reuse and gap |
| --- | --- |
| `resource-contracts.ts` | `fundraisingCampaign` is reserved. A descriptor is not a service or authorization. Keep it unavailable until its reviewed source adapter exists. |
| `post-resource-attachments.ts` and [post resource contract](POST_RESOURCE_ATTACHMENTS.md) | Current cards resolve canonical sources. Campaign cards remain missing and must check the live campaign without copying private fields or widening audiences. |
| `portal.ts`, `church-permissions.ts`, `church-management.ts` | Reuse current scoped church authority, approved management, explicit delegation and revocation. Existing post, media, volunteer or assistance permissions do not authorize financial representations. |
| `account-sessions.ts`, `social-boundary.ts`, `social-operations.ts`, `privileged-auth-policy.ts` | Reuse owned sessions, current eligibility, same-origin/account checks, bounded input, transaction locks, versions, exact retries and fresh privileged assurance. |
| `exchange-input.ts`, `exchange-options.ts` and [listing contract](EXCHANGE_LISTING_CONTRACT.md) | Reuse exact currency precision and display conventions. Listing prices are not campaign receipts; do not reuse their amount cap without an explicit campaign bound. |
| Reports/support, [admin operations](ADMIN_OPERATIONS_CONTRACT.md), `retention-controls.ts` | A native campaign source needs scoped review, evidence privacy, holds, export/erasure and protected recovery before writes. No blanket operator authority follows from a new worklist row. |

There is no native campaign persistence, payment integration or verified-money
ledger at this checkpoint. The separate [business identity contract](BUSINESS_IDENTITY_CONTRACT.md)
does not implement business authority. Business/artist/venture campaign identities
remain unavailable until their own current ownership services are implemented and
accepted; do not impersonate them through a personal or church campaign.

## Organizer, beneficiary and recipient

Keep three roles explicit: the authorized campaign organizer, the intended
beneficiary, and the person or organization receiving funds at the external
destination. They may differ. Before opening support, show each public identity
and the stated relationship, destination host/provider, and that payment occurs
outside God's Churches. Unknown recipient or conflicting identity prevents an
actionable destination. Never imply funds go directly to a beneficiary when an
organizer or intermediary receives them first.

The initial owner is exactly one eligible adult personal account or one canonical
church with activated management and an explicitly reviewed campaign capability.
The server derives personal identity and revalidates church authority. Publishing
in a personal capacity cannot imply church sponsorship; following, membership,
employment, a title or a personal donation cannot appoint an organizer. New church
campaign capabilities require reviewed provisioning and explicit delegation;
schema changes grant none. Editing, publishing, changing destinations and managing
review are distinct actions with appropriate current authority and privileged
assurance. Review authority never confers ordinary campaign ownership.

Publishing another person's story, identity, images or needs requires recorded
authority and explicit consent for the exact public fields and audience. Consent
is purpose-bound and versioned, and is rechecked at publication and current read.
Private evidence cannot be copied into campaign copy. If safe required public
recipient/beneficiary disclosure cannot be supported with consent, keep the
campaign private; never invent a recipient identity or a vague reviewed badge.
Child, medical-document, emergency-response and investment-specific intake is not
introduced by this general adult contract. Owning policies and technical gates
must precede any supported specialized intake.

## Destination review and lifecycle

Use separate publication and review state. A draft stays private to its current
authorized editor. Submission freezes a versioned review snapshot of organizer,
beneficiary/recipient relationship and consent, purpose, audience, currency/goal,
destination and policy version. Amendments require a new review snapshot; the
reviewer cannot approve a moving form. A designated currently scoped reviewer,
with fresh assurance and no involvement as organizer/beneficiary/recipient, records
what was checked, method, time, validity and safe decision reason. If none exists,
review remains unavailable and the private draft is retained. This does not alter
the settled founder-only community report reconsideration policy.

An approved review binds to the exact campaign/snapshot and canonical external
destination. Approval is not publication, money verification, legal eligibility,
tax status, theological endorsement or a guarantee against fraud. Publication
requires a deliberate authorized command and all current checks. Policy, method,
validity periods, reviewer appointments and supported provider destinations need
recorded operating acceptance before real submission/review activation. An
environment flag, fixture grant or accepted URL parser is insufficient.

Changing the destination, receiving identity, beneficiary, organizer, purpose,
audience, goal currency or consent invalidates the affected approval. A destination
change disables the old support action immediately as well as the new one until
fresh review and publication; never silently leave a known superseded link active.
Store immutable prior versions and review provenance privately for authorized
investigation. Routine source-labeled progress corrections use their own audited
versions and do not manufacture destination approval. Review expiry, revoked
authority/consent, removal, protective hold or recovery quarantine wins on reads,
writes, attached cards and exact receipt replay.

Publication states distinguish private draft, published, paused, closed and
removed. Paused or closed campaigns have no active support action. An explanatory
page may remain only while its audience, consent and moderation policy permit;
otherwise return a generic unavailable projection. Reopening requires current
authority and renewed checks, not an old receipt. The organizer cannot clear a
reviewer hold. Closing or reaching a goal never proves receipt, delivery to the
beneficiary, completion of a promised purpose or final financial reconciliation.

## Safe external actions

Use an explicit supported provider/host and path grammar under the accepted policy.
HTTPS and an exact parsed destination are required. Reject credentials, nonstandard
ports, local/private hosts, arbitrary schemes, HTML, shorteners, redirect parameters
and token-bearing or unreviewed queries. Canonicalization must preserve destination
meaning; unknown forms fail closed. No user-provided embed, script, QR payment
payload or server-side URL fetch is accepted by this first feature.

Review establishes a bounded fact at a recorded time, not control of the external
site forever. At each deliberate support action, recheck current campaign state,
viewer access, consent, exact destination/version and review validity on the server.
Return the current destination only after those checks. Use safe external
navigation with no opener and no referrer; do not preload, automatically navigate,
embed or contact a provider during browsing. A late response after account/source
change, blur or cancellation cannot open a window. A failed recheck retains a
clear retry state with no cached fallback to an old payment link.

At the action, show "Continue on [provider/host]" and identify the recipient and
external terms/support responsibility. Do not claim God's Churches issues refunds,
protects payments, delivers a gift, receives donations or validates tax deductions.
Native payment readiness remains separate. A copied link can outlive this page;
do not promise the platform can revoke the provider's external destination.

## Goals, reported progress and currencies

Store supported ISO currency and exact integer minor units, parsed from a bounded
decimal string with that currency's precision. No floating-point rounding,
symbol-based currency inference or implicit conversion. The implementation must
specify and enforce a safe upper bound for goals, totals and arithmetic before
accepting input; validate identically on the server and database. A goal is positive.
Reported current totals may be zero. Unknown is a separate absent value, never
silently zero. Reject nonfinite, negative current totals and unsupported precision.

Each progress observation has campaign/version, source type, semantic basis,
currency, as-of date, server recording time and authorized reporter/provenance.
A received observation also binds the exact received-by identity and relationship
from its reviewed campaign snapshot. The reporting person is not necessarily the
recipient. Distinguish intermediary collection from receipt by the beneficiary.
Changing recipient or destination cannot reinterpret previous observations as
money received by a new person: retain the old provenance privately, remove it
from current received progress and require an explicit new scoped observation.
Dates cannot claim a future observation. Interpret all persisted timestamps in UTC
consistently across database session time zones; format only at the presentation
boundary. Corrections supersede an observation with a new audited version and can
decrease the reported total. An exact retry never increments a total or refreshes
its as-of date. A report is a snapshot, not an additive payment event.

| Quantity | Display and computation |
| --- | --- |
| Goal | Organizer's target in one explicit currency. It is not a commitment or money received. |
| Organizer-reported received total | "Organizer reports [public recipient] received [amount/currency], as of [date]. Not independently confirmed." Identify whether that recipient is the beneficiary or an intermediary. Require the reporter's explicit declared gross/net basis; if fees/refunds are unknown, say so. |
| Pledged total | Separate "Pledged, not received" amount with its own source/date. Never included in received progress. The first version records a reported aggregate, not a donor pledge or payment obligation. |
| In-kind goods, volunteered time and milestones | Separate noncash quantities or descriptive completion. No automatic monetary valuation or addition to cash totals. |
| Provider-confirmed amount | Unavailable in the initial manual feature. Later requires an authorized adapter with reconciled transaction statuses, currency and amount basis, source time and explicit coverage. A manually typed number, screenshot or URL cannot select this source type. |

The primary progress bar compares one eligible received observation with its
same-currency goal. Label the source, amount basis and as-of date in visible and
accessible text adjacent to it, not just in a tooltip. No report means "No amount
reported" and no fabricated percentage. A pledge can have a separate clearly
labeled display, never fill the received bar. A value above the goal keeps its
actual text and percentage while bounding the visual track; a cap must not hide
the original amount. Invalid or mixed-currency observations cannot be combined.

Example: a USD 1,000 goal with USD 200 organizer-reported received and USD 300
pledged shows 20% reported received progress, with USD 300 separately pledged.
Five donated chairs do not change either cash number. If a correction changes
received to USD 150, the next current projection is 15% with its new as-of date
and source label; it does not append another USD 150 to the prior total.

Keep manual and provider observations distinct and never sum overlapping coverage.
Before future provider sync, define exactly whether the figure covers gross
successful charges, net after fees/refunds/disputes, available provider balance,
or payout to a named recipient. None can be relabeled as beneficiary receipt
without evidence for that specific fact. Failed/stale sync preserves the last
authorized observation with its original source time and an explicit stale state,
or hides it if access/consent is no longer valid. It cannot update the timestamp
to imply a successful refresh. No sync, webhook, provider account or secret is
configured by this contract.

## Audience, privacy, reports and restoration

Campaign publication uses an explicit supported audience and owning-source policy.
Unknown/missing audience is private. A church identity never implies permission
to expose private member needs or proof. Search counts/paging filter current
audience, eligibility, blocks where applicable, consent, review and moderation
before returning results. Cards, sharing, reposts and feed adapters cannot broaden
access or make a disabled destination actionable. Do not copy raw destination,
beneficiary private data or progress evidence into attachment receipts.

Store only the reviewed public campaign projection for public display; claims,
evidence, account identifiers, private beneficiaries, reporter identities, internal
review reasons and destination change investigations are separate protected data.
The first version stores no donor identities, payment instruments or transactions.
Public encouragement is a later explicit opt-in, not proof of donation or consent
to publish someone else's name. Personal messages and ministry offers keep their
existing personal/organization owners, source permissions and explicit consent.

Campaign reports use the canonical report/block/support services after a reviewed
source adapter exists. A report is an allegation, not an automatic fraud finding.
Only the scoped reviewer may pause, resolve or change the public review state.
Preserve private evidence under accepted retention policy; do not publish accusations
or restore a support button through an ordinary edit. Reconsideration must describe
the actual reviewer and does not promise independence that is unavailable.

Integrate account export, erasure, audit and opaque replay controls before the first
campaign write. Export only the requester's permitted material, not other people's
proof or reviewer notes. Erasure revokes dependent personal authority without
inventing another owner. Populated migration and protected restore must show that
old backups cannot revive destinations, consent, grants, hidden campaigns or old
progress labeled as fresh. The recovery runtime must understand these controls;
an older client cannot guess that an unknown campaign is safe to publish.

## Required implementation and acceptance

Build the usable editor, private submission/review states, public campaign,
source-labeled progress, pause/close and report/recovery paths as one coherent
slice with the relevant E20 children. No provider feature is needed for manual
progress. Required policy/operator gates may keep real intake unavailable; expose
that truthfully instead of displaying a fake approved campaign or nonworking
support control. A contract or shell alone is not that runtime feature.

1. Exercise personal/church ownership, invalid or revoked delegation, current
   privileged assurance, uninvolved reviewer checks, private beneficiary consent,
   duplicate submission, changed review snapshots and concurrent publication.
2. Show USD 200 received plus USD 300 pledged against USD 1,000 as 20%, not 50%.
   Cover zero/unknown, correction downward, above-goal, precision, amount overflow,
   mixed currency, future dates and identical timestamps under UTC/non-UTC SQL
   sessions. Cover organizer, beneficiary and recipient all being different, and
   a recipient change that cannot reuse the former recipient's total. In-kind
   completion and opening a link never increment received money.
3. Race destination changes, pause, expiry, consent withdrawal, account changes
   and slow action responses. Neither old nor unreviewed links remain actionable.
   Verify no automatic provider calls, no arbitrary HTML and safe navigation.
4. Test stranger/member/church/blocked access, private evidence, current filtered
   counts, attachment/share projections, failed/uncertain owner-pinned forms and
   immutable retries. Reviewer scope changes conceal private queues immediately.
5. Verify narrow and keyboard layouts, readable and accessible source/date labels,
   loading/empty/error/unavailable states, full browser/API/data behavior, populated
   migration, export/erasure and protected recovery. Measure query/payload cost;
   do not add polling, scraping, new providers or background jobs unnecessarily.

No schema, service, migration, provider, native money flow or real reviewer changes
in this contract handoff. Integration, runtime acceptance, operating policy and
real provider/human evidence retain separate status.

## Primary-source checks

Checked September 28, 2026. These sources support the narrow disclosure and amount
distinctions; they do not approve this product's operators, policies or provider
access, and this contract makes no legal or tax eligibility determination.

- The [FTC crowdfunding guidance](https://consumer.ftc.gov/articles/donating-through-crowdfunding-and-fundraising-platforms)
  distinguishes the organizer receiving funds from the intended beneficiary and
  explains why recipient/intermediary and fee disclosures matter.
- The [Stripe balance transaction reference](https://docs.stripe.com/api/balance_transactions/object)
  distinguishes gross amount, fees, net balance effect, currency and pending versus
  available status. This is an example of why a future adapter must define its
  exact source semantics, not selection of Stripe or evidence of beneficiary receipt.
