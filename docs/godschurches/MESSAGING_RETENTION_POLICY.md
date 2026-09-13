# Messaging retention and deletion

Approved 13 September 2026 · Policy version `GC-MSG-RETENTION-v1`.

The private **Approved — Messaging Retention, Account Deletion and Backup Policy
v1** and **P1 — Founder Welcome, Messaging Activation and Phone Notifications**
supersede older requests for approval. These are approved operating requirements;
implementation and provider receipts establish which capabilities are functioning.

## Retention rules

| Records | Clock and disposition |
| --- | --- |
| Ordinary messages | Keep while a current participant retains them. Clear for me affects only that person's view. Purge canonical text and unnecessary linked data within 30 days after neither participant retains it. Archive and deactivation do not start this clock. |
| Verified permanent account deletion | Revoke access, messaging, sessions and notification/device associations immediately. Remove non-exempt active-system personal data within 30 calendar days of the accepted request. Keep deactivation distinct and reversible. |
| Recipient-retained messages | The remaining participant may retain shared history. Remove live profile/contact linkage and identify the erased sender as “Deleted member.” Author-supplied personal information in text may remain; specific erasure requires scoped review. |
| Selected report evidence and identifiable cases | Keep minimum selected evidence/context while open; review at least every 30 days. Purge within 180 days after final closure unless a scoped hold applies. A concrete reopening resets closure; reads and housekeeping do not. |
| Ordinary recoverable backups | Maximum age 30 days, including provider snapshots and operator copies. Copying a backup cannot reset its expiry. Active deletion and backup expiry are separate clocks: ordinary worst case is up to 60 days from request. |
| Deletion/restoration receipts | Opaque references, dates, policy version and outcomes only; purge 90 days after the corresponding purge completes unless held. No bodies, raw emails, credentials or push endpoints. |
| Revoked/expired push subscriptions | Disable association immediately on logout, account switch, deletion or server-known revocation. Purge endpoint/key material within 24 hours of detection. Another account explicitly registers its device. |
| Push diagnostics | Content-free status/time and opaque references only; purge 14 days after final attempt. Canonical event/idempotency references follow the source lifetime so log cleanup cannot resend old events. |

Deadlines are maxima, not required delays. Use server timestamps and frequent,
bounded cleanup with candidate inspection before the first real purge. A hold
identifies exact records, reason, operator, start and next review, reviewed at
least every 30 days. Release promptly. If the original deadline already elapsed,
delete within 30 days of release; otherwise retain the original deadline. Do not
preserve whole conversations or backups by default.

## Reviewer and account authority

The founder is the sole initial report reviewer, including self-involving cases.
Reconsideration is founder review, not independent review. No backup reviewer is
appointed. Resolve the actual authenticated application identity and provision
only its explicit scoped capability through the existing maintenance workflow.
The approval itself does not create a grant. Keep reasons, selected-evidence
boundaries, current access checks and audit history.

Reuse verified account credentials and existing ownership transfer. Do not orphan
a sole church administrator. Record the precise handoff exception, retain the
original request deadline, and finish unaffected erasure. A complete secured
operator-assisted path may satisfy initial deletion; deactivation or a disabled
delete button does not. Requests cannot be deferred indefinitely by a handoff.

## Restoration and operational proof

Before a restored database serves traffic, replay current deletion, hold-release
and account/device revocation records from a separately protected source. Do not
resurrect erased accounts, purged message text, old sessions/device associations
or queued welcomes. Reapply current authorization before traffic.

Inventory provider snapshots, encrypted local backups, object-storage dumps,
deployment artifacts and diagnostic exports. Configure supported expiry and
verify deletion/restore procedures before making live promises. Preserve a
verified recovery copy during transition; do not destroy the sole viable backup.
An untracked copy outside the policy prevents a verified 30-day backup claim.

## Required user explanations

- Clear for me: “This removes messages from your view. Other participants may
  still have their copies.”
- Account closure explains immediate access loss, the 30-day active-system
  deadline, retained recipient history under “Deleted member,” and selected
  evidence/hold exceptions.
- Backups may take up to 30 additional days after active deletion; do not promise
  immediate erasure from all copies or removal of screenshots.
- Reports expose only selected content/context to authorized review and retain it
  for 180 days after final closure unless specifically preserved.

## Current implementation checkpoint

Policy decisions are complete. The baseline published service implements
reversible deactivation, participant-local clear and scoped report review.
Permanent erasure, timed cleanup, protected restoration replay and actual backup
expiry are being implemented and verified. Publication/activation receipts must
replace this checkpoint as each operational check passes.
