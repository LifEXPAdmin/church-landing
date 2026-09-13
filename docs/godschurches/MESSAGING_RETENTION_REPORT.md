# Messaging retention implementation

## Protected operations checkpoint — local, 13 September 2026

Protected report/hold controls, failed-copy recovery, fair bounded account/message
cleanup, 90-day receipt expiry and quarantined restoration are implemented. The
combined regression passes 36 tests, including actual isolated database snapshots
and provider-failure/cleanup sequencing. A further 49-test announcement/account
integration run passes. Types and scoped lint pass. See
[the operating contract](RETENTION_OPERATIONS.md) for limits and required review.

Restoration now preserves newer protected completion timestamps when the backup
contains an older pending account/purge receipt. It retires old credentials,
device keys, queued welcomes/announcements and elevated grants before replay.
Missing recovery context is reported, and current authorization must be reconciled
before traffic. No production migration, deletion, push or announcement was made.
Actual backup expiry, provider/deployed acceptance and integrated release remain
in progress. The founder's authenticated application identity remains unverified.

## Permanent account closure checkpoint — local, 13 September 2026

The next local milestone adds verified permanent requests, immutable deadlines,
immediate access revocation, resource erasure, Deleted member shared-message
projection and protected account replay. It reuses credential confirmation,
session/contact revocation and the media retirement/garbage ledger. Final
completion waits for provider cleanup acknowledgement and remaining ownership
handoffs. Selected reported comments stay private to their authorized reviewer
and lose their retained text when the final report expires.

Settings now include a separately loaded deletion confirmation control and a
read-only progress screen. Intake remains disabled. No password or Google proof
is stored in browser progress data. See [the account contract](ACCOUNT_DELETION_CONTRACT.md).

Fresh verification: 40 focused service/boundary regressions pass, including eight
account-deletion groups, nine retention groups, existing Google-account cases
and settings context. Types and scoped application lint pass. Checks include
switched-account/origin denial, uncertain-response replay, provider-pending media,
selected evidence, handoff exceptions and restored credentials/text. These are
isolated fixtures, not real erasure or observed provider cleanup. Browser, full
migration/release and operating-job checks remain pending for the integrated batch.

Connected-provider read-only inventory found six hours of Neon recovery history,
no snapshots and an available existing private Blob store. No provider settings
were changed. Actual private journal probes, operator-backup expiry, current
hold/device revocation replay and deployed cleanup remain to be completed.

## Local foundation — 13 September 2026

The approved policy is recorded in [MESSAGING_RETENTION_POLICY.md](MESSAGING_RETENTION_POLICY.md).
The account, support, contact and reporting documents now identify the current
sole-founder-reviewer decision and approved retention periods. Historical
pending-approval notes do not create a new approval dependency.

The first local milestone adds participant-unretained timestamps, stable final
report closure dates, 30-day case/hold review dates, explicit scoped holds and
hold audit events. Reclosing an already-closed case preserves its original clock;
concrete reopening clears it. Clear for me preserves the other participant's view.
Archive and reversible deactivation do not start message expiry.

Bounded candidate inspection contains identifiers and versions, never bodies.
Cleanup rechecks candidates under the existing shared authorization/write gate.
Selected reported messages survive ordinary clear until their report expires.
Purge decisions are sealed before external I/O, so a late hold or reopening cannot
race a retry. Journal failure retains pending work; an interrupted completion is
recoverable without deleting twice. Canonical retry guards remain, with purged
report references replaced by a generic receipt, so old requests cannot recreate
erased records. No conversation-body duplicate store was added.

The protected journal adapter uses the existing private Blob SDK and immutable
decision/completion records with opaque references only. Isolated restoration
replays sealed message/report deletions before restored text becomes accessible.
Journal expiry uses 90 days after actual completion, without resetting its clock
on a copy or retry. These local checks do not establish actual provider acceptance
or a functioning deployed cleanup schedule.

Verified locally: 47 focused service tests pass, including nine new retention
groups plus existing message/report/reviewer regressions. TypeScript and scoped
lint pass. The additive migration applied to the existing isolated PostgreSQL
fixture. A deadline regression exposed database-session timezone dependence;
raw retention comparisons now explicitly use UTC timestamps.

## Remaining operational integration

This foundation is not a release or intake-activation receipt. The new migration
has not been applied to production. Current
hold/device restoration replay, scheduled cleanup and actual backup
expiry remain in progress. Protected provider storage must be probed and the
first production candidates inspected before any real purge. The full release
gate and browser checks remain for the integrated feature release.

The canonical domain was freshly checked serving version `2026.09.13.26`, SHA
`06f08c7e2faba9bc6d2ddbd9ae7e422b1f067424`, with independent alias assignment to
`dpl_J5CR3nXf58fdGVHEn4EKRgUnsTHc`. The connected browser was signed out; it does
not establish the founder's actual authenticated application identity. No real
reviewer grant, message, notification or deletion was performed in this milestone.
Welcome/push and physical-phone acceptance remain separate pending work.
