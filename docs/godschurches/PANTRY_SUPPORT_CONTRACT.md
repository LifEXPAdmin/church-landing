# Church pantry and support hub

Implementation contract, 18 September 2026 UTC. Verified live in 2026.09.18.3.
See [the exact release and acceptance receipt](PANTRY_SUPPORT_IMPLEMENTATION.md).
Required interfaces, stock, replenishment and operational integrations ship together.
Consented partner referral remains disabled under its separate activation gate.

## Owners and authority

One canonical church-owned hub holds public hours, access guidance, categories
and eligibility instructions. It is not a personal listing or the platform's
private support helpdesk. An approved church connection and the explicit scoped
`MANAGE_CHURCH_ASSISTANCE` capability are required to configure it. Current
privileged authentication, role assignment, dependency and revocation rules apply.
The capability is selected through existing reviewed claims/delegation. No member,
Exchange manager, role title, preset or migration automatically receives it.
Delegators must themselves hold every capability they grant.

The hub's named adult coordinator explicitly accepts responsibility for private
intake. Consent binds the current connection, church, grant and assignment epochs.
Only that current coordinator sees the request queue and coordinator notes.
Another eligible manager can edit public configuration but cannot inherit private
requests by replacing the coordinator. Replacement, revocation, blocking,
withdrawn church visibility and protected recovery remove access immediately.
Regaining a role never revives old consent. New intake requires an available
private-report reviewer under the current reporting service.

Public hubs require the church to be community listed. A church-only hub remains
limited to current approved connections. Public projections contain no requester
names, request counts, private notes, pickup rosters or beneficiary history.
Bound every list and nested collection; keep private responses uncached.

## Minimal requests and consent

An eligible adult requests assistance for themselves. The form shows the actual
coordinator and exactly what will be shared. Collect selected supply categories,
whole quantities, an optional short practical note and an optional user-chosen
pickup contact. Never copy the authentication email or require income, government
identifiers, household identities, health records or proof documents. Explain that
public eligibility instructions are the operator's terms, not platform vetting.
Do not offer regulated services, payments or child intake through this feature.

A requester can reload their own submission. Other recipients and ordinary
members cannot fetch it, including by a guessed ID, cursor, export or retained
page. Coordinator-only notes are excluded from the requester's ordinary view and
export. Current account, hub audience, named consent and bilateral blocks apply
to every private read and command, including exact retries and delivery. A source
that becomes unavailable exposes only a minimal own receipt and withdrawal/clear
action, never stale counterpart details or renewed consent.

## Pickup capacity and outcomes

The hub owns bounded, dated pickup sessions with an exact time zone, start/end,
capacity and participant-only directions. These are multi-place assistance
appointments, not volunteer places or single-item Exchange holds. Reuse existing
transaction locks, optimistic versions, time parsing and immutable retry receipts.

An authorized coordinator offers a session for one request. The requester then
confirms the exact offered version or cancels. Concurrent assignment cannot exceed
capacity. Cancellation releases that request's place once; repeating a request,
assignment, confirmation or withdrawal never duplicates places. Collected or missed
appointments still count toward that session's capacity. Do not shrink capacity
below occupied places or change a booked session's time/directions silently.
Replacing a session requires an explicit new offer and fresh confirmation.

Show requested, offered, confirmed, collected, canceled, declined, missed and
access-ended states truthfully. Collection cannot be recorded before the pickup
starts; missed cannot be recorded before it ends. Outcomes and correction reasons
are private and versioned. A request or offered pickup does not guarantee supplies.
No actual appointment or fulfillment is claimed from test fixtures.

## Stock and replenishment

Support at most twelve categories with unit names and either an exact whole count,
approximate availability or unavailable status. Show the recorded time and that
availability can change. Exact inventory is not a reservation. Coordinator
adjustments require a reason and retain actor/version provenance. Requests do not
silently change stock; confirmed physical changes use the explicit stock editor.

Replenishment uses a reviewed new church-owned Church Need through the existing
Exchange editor, permissions, publication and consent flow. Carry only a category's
public label/unit and a deliberately reviewed target. Never copy request text,
recipient identities, notes or histories. Link only a current, readable Need owned
by that church. Closing or revoking the Need removes the corresponding public link.

## Lifecycle and integrations

Use the existing session/CSRF/rate boundary, current permission lock and immutable
SocialOperation receipt. Retained forms conceal private content while account or
foreground access is being rechecked. Keep unsent input during recoverable errors,
offer explicit retry and protect deliberate unsaved navigation.

Assignment and outcome updates use the existing Activity/outbox infrastructure.
They contain a generic private-assistance notice and recheck current pair access.
Phone delivery requires a separate dated assistance opt-in; existing saved choices
remain intact. Do not introduce a new queue, dependency or background poller.

The requester may clear their ended request's own text/contact; the coordinator
may clear restricted notes. Erasure removes personal content and attribution,
ends active capacity and disables the erased coordinator's intake. Preserve only
opaque appointment/stock audit facts needed to avoid reviving capacity or retries.
Selected report evidence stays with the existing restricted report retention and
hold owner; neither reporters nor ordinary moderators gain the whole queue.
No new automatic indefinite personal archive or unreviewed retention promise.

Opaque protected journal controls advance with each hub/request change. Restoring
older state quarantines the affected hub and private requests before access or
delivery, rather than resurrecting canceled reservations, cleared text or old
consent. Integrate export, erasure, report evidence, block/role/source revocation,
maintenance, restore and the installed migration registry in this feature cycle.

Partner referrals remain disabled until the named partner identity and selected
field consent wording are reviewed. Existing contacts, church membership and a
request for food never authorize disclosure to another organization.

## Acceptance and release

Test actual independent roles, delegation limits, public/private projections,
cross-recipient IDs/cursors, capacity races, exact lost-response retries, stale
versions, confirmation and rescheduling, outcomes, stock provenance, replenishment
privacy, block/membership/role changes, current notification consent, erasure and
protected restore. Include actual schema constraints and a fresh encrypted
production-copy upgrade with original column comparisons.

Complete public hub, own history, coordinator views, loading/empty/error/retry,
Settings, church/Exchange navigation, Help, privacy/terms and release guidance.
Inspect phone widths, enlarged text and dark appearance. Measure bounded reads
and relevant shipped client cost. Run meaningful focused and existing full
regression gates. Require exact READY, independent canonical assignment, serving
identity, live public and available signed-in behavior, migration/recovery,
runtime/health/consumer and data-write receipts before private task closure.
Actual operator appointments and physical-device delivery remain separate evidence.
