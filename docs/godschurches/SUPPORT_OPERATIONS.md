# Ordinary support operations

## Stage 2C implementation contract

Authorized September 8, 2026: build, test and publish this slice. Production intake
stays off until actual recipient provisioning and a reviewed privacy notice exist.
Andrew is the only confirmed operator, not an automatically privileged account.
Baseline application 7679e03, local reports 044e27a, seven applied migrations.

## Small model

SupportCase stores a requester, immutable optional church/category context, subject,
description, state, version, current owner-grant/version or unassigned, optional
resolution and separate feature decision. SupportMessage stores participant-visible
plain-text updates. SupportCoordinatorShare stores at most one explicit appointment
and its version per case. SupportRead records only the viewer's seen case version.
SupportOperation provides actor-scoped UUID retry receipts with payload fingerprints,
never copies of submitted text. Fingerprints are HMACs using the private account rate secret, not recoverable text; rotating that secret may require a fresh retry key after checking current history. SupportAuditEvent stores structured action/IDs/state,
never free-text secrets. SupportCapabilityGrant separates RESPOND, ASSIGN and REDACT;
no existing church/operator capability silently implies one. SupportIntakeSetting
selects an authorized default recipient and approved notice version; it is not seeded
in production. No generic participant, messaging, attachments or staff-note system.

## Authorization table

All access requires a current session, active account and versioned adult acknowledgment.
Support staff additionally require verified email and current explicit capability.
Only ACCOUNT_WEBSITE intake permits an unverified email, without granting church rights.

| Operation | Requester | Assigned RESPOND owner | Explicit coordinator | ASSIGN manager alone |
| --- | --- | --- | --- | --- |
| Create | Own request; configured intake and disclosed current recipient | Same ordinary requester rules | Same ordinary requester rules | Same ordinary requester rules |
| List/detail/replies | Own cases, including after leaving | Current assignment only | Shared case only while appointment and both connections remain eligible | No content; minimal unassigned routing metadata only |
| Reply | Open own case | Open assigned case | Open shared case | No |
| Resolve/close | Own case with explanation; confirm resolution | Assigned case with explanation | No | No |
| Reopen | Own resolved/closed case, reason required; unassigned clearly disclosed | No | No | No |
| Share/revoke coordinator | Explicit disclosure/action, fixed church context | No | No | No |
| Handoff | No | Current case to eligible RESPOND recipient | No | Unassigned case only, using reference/category/age/status/church scope |
| Feature decision | No | Feature case only, explanation required | No | No |
| Redact | Verified request through direct contact | Assignment plus REDACT capability | No | No |

Unauthorized and nonexistent IDs both return the same API 404. HTML/RSC render the same content-free denial view (HTTP 200) and generic metadata. Lists/counts and pagination
are permission-scoped before content reads. No support-content search is added.
Messages are visible to all current case participants; inclusion exposes existing
history too. No hidden staff free-text notes. Capability/security audit internals
are not participant updates. A read marker never claims someone else has read a case.

## Lifecycle

Received -> In progress / Waiting for requester / Resolved / Closed by owner.
In progress -> Waiting for requester / Resolved / Closed by owner.
Waiting for requester -> In progress / Resolved / Closed by owner.
Requester may resolve or close an open case; resolved -> closed confirms resolution.
Only requester reopens Resolved/Closed with a reason, returning to Received. A reply
while Waiting for requester returns to In progress if assigned, otherwise Received
with Awaiting assignment. Replies are disabled on Resolved/Closed until reopening.
Resolution and owner closure require explanations. Feature decisions are independent:
Received, Under consideration, Planned within approved scope, Delivered, Deferred,
Declined. Resolving support never automatically marks a suggestion Delivered.
Reopening an unassigned request never assigns a newly configured default recipient:
existing history needs a separate explicit handoff. The requester sees Awaiting assignment.

## Revocation and concurrency

Use the existing PostgreSQL transaction-scoped portal gate plus row/version checks,
not process locks. Case writes and audits/receipts are atomic. Replayed keys with
different payloads conflict; replay cannot bypass current authorization. Every
case mutation requires the current case version. Personal read markers also reject
stale snapshots, but do not increment the case version.
The pilot uses one PostgreSQL advisory transaction gate shared with church changes. This is durable across serverless instances but serializes these operations and scans assignment metadata for revocation; it is not a load-tested large-scale support queue. Owner assignments bind to a specific current grant version. Coordinator shares bind
to the exact appointment version, requester connection and church. Revocation or
reappointment never resurrects shares. Leaving/revocation removes dependent shares;
case context never moves to a new church. Lost owner eligibility becomes unassigned,
not an implicit grant to every operator. Existing authorized history remains private.

## Limits and availability

Subject 120 characters, description 3000, replies 2000, explanations 1000; plain text only.
Request body 8192 bytes. Lists/messages use bounded 20-row pages, at most 100 pages. Messages open on the latest page, displayed in chronological order within it; older-page navigation is bounded. This founding-team UI is not an unlimited archive/search tool.
Creation at most 5/account/rolling 24 hours; state/reply/sharing writes at most 100/account/
rolling 24 hours. Durable HTTP limiter: 120/min global, 30/IP/15min, 10/operation/account/
15min in a separate support namespace. Idempotent successful retries do not create
new cases/messages. No uploads, remote fetches, emails or SMS. No response-time promise.

SUPPORT_INTAKE_ENABLED must be true, an enabled database setting must reference an
active eligible RESPOND grant, and the approved notice version must match the reviewed
application notice. Missing any prerequisite denies new storage and offers direct
contact. Existing otherwise-authorized history can still be read. Reopening without
a valid owner explicitly becomes Awaiting assignment rather than a monitored queue.

## Provisioning and restricted data requests

Real grant/intake provisioning is not exposed through a public endpoint. Establish
the actual owner account through authenticated evidence, verify identity/authority,
record approval for narrowly scoped grants, and increment grant version whenever a
grant is revoked or renewed. A database trigger enforces increasing generations on revoke/renew and prevents retargeting a grant to another account/capability. Never use category, public name, email-string allowlist,
marketing Basic Auth or the synthetic bootstrap as authority. Keep production intake
disabled until SUPPORT_POLICY_REVIEW.md facts and operational approvals are complete.

For accidental secrets: do not repeat the secret in replies, audit, logs or screenshots.
Use the published direct contact route to request handling; verify requester identity
and specific record ownership privately, not by asking for passwords or sign-in codes.
An assigned owner with explicit REDACT can replace a selected message or the case's
content with a fixed removal marker and structured reason code. No original text is
retained in ordinary history/audit; retry receipts contain only a fingerprint. Capture
the minimum incident reference and privately advise credential rotation when relevant.
No real redaction is authorized by this build. No bulk deletion or guessed scheduler.

Revocation cannot erase what another participant already saw. Older encrypted backups
may still contain prior content: restrict backup access, record the verified redaction
reference separately without the secret, and reapply approved redactions and current
revocations during any restore before reopening access. Set an actual backup/retention
policy before intake; do not promise immediate erasure from every copy. Ordinary
support is not pastoral care, allegations, emergency response or an independent
complaint route. Direct contact with Andrew is not independent handling of a complaint
about Andrew. No new sensitive intake or fictional responder is created.

## Evidence

Final isolated verification passed 67 service/HTTP tests and 21 Chromium journey groups
(eight support, 13 account/portal/demo), plus fresh/upgrade migrations, synthetic restore,
production builds, private-renderer guards, lint and types. A fresh encrypted real backup
was restored and upgraded in isolation, preserving all prior table fingerprints.
See current QA_REPORT.md and DEPLOYMENT_REPORT.md for publication evidence and exact SHA.
Real intake remains disabled; no real responder was provisioned and no email was sent.

## Logging boundary

Application analytics explicitly ignores all /platform routes and never records support identifiers, participants or text. Service/boundary exceptions are generic and no support body is logged. Referrer-Policy is no-referrer; all private responses are no-store and noindex. The hosting provider can still record opaque request paths in access logs. Restrict provider access/retention as part of the operational policy; this is not a claim that a route identifier is invisible to its host.

After a saved write the support UI loads a fresh private document, rather than
optimistically keeping an earlier permission/status snapshot in the client route
cache. Failed/network-uncertain submissions retain their fields and retry key; an
explicit reload link warns that reloading clears the draft. The case's server version
still decides whether a later operation is allowed. Back-navigation cannot recall
information already seen, and every subsequent server read rechecks current rights.

## Provisioning transaction checklist

For a later authorized operator setup, not this release: authenticate the intended
real adult account, independently confirm authority and operational readiness, then
use a restricted maintenance transaction with the same portal advisory lock
(730221, 2). Select the account by its confirmed opaque ID, not a submitted display
name/category. Create or renew only the approved RESPOND capability; ASSIGN and REDACT
are separate approvals. Record the approval outside participant-visible conversations.
Never retarget a grant row to another person. Revocation/renewal increments generation;
run reconciliation in the same transaction when maintaining grants. A new recipient
must be explicitly handed existing unassigned cases through the routing workflow, not
by rewriting their requester/church or resurrecting old assignments.

After the actual public privacy notice is reviewed and published, set the default
SupportIntakeSetting to that recipient's grant, enabled=true, with approvedNoticeVersion
matching ordinary-support-v1. Enable SUPPORT_INTAKE_ENABLED only for the intended
production release after a deliberate authenticated dry run. Merely knowing a username
or owning the domain is not account verification. No real grants/settings were created
by the migration or synthetic seed. Public support capability provisioning is deliberately
not exposed as an HTTP form in this founding-team slice.
