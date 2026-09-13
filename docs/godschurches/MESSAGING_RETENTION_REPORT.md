# Messaging retention implementation

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
has not been applied to production. Permanent account-resource erasure, current
hold/account/device restoration replay, scheduled cleanup and actual backup
expiry remain in progress. Protected provider storage must be probed and the
first production candidates inspected before any real purge. The full release
gate and browser checks remain for the integrated feature release.

The canonical domain was freshly checked serving version `2026.09.13.26`, SHA
`06f08c7e2faba9bc6d2ddbd9ae7e422b1f067424`, with independent alias assignment to
`dpl_J5CR3nXf58fdGVHEn4EKRgUnsTHc`. The connected browser was signed out; it does
not establish the founder's actual authenticated application identity. No real
reviewer grant, message, notification or deletion was performed in this milestone.
Welcome/push and physical-phone acceptance remain separate pending work.
