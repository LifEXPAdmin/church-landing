# Module pause and incident recovery

26 September 2026 UTC. This runbook audits existing controls. It does not enable
intake, provision operators, configure alert delivery or declare incident-response
coverage. Use [the readiness receipt](INCIDENT_READINESS_REPORT.md) for the dated
source, isolated exercise, known gaps and remaining acceptance.

## Start and assign authority

1. Record a private incident reference, discovery time, affected service, observed
   symptoms and exact serving version. Separate observed facts from suspected
   exposure. Never put credentials, private content or user identifiers in a
   public issue, source commit, screenshot or status announcement.
2. Contact the actual project owner through the established private contact route.
   Verify the responder independently if that account or channel may be compromised.
   Record who acknowledged, when, their current authority, the action owner and
   the next update time. A sent message or empty queue is not acknowledgment.
3. Use a current scoped operator for application actions and an authenticated
   provider owner for provider actions. Repository write access, an agent's
   worker reservation, a founder title and report-review access are separate
   from account management, Support, health, hosting or recovery authority.
4. Record affected data classes, plausible disclosure period, active writes,
   outbound work and threatened deletion/backup deadlines. Contain ongoing harm
   with the narrowest working control below. Preserve minimum redacted evidence
   concurrently; evidence collection must not delay necessary containment.

The project owner is the only confirmed intended operational contact in the
existing support contract. Actual general Support, account-management, health and
access-manager appointments, authenticator acceptance and response coverage have
separate private owner actions. No accepted backup responder or continuous
on-call arrangement is established by this audit.

If the owner does not acknowledge by the incident's explicitly recorded next
update time, escalate through an independently verified provider recovery/support
route held by an already authorized person. Record attempts and lack of coverage.
There is no invented fallback administrator or authority to create a grant.
Keep affected intake closed where an authorized control is available. If nobody
can operate the required control, record containment as unavailable and escalate;
do not record the module as paused. An agent may prepare a reviewed repair and
evidence, but cannot substitute for the missing identity or recovery authority.

## Working control inventory

Every state-changing application action must use its canonical service, current
authority and supported version/idempotency contract. Where exact retry receipts
exist, retain the same body and key after an uncertain response. Where they do
not, such as revoking other account sessions, inspect current state before
acting again. Do not assume every control has a version or receipt.
Environment changes require the designated release/provider owner to verify the
effective configuration and exact serving deployment. An edited local environment
file is not a production pause.

| Surface                                   | Supported containment and authority                                                                                                                                                                                                                                         | Important limit                                                                                                                                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Own account sessions                      | The account owner's session controls revoke other sessions after current sign-in confirmation. Reviewed account suspension uses current `MANAGE_ACCOUNTS` authority and the account restriction service.                                                                    | Revoking other sessions preserves the current session. A stolen password or provider account needs trusted credential recovery too. Self-suspension through the operator interface is denied.                                              |
| Ordinary Support                          | `SUPPORT_INTAKE_ENABLED`, the enabled database intake setting, current RESPOND recipient generation and approved notice must all permit new intake. Trusted setup maintains settings and grants. Assigned REDACT authority can remove specific accidentally submitted text. | Turning off new intake does not close or erase existing cases, revoke existing reads or establish a monitored vulnerability inbox. Redaction cannot recall prior disclosure or remove every older backup.                                  |
| Feedback and reports                      | `FEEDBACK_INTAKE_ENABLED` gates feedback intake separately. `COMMUNITY_REPORTS_ENABLED` and current scoped reviewer coverage gate report intake and some contact/publication operations.                                                                                    | Disabling reporting also removes a safety intake path. It is not a general write lock; verify affected dependencies and a real alternative before using it as containment.                                                                 |
| Adult contact and private messaging       | Existing reporting coverage gates new contact and sending. Personal blocking, declining, withdrawing and cleanup retain their canonical owner controls. Founder announcements recheck founder/reviewer authority.                                                           | A reporting-coverage pause is not a global privacy boundary. Authorized existing history and personal cleanup remain. Revoked authority pauses unsent announcements; account restriction cancels them.                                     |
| Phone and optional email                  | `PUSH_ENABLED` gates phone sending; `SOCIAL_EMAIL_ENABLED` gates supported social email and `FEEDBACK_FOLLOWUP_ENABLED` gates feedback email, together with actual delivery configuration and current consent.                                                              | In-app activity is separate. `ACCOUNT_DELIVERY_MODE=disabled` has broader effects, including verification/recovery and essential notices; it is not an ordinary optional-alert mute. Already accepted provider work may be outside recall. |
| Scheduled publication and background work | Current source cancellation, withdrawal, permission checks and the existing dispatch/consumer owners control each item. Inspect the shared notification maintenance and native queue handlers.                                                                              | Stopping one cron does not stop already queued consumers, direct handoffs or another dispatcher. There is no verified one-switch pause for all writes and sends.                                                                           |
| Retention and asset deletion              | Secured maintenance inspection is read-only. `RETENTION_CLEANUP_ENABLED` controls automatic retention cleanup; image garbage uses its separate existing worker.                                                                                                             | Disabling cleanup neither restores data nor stops all image work. Preserve fixed deletion/retention deadlines, protected receipts and holds. Do not delete queues, journals or backups to make health appear clear.                        |
| Optional measurement                      | `PLATFORM_MEASUREMENT_ENABLED`, existing user withdrawal and reviewed measurement configuration determine collection.                                                                                                                                                       | This does not erase historical aggregates or disable essential account/security operations or provider logs. An analytics pause is not website containment.                                                                                |

The canonical source links for this inventory are
[account sessions](../../lib/platform/account-sessions.ts),
[account restriction acceptance](ACCOUNT_RESTRICTION_ACCEPTANCE.md),
[Support](SUPPORT_OPERATIONS.md),
[adult messaging](../../lib/platform/adult-messages.ts),
[founder announcements](../../lib/platform/founder-announcements.ts),
[push configuration](../../lib/platform/push-config.ts),
[social email](../../lib/platform/social-email.ts),
[notification maintenance](../../lib/platform/notification-maintenance.ts),
[scheduled publication](../../lib/platform/scheduled-publication.ts),
[measurement](../../lib/platform/platform-measurement.ts) and
[retention](RETENTION_OPERATIONS.md).

The remaining implemented resource families covered by this source audit have
these source-specific controls:

| Resource                  | Actual owner/control and operator entry                                                                                                                                                                                                                                                                                    | Scope and missing control                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Church records and access | Current church profile/access authority and scoped claim reviewers use the church management and claim-review views. [Church listings](../../lib/platform/church-listings.ts) and [portal commands](../../lib/platform/portal.ts) preserve their separate authority.                                                       | Withdrawing a listing submission explicitly leaves public church information unchanged. No ordinary church-wide unlisting or publication-pause command was found. Revoking a claim does not hide its public listing.                    |
| Posts and discussions     | Author/current church publisher can `withdraw` or `cancel-schedule`; current author/moderator can change discussion state through [post commands](../../lib/platform/post-commands.ts) at the post/scheduled-post detail.                                                                                                  | This affects selected sources, not all posting. Publication withdrawal, discussion closure and participant restrictions have different effects.                                                                                         |
| Moderated content         | Current scoped report reviewer uses `/platform/reports/review` and [content moderation](../../lib/platform/content-moderation.ts).                                                                                                                                                                                         | The hide/remove adapters cover POST, COMMENT, TOPIC, GROUP and EXCHANGE_LISTING. Other report target types do not automatically have such an adapter. Restoring moderation state does not restore withdrawn publication or permissions. |
| Topics                    | Current owner can archive; current role authority can restrict members or revoke roles in the topic management view via [topic commands](../../lib/platform/topic-communities.ts).                                                                                                                                         | Archive makes that topic's posts unavailable. No platform-wide Gather pause was found.                                                                                                                                                  |
| Groups                    | The current canonical owner archives with active membership, step-up and any required current church authority. Invitation/leadership actions keep their individual owner/leader permissions in [group commands](../../lib/platform/group-commands.ts).                                                                    | Archive retains permitted member history. Church group authority remains separately checked.                                                                                                                                            |
| Calendars and events      | Current owner/editor authority governs event cancellation. Calendar/event sharing revocation requires the personal calendar owner; archive keeps its current calendar-edit authority, expected version, confirmation and prior-series-cancellation checks in [calendar commands](../../lib/platform/calendar-commands.ts). | No general calendar write pause. Cancellation can affect real commitments and reminders; do not use it casually as a reversible incident switch.                                                                                        |
| Volunteer opportunities   | Current authorized coordinator closes application intake or cancels an assignment using the opportunity edit/application views and [volunteer commands](../../lib/platform/volunteer-commands.ts). Applicants withdraw their own commitments.                                                                              | Closing applications does not cancel existing signups. Current capacity, authority and canonical cancellation still apply.                                                                                                              |
| Exchange                  | Owner/current church Exchange manager controls listing state/archive and inquiry consent; named participants cancel their handoff through [listing commands](../../lib/platform/exchange-listings.ts) and [handoffs](../../lib/platform/exchange-handoffs.ts).                                                             | Listing visibility, new inquiry intake and existing agreed obligations are distinct. No global Exchange pause was found.                                                                                                                |
| Church Needs              | Exact current consenting coordinator closes a slot or need; contribution withdrawal remains personal. [Need commands](../../lib/platform/exchange-need-commands.ts) and [listing withdrawal](../../lib/platform/exchange-need-listing.ts) own the transitions.                                                             | Withdrawal disables coordinator consent and revokes contributions. Historical fulfillment and outstanding physical returns must remain truthful.                                                                                        |
| Pantry                    | Current scoped manager sets hub `intakeEnabled=false` in its manage view through [Pantry commands](../../lib/platform/pantry-commands.ts); participants/coordinator cancel or decline individual requests.                                                                                                                 | Stopping intake does not settle existing pickups. A different manager cannot silently replace another coordinator's consent.                                                                                                            |
| Media and photos          | Canonical owner/source-authorized removal and source checks are in [media](../../lib/platform/media.ts). `PERSONAL_PHOTO_LIBRARY_ENABLED` and `PHOTO_ALBUMS_ENABLED` gate those named features.                                                                                                                            | `MEDIA_STORAGE_MODE` is storage availability, not an upload-only pause, and can affect reads/deletion. Verify consequences before changing it; removing a source is not proof all provider/cached copies disappeared.                   |

These are resource-specific lifecycle operations, not interchangeable global
module switches. Confirm remaining reads, writes, obligations and queued work.
Do not mass-cancel obligations or remove records merely to emulate a missing
pause. A wider application flaw requires an authorized compatible corrective
release or verified provider containment, with all entry points independently
checked. The existing `/platform/admin/access` interface requires
`MANAGE_ADMIN_ACCESS` and current step-up proof for its supported grant changes;
it does not bypass separate church authority or create a new incident role.

## Account or credential compromise

Use a trusted device and independently verified sign-in/recovery route. Record
which credential class is implicated: application password/session, linked sign-in
provider, operator authenticator, database role, storage token, mail credential,
maintenance secret, repository token or hosting account. Avoid copying its value.

Contain the affected account with its supported session or reviewed suspension
procedure. Inspect the canonical result and protected `ACCOUNT_STATE` receipt;
a saved restriction with protection pending is a saved decision requiring the
same retry and recovery protection, not a failed decision to repeat blindly.
Current-authority restoration does not reinstate old sessions, grants or consent.

The responsible provider owner revokes or rotates exposed provider credentials
through the trusted provider procedure, checks dependent deployments/consumers,
and verifies the old credential no longer works without exposing it in logs.
History rewriting or deleting a message is not credential revocation. Inspect
access/audit scope and affected environments; preserve redacted event references.
Do not paste a live credential into a test or public issue.

Plan dependent recovery before rotating `AUTH_RATE_LIMIT_SECRET`: it protects
authenticator encryption and keyed receipts as well as rate-related material.
Existing operators may require trusted authenticator replacement and uncertain
requests may require canonical-state reconciliation. Follow
[the authenticator contract](ADMIN_OPERATIONS_CONTRACT.md), not an improvised
mass reset. Provider isolation and trusted recovery coverage remain explicit
owner gates in [the source-security assessment](SOURCE_SECURITY_ACCEPTANCE.md).

## Private-data exposure

Record minimum opaque references and the observed authorization/visibility path.
Stop further affected disclosure using an available source restriction or a
verified corrective release. A new-intake switch alone does not stop existing
record reads. Preserve relevant versions, serving identity, redacted audit/log
references and who could access the data; distinguish actual access from possible
access. Do not reproduce another person's data in a second system to demonstrate
the defect.

Use scoped redaction or the canonical content/report owner only with the relevant
authority and retention/hold checks. Previously viewed content cannot be recalled.
Reapply current erasure, restrictions and protected controls during recovery.
Do not restore an older database over production as a shortcut to hiding evidence.

The project owner records the scope assessment and obtains appropriate qualified
advice on any applicable notification obligations, recipients and deadlines.
This runbook supplies no universal legal deadline or automatic notification
decision. Track the actual decision and rationale privately, including a decision
that more evidence is required, with its next review time. Never wait for every
technical uncertainty to be resolved before escalating that assessment.

## Spam, floods and availability failures

Inspect actual response status, `Retry-After`, bounded shared rate limits, queue
age, provider errors and the serving release. Preserve legitimate exact retries
and current permissions. Use reviewed account/content restrictions for identified
abuse; local process limits and a passing fixture are not proof of deployed
multi-instance enforcement or provider flood protection.

For a broader flood, the authenticated hosting owner must verify actual provider
protection and its scope. Existing WAF, bot controls, spend controls and recovery
account readiness must not be inferred from a provider name or plan. No new
purchase or production rule is configured by this runbook. Record an unavailable
provider control as a blocker and select only a supported containment action.

## Alert routing, vulnerability intake and communication

`/api/health` is public liveness. Private `GET /api/maintenance/health` requires
the existing maintenance bearer secret before data access; the Admin health page
requires `VIEW_OPERATIONAL_HEALTH`. Use protected operator configuration, never
a credential in a URL or pasted command. The aggregate response and attention
status do not send a human alert. Inspect scoped worker completion logs too.
See [operational health](OPERATIONAL_HEALTH.md).

Record detection source, time, observed backlog/deadline, named recipient,
acknowledgment time, incident owner and next update. A future alert route needs
an actual consented recipient, a safe test, delivery evidence, acknowledgment and
an unavailable-owner exercise before anyone calls it operational. Backup-job
receipts must be inspected separately; website health cannot observe the
workstation job. No monitoring subscription or notification promise is created.

The existing public Help page links the established direct contact route. It is
the current contact entry point, not a verified dedicated security mailbox or
independent complaint service. Initial private vulnerability contact should contain
only an affected route/version, a short description and a safe way to reply.
Do not request passwords, sign-in codes, live tokens or unrelated private data.
The owner must acknowledge and establish an appropriately restricted exchange
before detailed evidence is supplied. If that channel may be compromised, use
an independently verified recovery route. Dedicated intake coverage and fallback
remain unverified until the real owner demonstrates them.

The incident owner approves any outage or affected-person communication through
an already authorized channel. State what is affected, the verified containment,
what remains unknown and the next update time. Do not include identities, exploit
secrets or an unverified restoration promise. Record provider acceptance separately
from delivery, readership and human acknowledgment. Drafting is not sending.

## Restore safely and resume deliberately

1. Establish a recovery point and preserve current protected controls. An
   authorized owner must actually freeze affected writes and outbound work while
   selecting the source. The recovery library does not freeze production for them.
2. Use the existing encrypted authenticated backup workflow in a separate local
   restore database, with matching PostgreSQL tools, private independent keys and
   no production traffic or outbound delivery. Inspect archive age, integrity,
   migration checksums, original-column fingerprints, relationships and assets.
   A database-only copy does not establish media recovery.
3. Apply the compatible schema and invoke the existing isolated protected replay.
   Its guard requires the local restore database and explicit traffic-disabled
   configuration. It retires old bearer sessions, grants, provider links,
   authenticators and queued sends, and replays newer protected decisions.
   Require `unresolvedReports` empty, `holdsNeedingReasonReview`,
   `contentNeedingReinspection`, `appealsNeedingRecovery` and
   `accountsNeedingRestrictionReview` all zero, and `replayComplete: true`.
   Even then `currentAuthorizationReviewRequired` remains true and quarantined
   topic ownership/current authority must be reviewed separately.
4. Password hashes are not reset by that quarantine. Reconcile current credentials
   explicitly, particularly for compromise and changes made after the snapshot.
   A historical password must not become acceptable merely because an old backup
   restored. Complete trusted recovery or a reviewed corrective procedure while
   traffic remains closed; do not infer safety from a session count of zero.
5. Reconcile restrictions, holds, erasure receipts, missing cases, content needing
   reinspection, appeals, account-restoration review, quarantined topic ownership,
   current relationships/visibility and module-specific recovery gates. Content-free
   journals cannot recreate missing narratives. Missing authoritative current
   records keep the affected resource quarantined; never clear a flag just to pass.
6. Verify compatible application behavior, current credentials/permissions,
   protected controls, asset inventory and controlled worker state. Record the
   exact source, restored point, decisions newer than it, checks and unresolved
   scope. Successful replay still returns traffic disabled and requires current
   authorization review; it is not permission to resume.
7. The authorized release/recovery owner deliberately opens only the accepted
   scope, checks exact READY deployment, canonical domain and serving identity,
   observes the affected user journey and private health/worker results, then
   records acknowledgment and follow-up. Re-enable outbound channels separately
   after current consent and queued-work review. Preserve rollback compatibility
   with restrictions, deletion and newer schema. An older deployment is not safe
   merely because it once worked.

Reapply approved Support redactions and current revocations from their separately
preserved private references before reopening. Never retain the removed secret
in those references. Protected-control replay alone does not establish that all
Support redactions or other post-snapshot changes were reconstructed.

Follow [backup operations](BACKUP_OPERATIONS.md),
[protected restoration](RETENTION_OPERATIONS.md) and
[resource recovery](RESOURCE_RESTORE.md). Their original restore receipts and
failure history remain authoritative for their dated scope. No production
restore, recipient message or incident was staged for this documentation task.

## Closeout and remaining work

Keep one private incident record with observed times, actual owners, source and
deployment identities, containment readback, evidence references, failed attempts,
repair/restore receipts, resumed scope and communication outcomes. Preserve
retention deadlines and least access to that record. Set follow-up actions for
the cause, missing control and missing operational coverage with observable done
evidence. A resolved incident does not imply all preparedness gaps are complete.

Future-module queue adapters remain with their original dependency. This runbook
does not add them or mark them accepted. Actual operator provisioning, alert
routing/acknowledgment, fallback, provider credential recovery and notification
assessment coverage remain open until demonstrated by the authorized people.
