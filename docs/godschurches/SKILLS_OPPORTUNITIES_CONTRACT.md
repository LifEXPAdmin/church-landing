# Skills evidence and private work applications

September 28, 2026 UTC. E19-01 definition, prepared for integration. This
contract distinguishes personal statements, confirmed service and credentials;
it does not launch recruitment, verify a qualification or accept an applicant.

## Reconciliation and canonical owners

Source checkpoint: `1adc92906a215051b41178e858d4b52b30258633`.
The volunteer contract and shared gap mapping prerequisites are complete. The
business identity contract has passed integration-owner review. Its runtime and
real verification intake remain separate prerequisites for business recruitment.
No additional task-specific activation gate applies to this definition.

| Existing owner | Preserve and extend only where missing |
| --- | --- |
| `profile-modules.ts`, `profiles.ts`, `profile-snapshot.ts`, `public-profile.ts` | Existing typed skills are bounded personal text: at most ten unique entries of at most sixty characters. Reuse the editor and preserving writers. Current member-profile projection is not consent for public indexing or a new opportunity directory. |
| `portal-policy.ts` | Use current account eligibility, including verified email, current adult acknowledgement and no suspension/deactivation. An acknowledgement is not independently verified age. |
| `volunteer-policy.ts`, `volunteer-commands.ts`, `volunteer-reads.ts` | Reuse current church opportunity, application, assignment and scoped coordinator decisions. Do not duplicate capacity or reinterpret an accepted application as completed service. |
| `post-participation.ts` and `calendar-reads.ts` | Existing canonical assignments and commitments remain authoritative. Applying for work does not reserve a place, create a calendar event or consume volunteer capacity. |
| [volunteer contract](VOLUNTEER_OPPORTUNITIES_CONTRACT.md) | Church delegation, adult participation, private statements, exact retries and no staff/screening grants remain binding. |
| [business identity](BUSINESS_IDENTITY_CONTRACT.md) | Business authority, private proof and narrowly explained credential assertions remain distinct from church authority and public descriptions. |
| `account-export.ts`, `account-erasure.ts`, `retention-controls.ts` | New evidence, applications and consent controls require export, erasure and protected recovery integration before writes. |

Existing skill text remains self-described. A migration cannot upgrade it to a
credential, broaden its audience or silently opt its owner into recruitment.
Per-section visibility, proficiency, availability, service areas, confirmed
history and business work applications are explicit deltas, not existing proof.

## Evidence and labels

Every displayed statement has a kind, subject, source, version and current
visibility. Keep the evidence kind visible in cards, detail, search, accessible
text and exports. Sorting or matching cannot promote the kind implicitly.

| Kind | Meaning and permitted presentation |
| --- | --- |
| Self-described skill | The person entered the statement. Label it "Self-described"; proficiency is their wording, not an assessment or verified ability. A typed license name remains self-described text. |
| Self-described experience | The person supplied a description and optional dates. It is not proof of attendance, employment, completed service, hours or an organization's endorsement. |
| Organization-confirmed service | A currently supported canonical completion source records a bounded service fact and its confirming organization. Display only that fact with source/date and the volunteer's explicit display consent. An assignment, acceptance, signup or RSVP is insufficient. |
| Checked credential | An accepted credential service has checked the exact subject, issuer, scope and validity against its approved method. Display the specific fact and expiry. No generic "Verified person", clearance, license-to-practice or quality guarantee. |
| Reference | A named author deliberately submitted the statement and its subject separately approved the exact version/audience for display. A reference is an attributed opinion, not a checked credential. |

The first skills extension does not invent a credential-verification service.
Unknown or unsupported evidence kinds fail closed. Self-written text cannot
choose a checked badge. Organization confirmation requires the canonical source
and its own current permission, not a user-supplied organization name or email.

Optional public display is separate from keeping a private receipt. New service
imports and references start private. Import only the selected confirmed fact,
not private ministry logistics, other participants, screening material or review
notes. Do not publish a private source link or identifier merely to show
provenance. The source owner must permit the proposed public attribution too;
if either source disclosure or subject consent is missing, keep it private.

Correcting/revoking the source removes the corresponding current confirmation.
Withdrawing display consent removes future public/member discovery immediately;
it does not erase an independently justified protected audit. Expiry is evaluated
at read time. A restored source, queued job or stale index cannot restore revoked
consent or represent superseded evidence as current. Real volunteer service-history
pilot acceptance remains open; this definition does not supply its findings.

## Skill visibility and explicit sharing

The person owns their skills, availability and service-area choices. New optional
sections default private; preserve existing skill visibility on upgrade without
enlarging it. Offer a preview of the exact fields and actual audience, including
the difference between signed-in members and the public web. Do not describe a
member preview as public. The source profile policy remains an additional limit.

Hide/delete takes effect in profile reads, directory/search queries, counts,
matching, queued notifications, cached pages and exports for other viewers.
Apply visibility before counts, pagination and ranking. Do not load hidden skills
to the browser and conceal them with CSS. Bounded skill filters use only fields
the requester may currently read and the subject opted to use for that purpose.

Availability is a deliberate coarse declaration, not a mirror of a private
calendar. Service area uses the owner's selected level of detail; do not expose
a home address, infer travel capability or compute an undisclosed location from
activity. A hidden location stays hidden even when it would explain a match.

An application may explicitly share selected private skill/experience statements
with its named reviewer scope. Preview this separate disclosure before submission;
profile visibility alone never authorizes it. Retain an immutable, versioned
submission snapshot under the application's privacy/retention policy. Later profile
edits do not silently rewrite the statement reviewers received. Explain this in
the form. A profile hide/delete removes discovery; applicant withdrawal and the
accepted erasure/retention controls govern the separately submitted record.
Source confirmation validity is always current, even for a retained snapshot.

## Adult opportunities and clear terms

Only a currently authorized organization publishes an organizational opportunity.
Church publication and review need the appropriate current church duties and
membership/session checks. Business publication and review need explicit grants
for that exact business and action under the accepted business source. A personal
profile, title, business description, payment, church position or accepted
application supplies neither grant. Author and recruiting organization must be
clear. Do not relabel a personal offer as an organizational commitment.

The first work-opportunity version is for currently eligible adults. Recheck
eligibility at submit and consequential review transitions. Do not collect dates
of birth, identity documents or child information to create a new age-verification
flow. A role involving children or sensitive screening is not activated by this
contract; the [family launch decision](FAMILY_LAUNCH_DECISION.md) still applies.
Eligibility is not a claim of employment eligibility, credentials or clearance.

An opportunity has explicit PAID or VOLUNTEER terms, duties, organization,
coarse location/remote expectations, schedule with source time zone, requirements,
application deadline and open/closed state. Paid terms distinguish an exact amount
or range, currency and rate period from "Pay not disclosed". Missing pay is not
zero, and missing type is not volunteer. Expense reimbursement, if offered, is
described separately from pay. No salary, employment or legal classification is
inferred by the platform. This contract sets no jurisdictional pay-disclosure rule.
Real publication policy must decide whether undisclosed paid terms are permitted;
until accepted, do not publish that unresolved variant.

Requirements are organizer statements. No automated claim of qualification,
background clearance, suitability, hiring guarantee or religious assessment.
Paid and volunteer filters use the explicit typed field. Financial processing,
contracts, payroll and native hiring agreements are outside this version.

Deadline checks use canonical UTC instants while displaying the source zone.
Invalid/missing required times fail validation; expiry closes new submissions
without waiting for a cleanup job. Material duties, pay/type, organization or
reviewer-scope changes require a new reviewed opportunity version. Existing
applications retain their submitted terms; a changed organization cannot inherit
them. Require explicit applicant consent to any renewed disclosure or acceptance
under changed material terms, rather than silently switching an old submission.

## Private applications and review

Use a fixed minimal application: server-derived applicant, canonical opportunity
version, explicitly selected skill statements, optional bounded plain-text note
and deliberate submission. Do not request private sign-in email, medical history,
identity papers, background-check documents, arbitrary questionnaires or uploaded
resumes in this first version. Collect additional information only through a
separately accepted, necessary source contract. Never scrape the whole profile.

Only the applicant and current explicitly authorized reviewers for that exact
organization/opportunity may read the application. Public opportunity viewers,
organization directory editors, church leaders without the reviewing duty,
unrelated members and generic support staff gain no access. An explicitly assigned
new reviewer within the disclosed organization scope must satisfy current source
policy; an external recipient requires fresh applicant consent and a supported
disclosure flow. Do not send application bodies through personal messaging.

Current account/session, source visibility, blocks and action-specific scope apply
on each read, write, export, queue refresh and delayed delivery. Current bound
privileged assurance is required for privileged reviewer/organization operations.
Personal applicant operations retain ordinary eligibility and owned-session checks;
unrelated duties must not add a privileged gate to submission, status or withdrawal.
No public applicant roster, identifying count, rejected-status badge or searchable
application statement. Minimal applicant-owned status and withdrawal remain
available after loss of source visibility, without disclosing current logistics
or other people. Revoking a reviewer immediately conceals retained browser views.

New work applications use SUBMITTED, IN_REVIEW, DECLINED, WITHDRAWN and ACCEPTED
with an append-only transition history and expected version. Acceptance means
only that the organizer accepted this application under its stated terms; it is
not completed work, a staff role, group membership, church duty or verified skill.
Church volunteer applications continue using their existing canonical lifecycle
and assignment owner. Do not add a second work application to the same volunteer
slot or mirror its reservation. A new work acceptance has no calendar/capacity
effect unless a separately implemented canonical assignment flow is explicit.

One current application per applicant and canonical opportunity prevents duplicate
submissions. Stable logical request keys bind exact payload and version. Exact
retries reconcile the same result only after current permission checks; changed
payloads conflict. Reapplication is a deliberate new attempt after a terminal
state, retaining prior decisions. Withdrawal never becomes a negative public
reference, and resubmission never reactivates an old acceptance.

Applicant-facing reasons are bounded and separate from internal decision audit.
Private review notes are not a shared cross-organization reputation database.
Use safe conflict and unknown-outcome states, retaining entered non-sensitive
values and reconciling the exact operation before offering another submission.
Notifications carry only permitted minimal status and recheck current recipient
and delivery consent; applying does not opt someone into email, push or marketing.

## Recovery and implementation acceptance

New schema and compatible preserving writers must precede new data. Integrate
export/erasure, consent withdrawal, encrypted backup and protected restore before
release. Establish accepted retention periods and accountable reviewer policy
before real application intake; this contract invents neither. A restored older
database cannot revive revoked reviewers, withdrawn applications, hidden skills,
expired assertions or withdrawn disclosure consent. Old writers must preserve
new fields or reject their use safely. Unsupported recovery fails closed.

The coherent implementation must finish editor/preview, opportunity discovery and
detail, applicant submission/withdrawal and scoped review with actual persistence.
Reuse completed profile and volunteer behavior; no mock saved state or new empty
shell counts as completion. Required evidence includes:

- Self-described skill, typed license name, accepted assignment, confirmed service
  and checked credential remain distinct through UI, API, search and export.
- Owner/member/public preview matches the actual projection; hide/delete and block
  changes remove discovery without exposing private matching reasons or counts.
- Applicant, unrelated member, former reviewer, wrong church/business, ineligible
  adult and wrong session cases through services, HTTP and retained browser views.
- Exact retry/unknown outcome creates one application; stale terms, changed scope,
  closed/deadline-expired source and concurrent withdrawal/review fail safely.
- Submitted snapshots preserve deliberate disclosure while current confirmation
  expiry/revocation, withdrawal, erasure and source concealment remain enforceable.
- Export/restore preserves unrelated existing profile fields, grants and volunteer
  capacity, and never promotes evidence or revives consent. Measure bounded query
  and payload cost, avoiding one private source query per discovery card.
- Built narrow/enlarged layouts, keyboard/accessible labels, real empty/error/retry
  states and all integration-owner migration, recovery and live release gates.

Definition checks do not establish those runtime results. References, confirmed
service imports and explainable matching retain their separate task acceptance;
the business source and real policy/pilot gates remain open.
