# Mentor consent and private collaboration

September 28, 2026 UTC. E24-01 definition prepared for integration. Listing as a
mentor means a person has opted to offer bounded help. It does not establish a
professional qualification, background clearance or platform endorsement.

## Reconciliation and canonical owners

Reviewed starting source: `9ee18f162b2cf55bc56c847e6d7e476a5a019990`.
The skills evidence, venture identity and shared gap-mapping prerequisites are
accepted. No additional activation gate applies to this definition. Their runtime
features and real policy decisions remain separate. The current schema and source
registry contain no mentor profile, venture or collaboration workspace owner.

| Existing source | Boundary to preserve |
| --- | --- |
| [Skills evidence](SKILLS_OPPORTUNITIES_CONTRACT.md) | Self-described expertise, confirmed service, checked credentials and references remain distinct. A typed license name cannot select a checked badge. |
| [Venture identity](VENTURE_IDENTITY_CONTRACT.md) | Venture control is platform authority, not legal ownership of a business or ideas. Named team roles, help acceptance and church duties confer no new venture grants. |
| [Adult contact](ADULT_CONTACT_CONTRACT.md), `relationships.ts` | Reuse current adult eligibility, contact audience, bilateral blocks and canonical conversations. No second inbox or automatic introduction. |
| `social-boundary.ts`, `social-operations.ts` | Reuse current owned sessions, same-origin/expected-account checks, serialized permissions, bounded input, versions and exact command receipts. |
| `calendar-commands.ts`, `calendar-reads.ts` | Deliberate meeting integration uses canonical events and current private-location policy. Acceptance alone schedules nothing. |
| `account-export.ts`, `account-erasure.ts`, `retention-controls.ts` | Integrate new consent, request and workspace records before writes; protected recovery must preserve current revocations. |

This contract defines missing behavior. It neither copies existing personal
skills into a new directory nor registers a nonexistent resource adapter. The
coherent runtime requires the venture source and its current authority adapter;
do not substitute free-text venture IDs or a fake church/group for that owner.

## Eligibility, expertise and discovery

Both people must satisfy the canonical current eligible-adult predicate, including
verified email, accepted adult policy and no suspension/deactivation. The existing
acknowledgement is not documentary age verification. No child contact, parental
bypass, screening flow or medical/legal/financial professional service is enabled.
The [family launch decision](FAMILY_LAUNCH_DECISION.md) remains binding.

Mentor profiles belong to personal accounts. Creation starts private and paused.
The owner deliberately chooses the exact fields and audience before discovery:
self-described expertise/experience, coarse area or online availability, bounded
help topics, preferred supported contact mode and capacity. New optional fields
default private. Do not infer availability from a private calendar or publish a
home address, private email, phone number, client identity or employer details.

Show "Self-described" beside expertise in every card, detail, filter result and
export. A currently valid checked assertion may appear only through its accepted
source adapter and disclosure consent, with exact scope and expiry. Mentor status,
accepted work and a completed checklist are not credentials or recommendations.
No ranking implies a spiritual assessment, verified suitability or guaranteed result.

Provide a preview matching actual public/member visibility. Apply current source
visibility, discoverability consent and bilateral blocks before search results,
counts, pagination and matching. Do not send hidden fields to a browser and hide
them with styling. Public presence supplies neither contact nor workspace consent.
Discovery cannot bypass a source profile's narrower projection.

Pause removes active request actions and invalidates pending requests in the same
permission transaction; resuming never revives them. Existing accepted work may
continue while otherwise authorized. Hiding discovery also invalidates pending
requests; exiting a collaboration is a separate deliberate action. Any narrower
request audience invalidates pending requests that cease to qualify. Fresh consent
and a new request are required after widening, unblocking or becoming available.

## Bounded requests and meaningful acceptance

The initial collaboration is between two named eligible adults, one current
venture controller or expressly delegated help manager and one mentor. A request
binds the canonical venture/version, sender, recipient, bounded goal, deliverable,
duration, expected effort, compensation disclosure and proposed scope version.
The server derives identities and current authority. Request text is plain text;
no attachments, private pitch copies, arbitrary forms or third-party contact data.

The recipient sees only an explicitly permitted venture projection and the exact
request directed to them. A private venture must supply a separately consented
bounded invitation summary; the invitation does not expose its draft or editor
workspace. If that adapter is absent, this request variant remains unavailable.
There is no public request roster or identifying pending/declined count.

Use the canonical adult request audience and block decisions as additional gates.
Mentor opt-in never overwrites NOBODY, following or notification choices. The form
explains which deliberate setting makes new requests available. No acceptance of
ordinary contact implies acceptance of this collaboration, or vice versa. Reuse
the canonical conversation only after its separate consent and current controls;
the scope/checklist record is not an alternate messaging channel.

Initial abuse bounds mirror adult contact: five new requests per ten minutes,
twenty per day, twenty active outgoing and one hundred pending incoming per
recipient. Enforce a shared cross-entry budget so a mentor route does not double
the ordinary contact allowance. One pending request per sender/recipient/venture
and a seven-day declined-request cooldown prevent fresh-key retry spam. Pending
requests expire after fourteen days by server time, including on reads. Bound the
request goal to 1,000 characters, terms to 1,000 and agreed scope to 4,000. These
are implementation limits, not promises of delivery or legal retention periods.

The mentor selects a maximum concurrent commitment count from zero to twenty;
zero disables new requests. Acceptance atomically checks that capacity and creates
at most one workspace. A pending request reserves no capacity. Exiting or closing
releases the slot once. Lowering capacity below current accepted work prevents
further acceptance without silently ending existing commitments. Pending inbox
bounds remain independent of active capacity and do not reveal either to outsiders.

States are PENDING, ACCEPTED, DECLINED, WITHDRAWN, EXPIRED and REVOKED. Only the
recipient accepts/declines; only the sender withdraws a pending request. Recheck
both adults, blocks, mentor availability/capacity, venture authority, request
audience, expiry and exact terms at acceptance under the shared permission gate.
Material edits invalidate the pending version; the recipient must deliberately
accept a new version. An old controller's request cannot survive authority loss
or be inherited by a new controller. No workspace exists before acceptance.

Acceptance commits only the displayed bounded scope. It creates no church duty,
venture edit right, employment, payment, verified service, calendar reservation or
intellectual-property transfer. Personal offers stay personal. Church/business
offers need their own exact current organization adapter and explicit delegation;
this initial two-person feature cannot make such commitments on their behalf.

Voluntary help states no pay offered, with any supported expense terms separately
disclosed. Paid help requires the accepted work-opportunity/terms owner and its
real publication policy before it becomes actionable. Unknown compensation is
unavailable for commitment. No equity, revenue share, commission, speculative
future pay, investment, escrow or native payment is enabled through request text.
Do not treat a paid external contact link as an adapter for those missing controls.

## Shared scope, ownership and exit

The accepted scope becomes a private versioned record with the two consenting
participants, accepted terms, responsible participant per milestone, completion
state and change history. The requester administers this particular workspace;
that limited authority does not control the mentor's profile, statements or data.
Neither participant may add another person or transfer the workspace in this first
version. Venture team members and replacement controllers gain no implicit access.

Both participants approve a material scope, effort or compensation change before
it replaces the agreed version. Record proposer, exact version and each approval;
silence is not agreement. An assignee may update their own milestone progress.
Changing another person's responsibility requires their explicit acceptance.
An overall completion claim is "Reported complete" until both approve completion;
even mutually confirmed completion is not independently verified service or a
credential. Paid terms cannot be introduced by editing a voluntary checklist.

Each participant can exit immediately. The workspace administrator may remove the
other participant, ending this two-person workspace, but cannot erase their
independently authorized receipt or force continued participation. Either direction
of blocking ends active collaboration and prevents further shared reads/writes;
unblocking requires a fresh request and never restores old workspace access.
Loss of requester venture authority closes active work rather than transferring it.

Exit, removal, ineligibility or source revocation immediately denies shared updates
and private meeting details across API, browser refresh, cached projections and
delayed notifications. Return a minimal owned status/exit receipt without current
source logistics, other people's text or newly entered content. Do not promise
recall of data previously seen. Retained records and narrow report evidence follow
accepted retention policy; define its mapping before real intake, without inventing
a new duration or copying messaging periods onto unrelated records automatically.

Meeting creation is a separate deliberate canonical-calendar action by authorized
participants, with actual venue/link audience and source zone shown. Calendar
ownership remains canonical. The integration must revoke participant access to
private collaboration meeting links on exit, even when the event is retained;
meeting cancellation does not delete the broader collaboration. Do not offer
meeting integration until these effects are implemented and verified.

## Privacy, recovery and implementation acceptance

Private scope, pending requests and work history stay out of HTML/RSC bootstrap,
public search/previews, logs, notification bodies and unrelated account exports.
Every read/write/export/delayed delivery rechecks current account, participant and
source authority. Conceal retained browser content on blur, offline, session change
or failed access. Preserve legitimate unsent inputs and immutable uncertain
commands in memory bound to the original account; never transfer them to a new
session account. Current privileged assurance applies to actual privileged source
operations, not ordinary personal mentor edits merely because the person has duties.

Exact retries reconcile the same operation without duplicate requests, capacity,
workspaces or notifications, after current authorization checks. Changed payloads
conflict. Retain uncertain bodies through later denials and offer safe reconciliation
plus an explicit warned way to discard local recovery; discarding cannot retract
server work or claim that nothing happened. Protect version conflicts and races
between acceptance, pause, block, capacity changes and authority revocation.

Reuse private reporting with exact source scope. General support, venture control
and church leadership do not grant private collaboration access. No public rating
or reference is generated from private feedback. Later public references require
separate author, subject and permitted-source approval of the exact audience/version.

Before real writes, integrate bounded personal export, erasure, consent withdrawal,
compatible migrations and protected restore/replay. Erasure removes personal
attribution under accepted retention without transferring authority or destroying
another participant's canonical messages. Restoring old data must not revive
discoverability, pending invitations, removed participants, blocks or revoked scope.
Unknown recovery controls fail closed; unsupported owner adapters stay unavailable.

The runtime acceptance must cover the complete opt-in editor, permission-filtered
discovery, exact request/response, shared accepted scope and exit journey. Verify:

- Wrong account, blocked/ineligible adult, changed contact audience, unavailable
  mentor, wrong venture and revoked controller across service, HTTP and browser.
- No private summary leak before acceptance; no unaccepted third-party participant;
  no scope expansion through stale approval, old invitation or account replacement.
- Concurrent last-slot acceptance, lost responses, exact retries, decline cooldown,
  expiry, pause/resume and a usable recovery exit without duplicate commitments.
- Revocation removes retained DOM, shared history access and meeting links; approved
  personal receipts/export omit other participants' private fields.
- Populated migration and recovery replay preserve unrelated data and current
  revocations; bounded filtered queries/payloads avoid one source query per card.
- Actual narrow/enlarged and keyboard flows with accessible labels, truthful
  empty/unavailable/error states and no unsolicited external delivery or fetches.

This definition supplies no runtime test result, policy activation, deployment or
real mentor pilot acceptance. Those gates remain open for the coherent implementation.
