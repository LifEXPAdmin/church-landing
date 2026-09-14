# Retention and restoration operations

13 September 2026 — production cleanup is enabled; secured inspection and a
bounded maintenance run passed with zero candidates or failures. Actual protected
provider and backup/restore checks passed. See [the release receipt](MESSAGING_RETENTION_REPORT.md).
The approved [policy](MESSAGING_RETENTION_POLICY.md) controls all periods; no
repeat owner policy or second-reviewer approval is required.

## Account access controls

The reviewed-account-access release adds `ACCOUNT_STATE` to the same protected
ledger. Its [acceptance contract](ACCOUNT_RESTRICTION_ACCEPTANCE.md) describes
suspension preservation, current-authority retries, and the
`accountsNeedingRestrictionReview` recovery gate. A restoration newer than the
backup requires fresh account-manager review; it cannot restore old access.
Old credential/grant quarantine still applies. Rollback must
preserve these account controls as well as the existing content predicates.

Version 2026.09.14.9 is verified live on c77f3e4; all 48 production migration
checksums match. Protected production-copy upgrade 47→48 preserves 92 original
tables and passes recovery replay. The actual installed encrypted daily backup/
restore separately passes 48→48; the checksum file and installation metadata both
record 48. The nightly wrapper finds 25 verified backup sets and zero expiry
issues/removals. This remains a local awake-host job. No live account grant,
restriction, restoration, erasure or outbound message was created for acceptance.

The later content-note release **2026.09.14.10 / acb8571** verifies all 49 live
migration checksums. Protected production-copy upgrade 48→49 at 13:20:59 UTC
preserves all original columns across 92 tables and passes control replay.
Installed registry and metadata now both record 49, preserving the previous 48
checksums and installed retention source hash. The actual encrypted daily
backup/restore separately passes 49→49; the 14:07:33 UTC nightly wrapper finds
27 verified sets, zero expiry issues and zero removals. These are distinct
upgrade/replay and ordinary-copy proofs. No production user data was changed.
Content-note and excerpt erasure follows the same canonical body/evidence owners;
see [the acceptance receipt](CONTENT_NOTES_ACCEPTANCE.md).

The four-feed release **2026.09.14.14 / c83b192** verifies all 50 live migration
checksums and both installed registry records, preserving the prior 49 hashes.
The unchanged installed backup-retention source hash also matches. Protected
production-copy upgrade 49→50 completes at 18:48:41 UTC, preserving all original
columns across 92 tables and passing control replay. The actual installed
encrypted daily backup/restore separately passes 50→50 at 19:29:29 UTC with 93
tables and plaintext removal. The nightly wrapper verifies 30 sets, no refresh,
zero issues and zero removals. The existing application retention route now
sweeps at most 500 expired feed ranking snapshots per run; account erasure removes
owned sets. No provider, worker or schedule is added. Live feed checks create four
short-lived ranking records but change no post, Like or private preference data.
See [four-feed acceptance](FOUR_FEEDS_ACCEPTANCE.md).

For every schema release, verify the installed checksum file and its installation
metadata independently, preserve all earlier checksums, install the new checksum,
and run the installed encrypted daily backup/restore after deployment. The
separate protected production-copy upgrade/replay is also required; an ordinary
backup alone does not replay protected control decisions. Record exact source
and resulting migration counts for both checks.

## Protected control records

Version 2026.09.13.32 extends these same records with source visibility,
appeal versions and irreversible reported-author withdrawal controls. It copies no
source text or case replies. A reported author removal commits first; failed
provider protection returns an explicit accepted/pending message and the existing
maintenance worker retries the durable control. Ordinary unreported text still
clears immediately. Last-report expiry clears retained withdrawn text and linked
appeal messages, audits and receipts, preserving unrelated ordinary support.

The migration-45 registry is installed and its actual encrypted daily backup/
restore passes. A fresh protected production-copy upgrade/replay also passes,
using the current versioned recovery entry point. Before future releases, keep
that runtime and registry synchronized and repeat affected recovery checks. The restoration gate
now also requires zero `contentNeedingReinspection` and `appealsNeedingRecovery`.
Replayed later restoration cannot publish unproven old text: the source stays
hidden until authorized reinspection. Missing appeal history must be recovered
from an authorized current backup; content-free control records cannot invent it.
Author withdrawal wins regardless of control-page order and later source versions.
After activation, any rollback must retain these source predicates and control
kinds. An older application that ignores moderationState is not an acceptable
rollback when restricted content exists; use a compatible corrective build.

Report creation, final closure/reopening and hold changes commit a minimal
RetentionControl record with their existing canonical mutation. The immutable
projection contains opaque source/operator references, versions, outcomes and
dates only. Case text, preservation reasons, email, device keys and message bodies
are excluded. The separately protected private Blob journal uses the existing
store and `retention-v1/controls/` prefix, alongside account and purge journals.

The report HTTP boundary protects its control before acknowledging completion.
If protection fails after the canonical write, it explicitly says the action was
recorded and asks for the same request to finish recovery protection. An exact
retry reuses the canonical receipt and retries the durable control. Bounded
maintenance also repairs missed copies. A pending control prevents its associated
purge from being sealed. Current authorization is still checked before retries.

`prepareRetentionControls` seeds only missing current control versions for a
pre-policy database. It preserves original report/hold clocks. Run it and verify
zero pending protected controls before enabling new intake or making a recovery copy.

## Secured cleanup

`GET /api/maintenance/retention?mode=inspect` requires the existing strong
`CRON_SECRET` authorization and returns only aggregate counts. It never calls a
provider or erases data. `inspectRetentionOperations` is the corresponding secured
operator entry point for inspecting exact opaque candidates, request deadlines
and handoff counts privately before the first real purge.

The configured daily maintenance route defaults to inspection until
`RETENTION_CLEANUP_ENABLED=true`. Once enabled, the existing Vercel cron invokes
it daily at 05:00 UTC; provider execution can vary within its supported schedule.
Closed reports become sweep candidates at 178 days, leaving two days for daily
scheduling jitter and failure recovery before the 180-day maximum. Unretained
messages and accepted account closures can be processed promptly; the 30-day
deadline is not a waiting period. The distinct 90-day deletion receipts and
14-day diagnostics retain their approved full periods, then expire.
Each run bounds control preparation/copying, selects at most ten account requests
and twenty message/report candidates, rechecks current retention under the shared
write lock, and retains failures for retry. Account requests and sealed purges
rotate by last attempted time, preserving the original deadline; unresolved
handoffs cannot permanently occupy the front of the queue.

Account erasure reuses the existing resource services. A structured purge is not
repeated once complete. Existing image maintenance performs provider deletion;
account completion waits for its durable garbage acknowledgement. The separate
06:00 notification job removes stale device material/diagnostics and repairs queue
handoffs. The 07:00 image job drains its existing bounded image garbage batches.

Completed protected controls, purge receipts and account receipts expire using
the corresponding actual purge completion plus 90 days. External removals precede
local receipt removal and are retryable. Shared anonymous account stubs remain
only where canonical foreign keys require them. Source retry guards cannot
reactivate an erased message, case, welcome or announcement.

Check sanitized completion logs and the inspection endpoint after activation.
Failed work or overdue account/case/hold review returns an attention status (503).
Pending counts and bounded-run status require an operator to repeat a bounded run
when necessary; daily cron is not an unlimited-throughput or automatic-retry claim.
Investigate provider failures and approaching deadlines through the actual scoped
operator workflow. Continue unaffected work and preserve fixed clocks.

## Isolated restoration before traffic

Use the existing encrypted, checksum-verified backup rehearsal and migrate the
isolated copy before replay. Freeze the protected source against new production
writes while selecting the recovery point. The versioned
`replayProtectedRestoration` entry point accepts only a local database named
`godschurches_*_restore`, with `RETENTION_RESTORE_ISOLATED=true`, delivery disabled,
and push, founder welcome, report intake and automatic retention switches off.
It is not a web endpoint and never enables traffic or feature flags.

Quarantine first removes old sessions, account/recovery grants, pending provider
sign-in attempts and linked-provider authentication associations, rotates old
deletion-progress proofs, scrubs push keys and cancels queued deliveries, welcomes,
announcements and pending contact/invitation actions. Elevated operator/church/
support grants are retired. Normal verified account recovery/provider linking
and scoped appointment are required again; an old backup does not renew authority.

Replay all protected control, message/report purge and account pages. Newer
versions win regardless of object-page order. A newer completed receipt replaces
an older pending state with its original completion date, preventing a retry from
restarting expiry or conflicting with an already acknowledged provider record.
Retained shared history uses Deleted member; purged text remains absent.

A missing case without a protected purge is an explicit recovery discrepancy.
A preservation scope newer than the backup is conservatively restored; if its
original free-form reason is unavailable, authorized reason review remains required.
The minimal journal does not pretend to recreate missing case narratives or all
changes beyond the backup's recovery point. Its outcome must identify unresolved
records. Current authorization, relationships/visibility and any newer revocations
must be reconciled before traffic; replay always reports that review as required.
Never treat successful replay alone as permission to reopen a restored service.

Restoration fixtures inject protected stores and isolated image transports. They
cannot run against production and do not delete production provider assets.

## Evidence and remaining gates

The combined report, account-deletion, retention-control, maintenance and actual
database-restore regression passes 36 tests. It includes a real isolated dump/
restore with decisions newer than the snapshot and a separate empty-schema cleanup
rehearsal. Checks cover immutable controls, exact retries, failed provider copies,
released holds, preserved completion clocks, independent account progress, image
acknowledgement, account switching/credential retirement, queued-send cancellation
and 90-day receipt expiry. The separate current announcement/account integration
run passes 49 tests. These are automated fixtures, not production erasure or
observed phone delivery.

The [backup procedure](BACKUP_OPERATIONS.md) now records actual inventory,
authenticated expiry, a scheduled operator run and the protected upgrade rehearsal.
Before release: complete any outstanding provider checks,
complete the integrated fresh/upgrade/restore/browser gate, take a fresh verified
encrypted recovery copy, inspect initial production candidates, and verify the
specific deployed maintenance/queue handlers. Configure the verified founder's
normal scoped reviewer access independently. Keep physical-phone acceptance open.
