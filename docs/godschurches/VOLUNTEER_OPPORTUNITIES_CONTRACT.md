# Volunteer opportunities, applications and shift approval

Contract definition, 21 September 2026. This document specifies the missing
ministry-application and independent-shift work against the current integrated
application. It does not claim that new opportunity, application or shift
interfaces, persistence or release acceptance already exist.

## Reuse and current evidence

The [participation report](POST_PARTICIPATION_REPORT.md),
[calendar report](CALENDAR_REPORT.md) and
[church-needs contract](EXCHANGE_NEEDS_CONTRACT.md) describe accepted owners.
The actual source provides:

| Existing owner | Behavior to preserve |
| --- | --- |
| `PostVolunteerSlot` and `PostVolunteerSignup` in `prisma/schema.prisma` | One capacity pool per event-post role, one signup per role/member, versioned cancellation, retained completion receipts and a stable role-creation request key. |
| `post-participation.ts` | Current source access, adult eligibility, organizer duty, final-place transaction, safe cancellation after loss of source access, capacity reduction protection and role-name protection after participation. |
| `post-participation-reads.ts` | Member's own signup, separately authorized roster, bounded pagination and concealed inaccessible source details. |
| `calendar-reads.ts` | My commitments projects the existing signup and original occurrence; an RSVP is a separate response. Private overlap hints do not disclose the other commitment. |
| `post-access.ts` and `church-permissions.ts` | Current approved connections, effective `MANAGE_CHURCH_VOLUNTEERS` duty, source audience and privileged-session availability. |
| `church-assignment-permissions.ts` | Staff position and privilege assignment require their own explicit authorization, reviewed choices, confirmation and audit. A title grants nothing. |

Today a slot has role, capacity, closed state and version. Its signup is ACTIVE
or CANCELED. It has no ministry application, review decision, independent shift
time, screening credential or automatic staff assignment. Every current timed
commitment inherits its post's event occurrence. The new application contract
must not reinterpret ACTIVE as merely pending review.

## Opportunity kinds and authority

An opportunity describes a church's purpose, duties, bounded requirements,
coordinator and either an ongoing ministry role or one or more timed shifts.
The first working version is for currently eligible adults. Existing public,
church, group and source-access rules determine who can discover the opportunity;
reading a card does not authorize applying, coordinating or publishing it.

Publishing church-owned recruitment needs explicit current authority through
the appropriate church source owner. Application review and capacity decisions
need the current volunteer-organizer duty for that church, including its
membership/dependency and privileged-session checks. Being the author of an
ordinary personal post, an applicant, a church member or a named contact is not
coordinator authority. Church content publication remains separately authorized.

Reuse accepted post/event volunteer roles when an opportunity refers to one.
An opportunity references those canonical slot IDs and cannot copy their
capacity, signup or completion state into another independently writable pool.
A genuinely untimed ministry role needs its own accepted opportunity assignment
owner; do not manufacture an event or reserve an event slot to represent it.
Until that owner is implemented, do not present an untimed application as saved.

Apply and accept create only a volunteer application or assignment. They never
write a church connection, position, role grant, platform privilege, guardian
link, child record or screening credential. Even an opportunity named Pastor,
Coordinator or Children's Ministry confers none of those authorities. Any later
staff appointment remains a separate deliberate use of the existing church
assignment service with its own authorized actor and reviewed privileges.

## Minimum application and disclosure

Use a small fixed input contract: opportunity/shift reference, current member,
deliberate confirmation and optional short plain-text statement. Identify the
member from the current session, never a submitted applicant ID. Requirements
and duties are descriptive expectations, not platform certification.

Do not collect birth dates, identity documents, medical details, background-check
files, child names/locations or arbitrary screening questionnaires. The existing
[family launch decision](FAMILY_LAUNCH_DECISION.md) and
[family threat model](FAMILY_ACCESS_THREAT_MODEL.md) remain binding. Sensitive
screening, training evidence, child-related activation and verified credentials
need their separately approved source policy and enforcement before collection
or a claim of clearance. A coordinator's acceptance is not such clearance.

Application answers, review history and applicant identity are visible only to
the applicant and a currently authorized coordinator within that opportunity's
church scope. No public applicant list, application count tied to a person,
contact disclosure or default profile service history. Use current member
identity projections; a private sign-in email is not coordinator contact data.
General role requirements and aggregate available places may be shown only to
viewers allowed to read the source.

Fetch scoped pages with a stable cursor and a bounded limit. Recheck membership,
source access, account eligibility, blocks and coordinator duty before every
read, write, retained-page refresh, export and queued notification. An old role
grant or an earlier accepted application is insufficient evidence of access now.
On loss of source access, conceal its current logistics and other people while
preserving an applicant-owned, minimal withdrawal path with no source disclosure.

## Explicit application lifecycle

New approval-required opportunities start closed to instant reservation. An
eligible adult deliberately submits an application; submission reserves no place
and grants no access. Keep one current application per member and opportunity/
shift target, plus a dated audit of submitted, withdrawn, declined and accepted
transitions. Do not overwrite an earlier decision by silently resubmitting.

| Action | Authorized actor and atomic result |
| --- | --- |
| Apply | Current eligible applicant with source permission. Persist SUBMITTED and its version; no signup, role or grant. |
| Withdraw pending application | Its current signed-in applicant. Persist WITHDRAWN once; preserve history and disclose no new source information after revocation. |
| Decline | Current scoped coordinator against the displayed application version. Persist DECLINED with a bounded applicant-facing explanation. Do not erase the application or imply misconduct. |
| Accept | Current scoped coordinator, still-eligible applicant, available source/shift and current versions. Atomically persist ACCEPTED and exactly one canonical assignment/reservation. |
| Cancel accepted assignment | Applicant withdrawal or explicit authorized coordinator cancellation updates the same assignment and releases only its uncompleted capacity once. Preserve the application decision and cancellation history. |
| Reapply | A new deliberate attempt against the current terminal version, preserving previous events. It does not reinstate a canceled assignment, old authority or an earlier acceptance. |

An explicit instant-signup mode can reuse existing signup behavior for eligible
ordinary event roles. Existing roles keep that behavior through migration. New
approval mode must be enforced by every direct and indirect signup path, including
posts and linked needs; hiding the old button is insufficient. A pending
application can never be completed by calling the old instant-signup endpoint.
Do not change mode or reinterpret requirements underneath existing applications
or assignments without a defined versioned transition; use a new opportunity
when the duty materially changes.

Application acceptance does not mark an RSVP Going, subscribe a calendar, join a
group, share a calendar, publish a profile record or send an external message.
Cancellation is distinct from correction of already completed help. Preserve the
existing need-receipt rule requiring an authorized reasoned correction before a
completed reservation can be withdrawn. Later service-history consent remains
with its own feature and must not be inferred from application consent.

## Capacity, concurrency and recovery

Acceptance, ordinary signup, cancellation, role edits and linked needs must use
one serialized capacity decision per canonical slot. Count retained completed
places consistently with the existing reservation owner. A pending/declined/
withdrawn application consumes zero places. Never create a second assignment
counter that can disagree with `PostVolunteerSignup` for the same role.

Validate source, actor, applicant, slot mode, open state and expected versions in
the transaction that writes the decision and reservation. A concurrent instant
signup and coordinator acceptance for one final place can have only one winner.
A failed capacity check leaves the application unaccepted with no partial audit,
calendar assignment or notification. Lowering capacity below retained commitments
must fail; canceled and completed states retain their true meaning.

Use the current same-origin, current-account/session, bounded input, rate-limit,
private no-store and snapshot-revocation boundaries. Require a stable logical
request key and payload identity for new operations. An exact retry returns the
same accepted result only after current permission and revocation checks; a
different payload with the same key or stale version returns a conflict. Unknown
transport outcome remains unconfirmed until its exact operation is reconciled.
Forms retain non-sensitive entered values and expose safe conflict/retry choices.

Include new records in the existing export, deletion/retention, encrypted backup
and protected restore contracts before release. Restoring older data must not
resurrect a withdrawn application, canceled assignment, revoked organizer duty,+obsolete source visibility or old notification consent. Retain only the minimal
protected revocation/audit evidence required by accepted retention policy. A
rollback must retain compatible readers and preserving writers for new records;
do not replay old acceptance or broaden permissions to recover availability.

## Independent shift time and calendar projection

Keep a stable shift/slot reference with its own version and effective start/end.
Use existing calendar input and IANA-zone validation. Reject missing endpoints,
invalid instants and an end that is not after the start. Display the source
event's zone explicitly; device or regional display preferences never rewrite
stored shift time. The initial timed extension keeps shifts within the parent
occurrence. Preparation/cleanup outside it needs an explicit later contract.

Old slots preserve their inherited schedule on upgrade. Use an explicit inherited
mode or equivalent compatible null fields; their current event-edit behavior
continues until the organizer deliberately chooses independent shift times.
New independent times remain fixed when the parent event's time changes. If an
event edit invalidates their bounds, show the conflict and require a deliberate
coordinator resolution instead of silently moving the volunteer's commitment.
Parent event cancellation prevents new acceptance and shows existing assignments
as canceled/unavailable without deleting their decision history.

Two thirty-minute shifts inside one two-hour occurrence must keep different
start/end times and distinct capacity while referring to the same original event.
My commitments projects the accepted canonical assignment and effective shift
time. Editing a shift updates that same projection, not a copied personal event
or the parent occurrence. Withdrawal/cancellation removes the active projection
while preserving a truthful private receipt. A pending or declined application
never creates a busy block. Overlap hints reveal only that the current applicant
has another commitment; they do not reveal its source or another person's diary.

Do not add a polling loop, eager roster reads per card, mirrored personal-calendar
events or unrestricted recurrence. Bound date ranges and page sizes, batch shared
source/permission reads and measure query/payload changes in the implementation.
Reuse the existing Activity/fanout/outbox and current category/consent resolvers
for required changes; never infer recipient email/push consent from applying.
External delivery stays subject to the existing provider and consent gates.

## Required implementation acceptance

The implementation task must finish its usable editor, applicant and coordinator
journeys with the service, canonical storage and integration they require. An
empty screen or client-only saved state cannot satisfy them. Keep these evidence
groups distinct from this definition-only acceptance:

- Applicant, unrelated member, guest, revoked coordinator and ineligible-account
  cases through actual HTTP and retained browser views. No staff/grant/family
  records change from apply, accept, decline, withdrawal or exact retry.
- One winner for the last place across acceptance and instant signup; duplicate
  requests and cancellation cannot overfill, double-release or grant authority.
- Private statements never appear in public HTML/RSC, roster-free cards, exports
  to unrelated users, snapshots or unauthorized notification projections.
- Two independent shifts inside one event, legacy inherited behavior, zone/DST
  validation, event/shift edits, cancellation and one stable calendar reference.
- Restored withdrawals/revocations, account-switch concealment, unknown outcomes,
  direct old endpoint attempts and a compatible rollback that preserves records.
- Meaningful service and built-browser checks, narrow and enlarged text layouts,
  current copy/accessibility rules, measured runtime cost and the existing full
  release, migration/recovery, exact serving-identity and live acceptance gates.

The current source audit establishes the reuse map and the distinction between
volunteer assignment and church authority. No new runtime test or live feature
is claimed here. Existing participation tests contain final-place races, retries,
cancellation, role-edit preservation, source revocation and roster denial;
their historical pass receipts do not verify the future application extension.

## Next implementation boundary

First implement the canonical application and timed-assignment delta together
with its working interface and migration compatibility. Keep untimed-role
persistence explicit if included; never substitute a fake event. Preserve the
separate role-template/screening, voluntary service-history and optional
availability expansions until their own criteria are ready. This contract
authorizes no child launch, real participant recruitment, external screening,
provider purchase or production test application.
