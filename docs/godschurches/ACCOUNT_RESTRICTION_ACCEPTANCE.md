# Reviewed account access

Candidate 2026.09.14.9 — September 14, 2026 UTC. Verification in progress;
canonical production is still the separately recorded .8 release.

## Contract

The existing `MANAGE_ACCOUNTS` assignment remains the sole account restriction
owner. A report-review or support assignment does not confer this capability.
A current eligible operator selects an account, a structured suspension or
restoration reason, and explicitly confirms the operation. Self-suspension and
stale versions are rejected. The audit records actor, target, reason, previous
state, resulting state, version and time. Older records retain absent reasons;
the migration does not manufacture historical evidence. Only account managers
receive the latest 30 account audit rows with current account names; canonical
older history remains intact. The initial picker is bounded to 100 accounts. An
exact-username lookup can include one additional account in a fresh private page,
whose revalidation includes that selected target. The lookup cannot bypass
account-management authority, reveal sign-in contacts, or replace a pending form.

A stable mutation identifier and payload hash provide one canonical result.
Current operator authority is rechecked before returning a saved receipt. The
HTTP operation requires the account shown by the form, and private administration
revalidates its snapshot on return. An uncertain submission retains the exact
body. Its target and reason remain locked until confirmed or deliberately
discarded; a stale decision requires fresh inspection. A completed operation
requires explicit current-state inspection before another action.

Suspension retains the existing session, credential, invitation, conversation,
sharing, church/contact and operator/support grant revocation. Restoration ends
sessions again and does not reinstate old permissions or consent. Permanent
account closure and deactivation remain their existing independent states.
No account operator assignment, live suspension, restoration or outbound message
is created by this implementation/verification cycle.

## Recovery and retention

The same transaction records an opaque `ACCOUNT_STATE` control. Provider failure
after commit reports that the status saved but recovery protection is pending;
the original request safely retries the protected copy. Existing maintenance
continues pending work. The separate journal contains neither login contact,
private report evidence nor the structured audit reason.

Replay preserves a suspension recorded after a backup. A newer restoration cannot
make an older backup's access current: the account stays suspended pending a new
review. A restored state already present at the same version remains preserved.
Unprotected controls, missing accounts and restorations needing review prevent
recovery from being declared complete. Existing restore quarantine still revokes
old credentials, grants and sending capabilities before traffic can reopen.

Recovery controls expire only after the corresponding account erasure has a
protected completion receipt and 90 days have elapsed. Protected-object removal
precedes local control and account-completion receipt deletion; failed removal
keeps evidence retryable. Message/report hold and purge ownership cannot accept
accounts, enforced both in input validation and database constraints.

Migration 48 adds one nullable audit column and the account control discriminator,
expands the existing ledger-kind constraint, and guards target ownership. It has
no account-state backfill. Original-column preservation must pass on a protected
production copy before authorized release.

## Verification record

Nine focused service/boundary/recovery groups pass, including a failed protected
write with canonical retry, current-authority denial after grant revocation,
account-switch denial, scoped audit history, both replay orders and expiration
failure recovery and competing operators at one inspected version. Expiration
uses a dedicated schema copy so an advanced clock cannot affect another suite.
Type checking and scoped lint pass. The first isolated checks caught the
existing ledger-kind constraint, which the migration now explicitly expands.
The reused large fixture also exceeded a pre-existing 100-user test expectation;
the unchanged portal regression must be judged in its standard fresh-fixture gate.

The protected production-copy upgrade 47→48 preserves all 92 original tables
and passes the protected recovery gate. Actual production inspection finds zero
eligible account-management grants, zero suspended accounts and zero account
access decisions. Real operator acceptance retains an explicit capability
assignment prerequisite; the existing founder report-review assignment remains
unchanged. The private task queue records the precise owner action.

The first complete 122-file gate passed 750 checks with two expected skips.
Interactive acceptance then exposed the initial-picker limit, now repaired in
the same feature. The expanded lookup requires a fresh complete gate. Two local
preview rebuilds hit the 6 GB heap limit; an unchanged clean-checkout build
passed all 146 runtime traces. Preserve these diagnostic limits separately from
the full gate and final clean build.

Pending: full fresh-fixture gate, browser acceptance, release/build/canonical
assignment, live reads, and the installed post-release daily backup/restore. Broader operational acceptance requires actual
appointed operators/responders and the existing physical/provider prerequisites;
passing fictional test actions does not establish real case handling.
