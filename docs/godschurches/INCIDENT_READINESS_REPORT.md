# Incident runbook readiness

## Release-owner integration review, 26 September 2026 UTC

The tested documentation handoff was reconciled with verified release
**2026.09.26.4**, source `0b6683ee`, and the saved volunteer acceptance reports.
The overlapping backup introduction was resolved by preserving both dated
sections. No application, schema or dependency file changes in this integration.
The original 24 control/archive checks and five agent-led scenarios below retain
their own source and execution dates; no new human drill is implied.

The now-current [volunteer recovery receipt](VOLUNTEER_AVAILABILITY_REPORT.md)
records the protected 110-to-115 rehearsal, fresh installed 115-to-115 encrypted
restore and actual nightly run 19 validating 100 sets. Those are separate release
executions, not tests performed by this runbook. The older recovery receipts
below remain historical. Current credentials and authority still require
reconciliation before any real restore resumes traffic.

This documentation is accepted for integration. Actual human coverage, provider
controls, future-module adapters and operational acceptance remain open. The
runbook does not appoint an operator or establish a response-time guarantee.

26 September 2026 UTC. Documentation and isolated current-control exercise only.
No application behavior, schema, dependency, provider setting, production record,
operator grant or recipient message changes. The existing future-module queue
dependency and actual operational acceptance remain open.

## Scope and findings

[The runbook](INCIDENT_RESPONSE_RUNBOOK.md) maps current targeted controls and
their limits for account compromise, private-data exposure, abuse/floods,
credential leaks and recovery. It distinguishes actual control ownership from
repository/chat ownership and records the missing acknowledgment/fallback gates.
There is no verified global application write or send switch. Intake gates,
resource cancellation, account suspension, optional-delivery flags, cleanup and
provider containment have different effects.

Protected restoration revokes old bearer credentials and grants and leaves
traffic disabled. It does not reset stored password hashes or recreate missing
current records. Current credential/authority reconciliation remains necessary
before resuming, especially after a compromised or post-snapshot credential
change. Ordinary authenticated restore and protected replay are separate proofs.

## Isolated exercise and checks

The inspected source is `bd4cded2c5beef1166656112e07c5bdb87b762c3`, a working
branch containing separately handed-off volunteer changes and the interchurch
definition. That identity is not a claim that those changes are live. This
documentation adds no runtime code. Existing current-control tests were reused.

At 05:02:48 to 05:03:19 UTC, twelve selected service checks passed in the existing
isolated fictional fixture. They exercise password-confirmed session revocation;
account restriction authority, uncertain protected-copy retry and restoration
without renewed privileges; unavailable Support intake and scoped redaction;
paused adult contact/messages; founder authority loss; private health denial,
safe failure, exhausted notices and content-free backlog inspection. There were
zero failures or skips. The measured health shape remains two aggregate reads;
this is not a hosting load or response-time claim.

At 05:03:14 to 05:03:15 UTC, twelve self-contained temporary-fixture checks passed:
seven backup-retention and five resource-archive tests. They cover authenticated
archives, original age, last-copy protection, interrupted cleanup, shared keys,
wrong keys/corruption, unsafe files, missing/malformed entries and no-overwrite
behavior. Zero failures or skips. These tests make no database restore or provider
call and must not be described as production backup coverage.

The exercise record, exact selected test pattern, logs, source identity and
observed times are kept in the private handoff. No human operator was paged,
no acknowledgment time or recovery-time objective was measured, and no production
incident, data disclosure, credential rotation, restriction or recipient send was
staged. Fictional service writes remained in the isolated local database.

The agent-led tabletop used hypothetical injects and the inspected controls:

| Inject                                                | Decision exercised and observed limit                                                                                                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compromised account, saved restriction response lost  | Use the existing authorized restriction and retry its exact protected-copy receipt; the fixture verifies one decision and current authority. Restoring access does not revive grants. No real account was restricted.                                               |
| Private Support text exposed                          | New-intake closure alone cannot hide existing history. Select scoped redaction and preserve a content-free reference; the fixture verifies assigned authority and removal without copied original text. Actual exposure/notification assessment requires the owner. |
| Spam while messages and contact are paused            | Preserve authorized history and cleanup while blocking new sends; the existing pause checks pass. Do not infer a provider flood defense or global write lock.                                                                                                       |
| Leaked provider credential, primary owner unavailable | Do not paste or reuse the credential or invent a replacement operator. Route to independently verified existing recovery authority and retain an unavailable-control blocker. No provider rotation or human acknowledgment was simulated as successful.             |
| Backup older than current access decisions            | Require authenticated restore, newer-control replay and current credential reconciliation, with traffic still disabled. Reuse the dated restore checks; reject the claim that archive integrity or zero sessions alone permits reopening.                           |

This is a decision/control rehearsal by the agent, not a human incident drill.
Missing operator coverage, alert delivery, acknowledgment and fallback therefore
remain operational blockers, rather than passing tabletop outcomes.

## Documentation validation

The source-security guard passes with 1,881 tracked files, 885 authored source
files and 548 locked packages, with zero findings. Website-copy checking passes
for 890 source/static files and 61,089 authored fragments. All 44 relative links
in the four changed documents resolve; the private-reference scan, new-document
formatting and staged whitespace checks pass. No application build or new runtime
test was needed for these four documentation changes. Two independent bounded
reviews checked control/authority and recovery/evidence claims; review corrections
are retained in the private handoff.

## Preserved recovery evidence

The earlier same-day volunteer verification contains two successful existing
retention-restore checks at 04:19 UTC on
`fcbadd51df6537288bd105066d31be0dfdce9a74`: normal-configuration rejection and an
actual isolated database snapshot with newer controls, preserved shared history,
and retired old sessions/devices/sends. The combined five-check attempt exited
nonzero because a separate HTTP fixture lacked its production render phase;
the two restore checks passed. That HTTP concern passed its later dedicated
rerun. This is reused dated restore evidence, not a new runbook restore.

[Backup operations](BACKUP_OPERATIONS.md) preserves the separate 106-to-110
protected production-copy rehearsal and ordinary encrypted 110-to-110 restore,
including 149 tables and plaintext removal. Its recorded scheduled run validated
98 retained sets. [Resource recovery](RESOURCE_RESTORE.md) preserves the earlier
expanded database/asset rehearsal and separate read-only production-media copy.
Those dated reports do not establish that a new backup ran during this task,
continuous host availability, scheduled media coverage or a production recovery
time guarantee. This task preserves the completed backup/resource receipts.

## Operational acceptance still required

The existing private owner actions must record the actual scoped operator,
authenticator/recovery acceptance, incident contact, acknowledgment route,
unavailable-owner fallback, safe vulnerability intake and communication/notice
assessment owner. Provider account recovery, credential separation, verified
containment and backup/media coverage retain their existing gaps. No fixture,
chat claim, checked document or healthy endpoint supplies those facts.

The source-security owner action is reused where its scope matches; an absent
operator or provider control is retained as a blocker. Documentation can be
integrated independently, but neither the wider operational task nor its future
module prerequisite is completed from this receipt alone.
