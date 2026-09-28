# Business identity, claims and factual verification

September 28, 2026 UTC. E18-01 implementation contract, prepared for integration.
This defines the missing business authority and disclosure boundary. It does not
activate a directory, appoint a reviewer, accept a real claim, or certify a
business. Runtime work and actual operator acceptance remain separate.

## Reconciliation and scope

The inspected source checkpoint is `d6350faa3c665cb62835f9258d54b716a10021e2`.
The shared-foundation mapping prerequisite is complete. The focused E18 packet
requires self-description, ownership checks, optional credentials, public fields,
business delegation and disputed claims. No additional task-specific activation
gate is listed for writing this contract. Existing operational gates still apply.

| Existing owner | Reuse and missing boundary |
| --- | --- |
| `resource-contracts.ts` and [resource contract](RESOURCE_CONTRACT.md) | Typed addresses identify sources, never permission. There is no implemented business source. Do not mark one implemented before its services exist. |
| `church-claims.ts`, `church-management.ts`, `church-assignment-permissions.ts` | Reuse reviewed claim, current authority, explicit capability and revocation patterns. Church tables, proof, titles and grants cannot authorize a business. |
| `account-sessions.ts`, `social-boundary.ts`, `social-operations.ts`, `privileged-auth-policy.ts` | Reuse current account eligibility, owned session, request validation, operation receipts, locking and fresh privileged assurance. A future business purpose must be explicitly integrated. |
| `relationships.ts` and [adult contact](ADULT_CONTACT_CONTRACT.md) | Preserve canonical blocks and personal contact consent. A business listing or public contact link does not opt anyone into personal messaging. |
| [admin operations](ADMIN_OPERATIONS_CONTRACT.md) and existing reports/support | Native business review needs its own scoped source adapter. A worklist, support assignment or church reviewer role grants no business evidence access. |
| `account-export.ts`, `account-erasure.ts`, `retention-controls.ts` | Integrate new private records, grants and replay controls before writes. An older recovery runtime must fail closed rather than revive ownership or contact disclosure. |

Business authority is a distinct scope even for a sole proprietor, a church-owned
business, or the same person managing both organizations. A business has one
stable canonical identity and separate private claim/authority records. Profiles,
locations, staff display titles and external links do not become authority stores.
Do not reuse a church ID, convert a personal listing silently, or build a universal
organization permission hierarchy.

## What public labels mean

Each label states a bounded fact. Never show an undifferentiated "Verified",
"Trusted Christian business", "Church approved", quality score or theological
endorsement. The public business identity, checked relationship or credential
scope, method category, check date and current validity accompany a verification
label, including its accessible text. The exact person/account subject binding
stays private. Never copy a claimant's identity from proof into a badge, including
for an individually held credential. A separately supported public representative
identity would require its own explicit publication consent. Evidence documents
and private reviewer identity are not the explanation.

| Label or disclosure | Required meaning and limit |
| --- | --- |
| "Christian identity: self-described by the business" | An authorized representative explicitly chose this public description and confirmed authority to publish it. No platform assessment of belief, denomination, character or employee faith is implied. |
| "Business representative authority checked" | A designated reviewer checked this person's authority to manage this exact business using an accepted method. State whether the check established ownership or representation; do not label representation as ownership. This does not verify every profile statement. |
| "Business ownership checked" | Use only when the approved evidence method actually established the claimed ownership relationship, with check date and scope. Domain or email control alone cannot establish ownership. |
| "Business website control checked" | Optional narrower fact, only after its own accepted challenge and fresh receipt. It proves control of that website at the check time, not business ownership, licensing or quality. No automatic website challenge exists in this contract. |
| "Credential checked: [specific credential], [issuer], [scope]" | A reviewer verified that named credential against its accepted source, holder and jurisdiction/scope, with check date and expiry. It is not a general license to practice, a platform guarantee, or an endorsement. |
| "Listed by its representative; authority not checked" | Available only if a later accepted publication policy permits self-described listings. It must never resemble a checked badge. The initial implementation keeps unreviewed drafts private. |

Public details include "These checks do not assess beliefs or guarantee service
quality." Do not infer a Christian description from a person's profile, church
membership, a ministry offer, customers or a business name. Editing or withdrawing
the description requires the current authorized publisher and removes it from
new reads; no historical identity label is reused as present consent.

Verification is an assertion record, not a Boolean on a profile. Record its kind,
business and checked subject, reviewed claim version, policy/method versions,
checked fact, check time, expiry, decision and revocation/supersession. Only a
current approved assertion can produce its matching label. Unknown policy,
method, subject, expiry or authority fails closed. Derive expiry at read time;
a stalled cleanup job cannot keep a badge alive. A later check creates a new
assertion and cannot silently extend an old one by retry.

Changing the checked identity, owner relationship, credential, website or scope
invalidates the corresponding assertion until checked again. Unrelated edits,
such as opening hours, do not manufacture a new check. Explain which fields are
self-described separately from which fact was checked. Never attach a prior
business's badges to a renamed or merged identity.

## Claims, review and activation

A currently eligible adult account may prepare a private business draft and its
own claim. The server derives the claimant from the session. Claiming an existing
profile grants no access to its private fields, incumbent operators or evidence,
and no ability to edit or hide it. A duplicate hint uses only currently readable
public identity fields; it never discloses another person's pending claim.

Claim states are DRAFT, SUBMITTED, NEEDS_INFORMATION, APPROVED, REJECTED,
WITHDRAWN, EXPIRED and REVOKED. Transitions preserve the exact business, claimant,
submitted version, reviewed policy, evidence references and requested authority.
Submitted material is immutable for that review; amendments create a new version
that requires a fresh decision. An approved claim is not yet an active grant.
The claimant must explicitly accept the exact approved responsibilities under the
current policy before activation. Recheck reviewer authority, assertion validity,
account eligibility, business state and claim version in that transaction.

Approval requires a designated business-claim reviewer whose current grant covers
this source and action, fresh privileged assurance, and an accepted verification
method. A church reviewer, general support responder, display title or environment
flag cannot provide that grant. The reviewer cannot approve their own claim or a
business they manage. If no non-conflicted reviewer exists, preserve the private
draft and show review unavailable; do not invent an approval, evidence or reviewer.
This business ownership rule does not change the settled founder-only community
report reconsideration policy.

Reviewers record exactly which relationship and permissions were checked, the
decision reason, method/policy versions and expiry. Missing evidence or unresolved
identity conflict cannot approve. A public domain match, matching name, receipt of
an email, payment, church position or favorable review is insufficient by itself.
Methods, acceptable evidence, validity periods, retention periods and real reviewer
appointments require an explicit recorded operating policy before real intake.
This contract chooses no legal standard or evidence retention duration.

Creation and claim submission require bounded quotas and exact operation receipts.
Unique current claims and version/identity locks prevent two racing approvals from
creating competing control. An exact retry returns its receipt only after current
source/session checks and never renews evidence, reactivates a revoked grant or
charges a second budget. A changed body conflicts. A losing concurrent claimant
gets a safe state conflict, not the other claimant's identity or proof.

## Delegation and current authority

Business control begins with the activated reviewed claim, not draft creation.
Use explicit separately stored business grants with actor, one business, capability,
source authority, generation/version, consent, dates and revocation. Suggested
capability boundaries for implementation are profile editing, publication,
public contact management, access management and ownership transfer. These names
are design boundaries, not active enum values or permissions added by this file.
Keep review/evidence decisions separate from all ordinary publishing grants.

| Actor | Allowed boundary |
| --- | --- |
| Stranger or ordinary member | Read only the current public projection; no private contacts, claims, evidence or operator list. |
| Draft creator or pending claimant | Manage their own private submission; no control of an existing business. |
| Activated representative | Only the exact current business permissions approved and accepted. A representation check need not include ownership transfer or access management. |
| Accepted business delegate | Only explicit current capabilities for this business, linked to a still-valid source grant. A title or invitation alone grants nothing. |
| Designated claim/evidence reviewer | Only their currently scoped native review source and permitted decisions; no ordinary business editing by virtue of review access. |
| Support responder or community moderator | Existing authorized support/report content only. No implied ownership decision, claim evidence access or business grant. |

A delegator must hold both current access-management authority and every capability
being granted. No self-escalation, wildcard capability, future-capability preset,
delegation across businesses or grant through a revoked source. The recipient
accepts the exact scope; expiration, suspension or revocation wins immediately on
reads and writes. Regranting creates a new generation and never revives an old
invitation, assignment, cached authorization or pending operation.

Removing the sole controller must not silently transfer ownership to a delegate.
It makes management unavailable until a reviewed recovery/transfer. Transfer needs
explicit current authority, the recipient's consent and the required independent
identity check; an email edit cannot transfer control. Disputed transfers remain
frozen. Account erasure never appoints a successor or broadens another grant.
Revalidate business authority inside every mutation and before receipt replay.

Management grants remain dependent on the current approved authority assertion.
Its expiry, revocation, supersession or disputed identity disables those grants
and all derived delegation until an explicit fresh activation. An unrelated
optional credential expiring removes only its credential label; it does not
revoke otherwise valid business control. Never treat a displayed badge as the
grant or let badge removal leave stale dependent control active.

Future linked listings, events, service offers and opportunities keep their own
canonical personal or organization owner. A business delegate cannot relabel a
personal offer as the business's commitment, claim a church's resource or attach
another owner's item as their own. Association requires current authorization
from both source owners and consent where relevant; it transfers no ownership,
publishing permission or audience. Unavailable business adapters stay unavailable.

## Public fields and contact consent

The publisher reviews an explicit allowlisted public projection: display name,
self-description, services, categories, service area, optional public premises,
opening hours/time zone/holiday exceptions, deliberately selected external contacts
and current factual verification labels. Unknown fields are rejected. Public
preview must match the published projection. Optional empty values remain absent,
not copied from the owner's account, church record or private verification proof.

Home addresses, private owner email/phone, date of birth, account identifiers,
claimant/reviewer identities, evidence, private reasons and staff access records
stay outside public HTML, API/search payloads, metadata, counts and exports to
ordinary viewers. A business without public premises can show a coarse service
area without coordinates or address inference from proof, distance ordering or
map pins. An address becomes public only through the distinct authorized public
premises choice, never because verification used it.

Public contact choices require explicit confirmation of each destination and the
publisher's authority to disclose it. Verification contact and published contact
are separate fields with no fallback between them. Changing a public destination
requires another reviewed preview and consent. Removing it hides it from current
directory/detail/search reads and cached cards. Server projections recheck consent
and business availability; browser account/source changes conceal stale private
editor data before a fresh read. Unknown or invalid consent is private.

Links use a reviewed protocol/host parser, never arbitrary HTML, scripts or embedded
tracking. Do not fetch external contact destinations or provider metadata on render.
Explain when a deliberate action leaves the platform; safe external navigation
prevents opener access. There is no background outreach or automatic personal
message. Future business conversations need their own canonical consent and block
adapter; do not expose an owner's personal inbox as a business inbox.

## Disputes, moderation and evidence

Separate an ownership dispute from content moderation and from dissatisfaction
with a service. Reuse existing reports/support where their source and action are
authorized; add a reviewed business source adapter before accepting a business
report. Never smuggle evidence into a generic public report attachment or grant
moderators ownership-transfer powers. A submitted allegation alone neither proves
impersonation nor automatically awards another claimant control.

A designated reviewer may apply an audited protective hold within their specific
business authority. While held, stop ownership transfers and new grants; remove
affected active assertions from public projections. Publication/contact visibility
follows the explicit scoped decision, with a neutral public unavailable state when
hidden. Ordinary editors cannot clear holds or publish around them. Evidence and
decision history remain private under the accepted retention policy; public copy
must not expose reporter identity, private accusations or unreviewed findings.

Provide private safe reasons and a reconsideration path to the affected claimant,
preserving third-party confidentiality. Reconsideration never automatically
restores revoked grants, expired badges or removed contacts. A reviewer needs fresh
current authority for each action; conflicting versions fail. Do not promise an
independent appeal unless a distinct qualified reviewer actually exists.

Credential evidence is optional and separate from ownership. Ordinary users and
business delegates never receive raw evidence by being able to edit a profile.
Use existing protected storage patterns with source authorization on every read,
bounded uploads only after that capability is implemented, and no public signed
links, provider tokens or documents in logs/notifications/operation receipts.

## Lifecycle, recovery and implementation acceptance

Draft, published, closed and removed business states are distinct from claim,
verification and moderation states. Closing a business stops its public contact
actions and displays its truthful availability; it does not assert account
deletion. Reopening requires current publication authority and rechecks every
assertion and contact choice. Removal/erasure, expired rights and protective holds
win over references, search caches and pending publication.

Personal export contains the requester's permitted claim/submission history, not
other claimants, reporter identity, internal review notes or an organization's
private evidence merely because the requester was once a delegate. Erasure removes
personal data under the accepted policy, revokes dependent authority and separates
organizational continuity from personal attribution. Legal holds, if applicable,
need the existing authorized retention process; this contract creates none.

Before the first business write, add source-aware export, erasure, audit and opaque
recovery controls. Restore must not resurrect grants, sessions, removed contacts,
claims, badges or evidence access from old backups. Assert a compatible recovery
baseline, migrate populated copies, replay controls and test restore before
activation. Never use an older schema/client that guesses business ownership.

Implementation children should form a usable directory/profile/claim/contact/search
slice, with the necessary review, moderation and recovery boundaries included
where required. A shell or service-only check is not feature completion. Preserve
these required cases in the resulting test and handoff plan:

1. Pending, rejected and conflicting claimants cannot read or edit incumbent
   private data. Simultaneous approvals, exact retries and amended submissions
   retain one current authority decision without duplicated grants.
2. A church manager, business delegate for another business, stale grant, revoked
   then regranted delegate and self-involving reviewer cannot bypass authority.
   Test actual fresh MFA and expiry for newly privileged actions.
3. Every badge states its exact fact. Expired, revoked, unknown-policy and changed-
   subject assertions disappear from detail, list, search and attached cards
   without requiring a cleanup worker. No theological or quality claim appears.
4. A home-based business publishes service area with no home address, personal
   phone/email or proof fields in HTML, API responses, metadata, counts or exports.
   Removing contact consent and closing/hiding a business remove live actions.
5. Failed/uncertain saves preserve the original owner-scoped form and immutable
   retry body; account swaps conceal it. Version conflicts require a deliberate
   fresh decision. Mobile, keyboard, loading, empty, unavailable and retry states
   remain usable, with no unsolicited external provider request.
6. Disputes retain private evidence while the actual scoped decision controls
   public visibility. Ordinary publication cannot clear a hold. Reconsideration
   cannot revive revoked control or imply independent review that did not occur.
7. Search filters permission/visibility before paging/counting, uses bounded stable
   queries and source projections, and never lets a copied business card broaden
   the original resource's audience or ownership.
8. Exercise populated migration, new-client/old-client limits, account export and
   erasure, protected restore/replay, and the whole browser/API/data flow. Record
   measured queries and payloads rather than claiming unmeasured speed gains.

No schema, capability enum, runtime service, endpoint, provider configuration or
production grant changes in this contract-only handoff. A1 reviews integration.
Real methods/policy, reviewer appointments, provider operations and human acceptance
remain open until evidenced; fictional tests cannot satisfy them.
