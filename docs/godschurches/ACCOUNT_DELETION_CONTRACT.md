# Permanent account deletion

## Verified request and access

The approved [retention policy](MESSAGING_RETENTION_POLICY.md) owns the periods
and exceptions. Temporary deactivation remains reversible and retains data.
Permanent deletion uses the existing account boundary, current password or
purpose-bound Google confirmation, verified email, explicit confirmation and
the expected current account. A stale settings tab cannot delete a switched
account. No arbitrary target account is accepted from the browser.

The verified request fixes its original date and 30-day active-data deadline.
The account is immediately hidden, sessions and grants revoked, and invitations,
sharing and messaging access ended. Database guards prevent reactivation or
changing the accepted request clock. Loss of a journal response cannot restore
access or postpone the deadline. A high-entropy progress reference confirms an
uncertain response without signing in again or repeating the deletion.

The separate read-only progress capability exposes dates, completion and duty
counts, never identity, message content or an authentication credential. The
browser retains only that opaque reference; it is not placed in URLs. The server
rejects it 90 days after completed deletion. Lost browser storage requires the
normal secured operator help process, not guessed identity or a new account.

## Dispositions in the current service

| Resources | Disposition |
| --- | --- |
| Profile, credentials, sign-in sessions, account grants, provider identity and pending sign-in attempts | Remove private fields and credential records; retain an opaque Deleted member identity for shared foreign keys. |
| Private drafts, workspace receipts, saved collections, preferences, personal photo albums and references | Delete for this owner. Existing draft reply permissions remain unchanged before deletion. |
| Personal media | Retire through the existing media service, then wait for acknowledged provider garbage collection before deleting asset metadata or completing the request. |
| Personal calendars/events, responses and shares | Remove personal records and detach withdrawn discussion stubs; church calendars are separate shared resources. |
| Personal posts/comments, poll and volunteer input, likes, follows and invitations | Remove personal input; preserve empty thread parents where other members' replies still refer to them. |
| Selected reported text | Keep only the exact canonical source under existing reviewer authority while its report remains; erase an erased author's text when the last report expires. Closed-author visibility hides retained personal comments from ordinary readers. |
| Shared direct messages | Keep while the other participant retains them, with Deleted member and no profile link or send permission. Clear for me starts ordinary purge only once neither participant retains. |
| Submitted directory/claim/support input | Delete or redact personal input; keep only opaque references needed by shared authority or case history. Shared church content and another requester's staff conversation remain separate. |
| Church, contact, operator and support duties | Record current handoff counts. Resolve through existing authorized transfers/revocation, never a guessed successor. Unaffected erasure continues and the original deadline stays fixed. |

The deletion service does not remove another member's copies or screenshots.
Identifying words in recipient-retained messages can require a further scoped
erasure review. Account completion refers to nonexempt active data; selected
evidence, retained recipient history and expiring backups remain disclosed.

## Recovery and activation gates

The account journal reuses the existing private Blob store, separate from database
backups. Immutable records contain only opaque request/user references, policy and
request/completion dates. Before reopening a restored database, replay current
account requests, revoke restored credentials and erase restored personal input.
Replay does not restore an old progress credential or restart the completion
clock. Journal records expire 90 days after actual completed deletion.

The [operating procedure](RETENTION_OPERATIONS.md) now supplies bounded maintenance
and isolated restoration. Pending handoffs rotate fairly without moving request
deadlines. Restore-time proof rotation is confined to a quarantined local copy;
ordinary live requests keep immutable scope and credentials. A completion recorded
after the backup retains its protected original date during replay.

`ACCOUNT_DELETION_ENABLED` is enabled in 2026.09.13.27 after the operating,
protected-storage and integrated release gates passed. The account control also
requires configured protected storage. No real account was erased during release. The progress endpoint remains available if intake
is later paused. See [the implementation receipt](MESSAGING_RETENTION_REPORT.md)
for actual verification and remaining deployment limits; a contract is not a
claim that a production cleanup job has run.

## Browser verification

`scripts/qa-account-deletion-browser.mjs` accepts the existing isolated HTTPS
fixture directory. Its preview must explicitly enable deletion and the protected
local retention adapter, with all real provider credentials absent. Three groups
verify rejected credentials, an accepted request with a lost response and durable
progress, and a switched-account stale form. No real account is erased. The
integrated service/restore checks verify the subsequent resource cleanup.
