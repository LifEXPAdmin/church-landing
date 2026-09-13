# Founder welcome and reply contract

13 September 2026 — implemented and verified locally. Actual founder identity,
scoped reviewer appointment, operational retention gates and deployment activation
remain open. The approved sole-reviewer and retention decisions are already settled.

## New accounts and canonical messages

Only password/Google accounts created while `FOUNDER_WELCOME_ENABLED=true` receive
a durable pending-welcome intent. No migration, login or content update creates
intents for existing accounts. Signup commits independently of queue, founder or
push availability. Normal completed verification/adult setup/sign-in attempts a
post-response handoff; secured daily notification maintenance repairs missed work.
The private native queue contains only the recipient ID and retries unavailable
operations. It never sends directly from a page read.

`FOUNDER_ACCOUNT_ID` is a verified stable application ID from the normal owner
workflow. Delivery requires that exact eligible adult and a current scoped global
report-review grant, plus operating report intake. A name or matching email is not
identity proof. The actual identifier and evidence belong in private operations.

The worker inserts one `FOUNDER_WELCOME` AdultMessage into the existing canonical
sorted two-person AdultConversation. The approved body is preserved exactly in
`founder-welcome-content.ts`; the UI separately displays “Automatic welcome from
Andrew. Replies go directly to him.” It opens the first welcome at its greeting.
One unique FounderWelcome receipt per recipient prevents duplicates across
concurrent workers, retries, logins, QR returns, body updates, clear and message
purge. The receipt stores identity/consent metadata, not another copy of the body.
Historical or already cleared/muted/revoked conversations are not reopened by the
automatic sender. Initial welcome does not grant general sending permission.

## Deliberate reply and existing protections

The member's Reply to Andrew action opens the shared composer and explains the
narrow conversation consent. A first send includes `welcomeReply=true` together
with the current conversation version and ordinary exact-body mutation key. Under
the shared permission lock, the server rechecks the visible canonical welcome,
recipient identity, founder authorization, both eligible adult accounts and blocks,
then records consent and enables only that pair. It does not alter NOBODY/FOLLOWED/
EVERYONE, friendships, follows, phone permission or announcement preferences.

The founder cannot consent on the member's behalf. A block or account restriction
irreversibly retires this welcome exception; unblocking cannot restore it. Ordinary
accepted-contact behavior remains the route to any later relationship. Existing
message rate limits, version conflicts, exact retries, private history, personal
clear/archive/mute and selected-evidence reporting remain authoritative. No child
messaging or parental bypass is introduced.

The welcome creates the member's canonical unread activity. Its private push uses
the shared message category and generic lock-screen text. A member reply produces
the same existing message event and optional outbox delivery to the founder. Push
failure cannot roll back or duplicate the canonical message.

## Founder inbox

Initial sent welcomes are reachable in Sent welcomes and remain out of the
founder's main inbox until a member sends a personal message. Welcome replies and
Unanswered are founder-only filters over that same inbox/history. Unanswered compares
the latest visible member TEXT sequence against the latest founder TEXT sequence;
reading, automatic welcomes and announcements do not count as a personal answer.
Clear-history prefixes apply. SQL filters precede the existing 30-conversation page
boundary and use indexed latest-message seeks; cursors recheck the selected view.

## Retention and remaining integration

Account restriction clears pending welcome intents. Recipient erasure removes its
welcome metadata; canonical shared messages follow the approved message/report
retention rules. Message purge clears the receipt's source pointer but cannot cause
resending. Restoration must cancel restored pending welcomes and notification
queues before traffic, alongside protected deletion/hold replay. This operating
restoration gate is required before production activation.

Founder-announcement preferences are separate. The dedicated deliberate draft/
preview/send implementation remains the next integration slice; this welcome
checkpoint does not send any production announcement or backfill existing members.

## Local evidence

The latest combined welcome/push/session/Google/account-erasure regression run
passes 41 tests. The preceding welcome/message/outbox run passes 33, including the
existing constant-query inbox guard. Five production-browser groups cover automatic
label and approved body, deliberate composer consent, lost-acknowledgement retry,
founder main/filter visibility, personal answer state and narrow/enlarged layouts.
Production build/runtime traces, types and scoped lint pass. Tests use isolated
accounts and injected transports; no actual provider acceptance, physical phone
observation or production message is claimed.
