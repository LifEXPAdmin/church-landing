# Adult message implementation receipt

## Text/history service verified locally — 12 September 2026

The service extends the existing sorted two-person conversation membership from
[the contact milestone](ADULT_CONTACT_REPORT.md). One immutable message record
holds each accepted text send, with an increasing conversation sequence and
unique sequence constraint. Personal read/mute/archive/hidden-prefix state is
separate from membership and never grants permission. It adds no attachment,
presence, encryption claim, worker or runtime dependency.

`adult-messages.ts` and `/api/platform/messages` provide authorized send, bounded
history/inbox reads and versioned personal choices through the existing social
receipt and abuse-limit owners. Current eligible participants alone can read
retained history; new sends additionally require current accepted consent,
bilateral block checks and real reporting availability. Block/unblock does not
restore consent. Request preferences cannot override an accepted conversation
or a block. Exact retries return IDs/sequence receipts without a second message
or quota charge, including after operations pause. Stale permission versions
conflict before a new send.

History pages hold at most 50 messages and inbox pages 30 conversations.
Conversation-owned cursors prevent cross-thread reads. An indexed last-message
lookup avoids copied preview bodies or fetching an entire history; related
people, states and unread counts are batched. The one-versus-thirty-conversation
fixture confirms a constant query count. This is a bounded-work check, not a
production latency claim. Read markers advance monotonically and do not create
another participant's read receipt. Archive keeps history; a new incoming
message restores the recipient's inbox without unmuting. Clear affects only the
owner's acknowledged prefix and never erases the other participant's history.

Selected message reporting reuses the private case workflow. A participant may
report only a message in their retained visible history; currently authorized
case review sees that selected item, never unrelated messages or full threads.
Credential-checked account export includes the owner's authorized message view
and own conversation choices, excluding their cleared prefix and other threads.

The existing shared read lock is extracted into `withAccountRead`; `withPostRead`
adds its existing post/church context. Personal contact/message reads reuse the
same session and revocation boundary without loading unrelated church-page data
or inheriting its connection-count limit. The read-only/concurrent-reader and
exclusive-revocation tests pass. A fresh static runtime import graph across 546
modules finds no cycles.

Fresh checks pass: 16 message-service groups, 32 contact/report/account-export/
read-lock regression checks, and nine enabled plus nine paused contact/message
HTTPS groups. They cover actual persistence, outsiders, current accounts and
origins, both participants, replay/conflicts, quotas, cursors, read positions,
mute/archive, hidden history, blocks, report scope and export. The first combined
run lacked a preview for its export HTTP check; the subsequent built run passes
that check. A stale blocked-write test expected 403 where the preserved version
contract returns 409; it now verifies both stale-version conflict and current-
version denial, and the five affected HTTP groups pass on rerun.

Types, scoped lint and production build pass. Runtime tracing passes 128 traces,
10,899 entries and 322 server JavaScript files, with no private fixture,
environment or Prisma configuration-loader paths. No new physical-phone result
or real messaging activity is claimed.

Migration `20260912233100_adult_message_history` is isolated-only, alongside the
unreleased contact migration. The actual inbox/history composer, profile resume,
foreground reconnect/visible read integration and durable in-app activity remain
next. The complete integrated release gate and production backup/migrations are
pending. Production remains reporting `2026.09.12.24` / `e710170`, with 33
migrations. Common real reviewer/retention/erasure requirements, parent and
physical/owner acceptance remain open. No task is closed as live by this receipt.
