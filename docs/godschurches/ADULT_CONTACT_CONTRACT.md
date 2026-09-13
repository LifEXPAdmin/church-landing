# Adult contact and conversation contract

Implementation contract · 12 September 2026

This defines the authorized profile-first adult messaging slice after inspecting
the current account, relationship, settings and reporting owners. It does not
claim runtime messaging support or owner-approved legal retention policy.
The current reporting foundation is verified live; see
[its receipt](COMMUNITY_REPORTING_REPORT.md).

## Scope and existing owners

The first version supports one request and an accepted text conversation between
two different adult personal accounts. No child, parent bypass, church identity,
group, attachment, typing/presence or external delivery feature is implied.
SupportMessage remains separate. Reuse withOwnedSession and the withAccountRead
shared read boundary (withPostRead adds post/church context), the
exclusive permission gate, SocialOperation, PlatformAuthLimit, PlatformFollow
and bilateral SocialRelationship blocks. Reuse the existing settings registry
and private-report service. Do not create a second relationship or notification
authority. Profile entry comes first; future contextual entry points must use
their canonical source authorization and do not delay this slice.

## Eligibility and preference decisions

Both participants must currently satisfy the canonical verified adult account
predicate, including `eligibleWhere` / `isEligible` and the accepted adult-policy version and no suspension or
deactivation. Unknown age/acknowledgment or unsupported accounts fail closed.
Never infer a minor's permission from a parent, affiliation, friendship or a
client-supplied age/role. This preserves the present acknowledgment mechanism;
it does not claim documentary age verification.

The recipient owns a separate request audience: NOBODY, FOLLOWED or EVERYONE.
EVERYONE means otherwise-eligible adults; FOLLOWED means the recipient currently
follows the sender. Missing, legacy and newly created preferences default to
NOBODY. Invalid stored values fail closed. The Messages/Privacy entry explains
how to opt in; no existing mention, following, QR friendship, church membership
or notification choice is converted into permission to message.

These choices govern new or still-pending requests. None bypasses explicit
acceptance. Changing the request audience does not silently revoke an already
accepted conversation; use Block to stop that contact. Narrowing the audience
invalidates pending requests that no longer qualify in the same transaction,
so later widening cannot revive stale acceptance. Unfollowing invalidates an affected pending FOLLOWED request in the same
transaction; following again cannot revive it. It never invents consent.

## Request lifecycle and bounds

Store the sender from the checked session, exact recipient, immutable plain text
purpose of 1–1000 trimmed characters, current source reference, server dates,
status, version and expiry. No HTML, attachment or client-supplied participant
list. Profile context is a stable recipient ID with current readable identity;
no email/contact details or copied profile body. A profile edit is rechecked for
the preview but does not silently retarget the request. Removed/ineligible or
blocked participants make it unavailable.

Request states: PENDING, ACCEPTED, DECLINED, WITHDRAWN, EXPIRED and REVOKED.
One PENDING request per unordered pair prevents reciprocal spam and crossed
requests from becoming implicit consent. Show an existing incoming request to
the recipient; the sender cannot accept it on the recipient's behalf.
PENDING expires after 14 days by server time. Reads derive expired state without writing. Creation and decision transactions
settle expired pending rows before checking uniqueness; no background worker
is required. Withdraw/decline/expiry
never opens a conversation. Only the sender withdraws; only the recipient
accepts or declines. Each decision requires the current version and current
eligibility. A denied/expired/withdrawn/revoked request cannot become accepted.

Use existing subject-keyed activity storage for at most five new outgoing
requests per ten minutes and twenty per day, plus twenty active outgoing
requests and one hundred active incoming requests per recipient. These are
bounded abuse defaults, not a delivery promise. A declined pair has a seven-day
new-request cooldown in that direction. The recipient can initiate their own
request during that cooldown, still requiring the other person's acceptance.
Limits return a safe generic explanation and Retry-After where time-bounded;
do not reveal another person's quota, block direction or hidden settings.

Exact command retries return the existing ID/version receipt without another
request, notification, quota charge or state transition. Reusing a key for
different input conflicts. Fresh keys cannot bypass pair uniqueness, eligibility,
cooldown or budget. Pending text stays local when a response is uncertain; retry
the same body first. Clearing local retry never claims to retract server work.
Successful receipts contain only IDs/versions, not private message content.

The text-service implementation additionally bounds new message creation to
30 messages per minute and 500 per day per sender through the existing activity
budget. These are conservative implementation defaults, not an owner-approved
legal limit or delivery promise. Exact receipts do not charge either budget.
Transport flood protection remains independent. A blocked or over-budget send
retains its browser text and never becomes a background delivery job.

## Acceptance, block and source revocation

Acceptance atomically changes one current PENDING request and creates or reuses
one canonical conversation for its two sorted participants. The database owns
pair uniqueness. Server-derived participant IDs prevent injected third parties;
concurrent or exact acceptance cannot create another conversation or duplicate
opening context. The accepted purpose remains in its immutable request record,
linked to the conversation once. Render it as the accepted contact context;
do not insert a second automatic message or duplicate its body in another store.

Bilateral block always wins over preferences, follows, request acceptance and
existing conversation state. The existing canonical block command atomically
revokes affected pending requests and the conversation's permission for new
messages under the shared exclusive permission gate. Unblocking never restores
old acceptance or pending requests. A new request and explicit acceptance are
needed to reopen sending, reusing the same pair's history rather than duplicating
conversations. Stale decisions and writes fail; no queue silently sends later.

Already accepted participants may read their previously authorized retained
history and report a selected abusive item after a block, provided their own
account remains eligible. This does not expose a live blocked profile, new
context or third-party conversation. The ineligible participant cannot read or
write; the remaining eligible participant sees an unavailable account label and
their retained history. Unavailable source context loses its preview/link; it
does not grant a new audience or delete independent accepted participant history.
Optional future private contexts require a separate current authorization adapter
and must not persist a copied source body as the contact purpose automatically.

## Conversation ordering, recovery and personal controls

One authoritative text record per accepted send, at most 4000 trimmed characters,
with server-assigned monotonically increasing sequence per conversation. Unique
(conversation, sequence) and command receipts prevent duplication. No message
editing in the first version; the UI exposes no unsupported edit or undo-send.
Pending means this browser has not confirmed acceptance, sent means committed by
the server, and failed/unknown remains retryable. Never claim delivered or read
by the other person. Preserve unsent text on version, network or access errors.

Read paginated history by validated conversation-owned sequence cursors, at most
50 messages; list at most 30 conversations or requests. Sort stable sequence/ID,
not client clocks. A cursor from another conversation fails without revealing
it. Return narrow no-store projections only to the two checked participants.
Account replacement, blur/reconnect and refresh recheck identity; no persisted
local message cache, shell preload or notification preview exposes private text.

Read position belongs to its account and increases monotonically only through
the greatest message actually rendered in the visible conversation. Reconnect
catches up without marking unseen messages read. Sender read receipts/presence
are not supported. Muting suppresses that person's conversation alerts; archive
changes only their inbox view and is not deletion or contact approval. A new
incoming message may return an archived conversation to the inbox, still muted.
Block has the distinct, stronger behavior above.

Use bounded, visibility-aware foreground polling and reconnect catch-up with
backoff before adding realtime infrastructure. The canonical sequence, not poll
timing, determines order and unread state. The existing required activity/outbox
task owns durable in-app indicators; report or delivery failure must not roll
back a committed request or message. No private content in lock-screen previews.
The scoped implementation uses the existing SocialEvent owner for unique
request/acceptance/message references and dates, never copied text. Current
in-app projections join the canonical sources and recheck eligibility, consent,
request policy, blocks, mute and visible/read positions. Optional request and
message alerts belong to the existing versioned SocialPreferences; turning them
off does not grant contact permission or hide required pending decisions. Old
preferences default to enabled in-app alerts while contact remains NOBODY.
No email, push, quiet-hour or external-delivery capability is enabled by this
scoped dependency. Its broader scheduling/delivery contract remains separate.

## Deletion, selected evidence and operational boundary

Delete/clear for me, when its UI is implemented, advances only that participant's
hidden-through sequence. It does not erase the other participant's message or
retract content they already received. Archive is not clear-for-me. New messages
after the marker can appear; old messages do not reappear from reconnect or
unarchive. No interface promises server erasure, timed physical deletion or
end-to-end encryption that the service does not implement.

Request/message reporting extends the existing private-report target contract:
only a participant may select the specific request or message they can currently
read, including retained blocked history. The server binds evidence to that
selected item and its version. No arbitrary conversation/user IDs, automatic
full-history collection or unrestricted moderator message search. A report gives
an explicitly authorized reviewer only its selected evidence and bounded reporter
details; no church affiliation grants access to personal messages. Owner exports
include only their own report submissions and their authorized conversation view.

Define evidence storage/minimization and reviewed deletion behavior before
enabling that retention. Existing report intake remains operationally gated:
actual reviewer coverage, independent escalation/recovery and retention/erasure
policy are unresolved. This is an existing common safety boundary, not a new
arbitrary messaging flag. Implement and test the core locally while these owner
actions proceed. Do not invent a legal retention period or advertise automated
erasure. Account deactivation and suspension immediately revoke its access,
pending requests and conversation sending consent. Reactivation cannot revive
that old consent. Any later physical
erasure must reconcile the other participant's record, selected evidence and
the actual backup policy through the established account-erasure owner.

## Required acceptance evidence

Verify adult/unknown/ineligible actors, both request directions, all three
audiences including absent/invalid legacy values, changed recipient preferences,
bilateral blocks, block/unblock without consent resurrection, crossed requests,
expiry/decline/withdrawal, limits and cooldown, exact retries and changed-body
conflicts, concurrent acceptance and no third participant. Then verify outsider
read/send/cursor denial, stable pagination, lost response/reconnect/order,
read-marker monotonicity, mute/archive independence, deletion semantics,
account replacement, selected report evidence, disabled operations and failure
of notification delivery without duplicate sends. Use isolated fixtures for
writes; never represent them as actual reviewer or physical-phone acceptance.

## Settings integration and current gap audit

The initial gap audit found no personal request/conversation/message service;
the Settings registry held an unavailable `future.messages` row. The verified
service milestone now extends the existing `SocialPreferences` with a distinct
request audience and adds canonical requests and two-person conversation
membership. The request UI uses `privacy.messages` and the same Settings shell.
See [the implementation receipt](ADULT_CONTACT_REPORT.md) for its current local
and release status. Text history and in-app indicators remain the next slice.

| Choice | Authority and persistence | Effective behavior |
| --- | --- | --- |
| Who can send requests | Extend the existing personal SocialPreferences owner with a distinct request-audience field; versioned contact-policy command | Missing value means NOBODY; a save cannot bypass adult eligibility, bilateral blocks or explicit acceptance |
| Mute conversation | Current participant's conversation preference and version | Suppresses that person's in-app indicators; does not hide another participant's history or allow blocked sends |
| Archive conversation | Current participant's conversation preference and version | Affects their inbox view only; later incoming messages can return it |
| Read position | Current participant's monotonic sequence | Only rendered visible history advances it; never shown as the other participant's read receipt |
| Presence, public read receipts, groups, child contacts | No current capability | No enabled switch or implied parent override |

Use the current requested/effective/source/version settings projection and exact
personal scope. Read failures and replaced accounts expose no old preference
value. Keep conflict/retry/discard and safe-update behavior. Each command changes
only its own field family; old mention-setting writes preserve the new audience,
and stale shared preference versions conflict. Do not offer a reset-all privacy
action. Do not add an enabled settings row until the same permission service
enforces it server-side. New schema/endpoint names and actual implementation
receipts belong in the next bounded behavior milestone.

The default-off request audience, fourteen-day expiry, quota sizes and seven-day
decline cooldown above are explicit conservative implementation defaults chosen
for this contract. They are not a fabricated prior owner decision or a legal
data-retention schedule. Changing them requires a documented policy delta and
the corresponding boundary tests, rather than silently changing old records.
