# Adult Gather groups and private discussions

Implementation contract, 18 September 2026 UTC. The adult group and discussion
implementation is released as 2026.09.18.4. See
`GATHER_GROUPS_IMPLEMENTATION.md` for exact source, deployment, verification and
recovery evidence. Physical devices and actual ministry pilots remain separate.

## Source boundaries and canonical owners

The current Gather groups brief requires adult discovery, deliberate membership,
named leadership, rules, a permitted roster, church links, private/unlisted states
and blocking/reporting. Its adjacent discussion brief requires canonical threads,
reply controls, moderation/appeals, unread progress, explicit following, questions
and existing polls. Their shared-contract, post-service, poll and report prerequisites
have current completion receipts. Existing public topic communities are a distinct
released public contract and must not become a substitute for private membership.
The original ministry-team scope also requires real pilot feedback; this release
cannot supply that human evidence or close the broader pilot parent.

A Gather group owns its identity, membership decisions, leadership, rules and audit.
It references existing canonical posts, comments, polls, reactions, report decisions,
images and event occurrences. Do not create another post/comment/ballot/calendar or
volunteer-capacity store. Existing ConversationPreference owns explicit following;
extend its private read progress without making reading opt into alerts.

Existing events may be deliberately linked to a group by a leader. Store the
occurrence reference, never copied event text, time, attendance or another event
thread. Render only when both current group access and the canonical event audience
allow it. Opening an event explains that its own audience/participation still applies.
This supplies the group home Events surface without duplicating event discussions
or implementing a future group-owned calendar prematurely.

## Adult group identity and bounds

Types are interest community, church life group, ministry team and private cohort.
No youth group type, child profile, child invitation or age-band workaround is
accepted. Local, online and hybrid metadata use an optional coarse area and topic;
never infer a home, continuous location or exact private meeting address.

Use stable unique slugs and normalized names, required purpose and rules, bounded
text and predictable URL/account returns. Reuse the existing initial/cover fallback;
new file-upload contexts are outside this slice unless a canonical owner supports
the exact permissions. Defaults must be honest, without fictional public groups.

An eligible verified adult may create at most three groups per day and own twenty
active groups. Cap current group choices per account at 200 and active membership
per group at 500. Lists use bounded cursor pagination and filter current permissions
before counts, previews, sorting or serialization. Bound invitations and audits;
reuse existing command admission, account pins, origin checks and exact receipts.

Listed groups disclose public purpose, rules, coarse area, membership policy and
consenting named leaders. They expose no applicant, membership or private thread
history. Unlisted groups are absent from discovery and search. Unlisted entry is
by a current named invitation; a forwarded URL grants nothing. Private cohorts
use unlisted invitation entry. The public topic directory remains unchanged.

All group discussions and member content require current accepted membership,
including for an open-join listed group. Public discovery and open membership do
not make thread text public. No future setting may silently publish existing group
content or broaden a member's roster consent.

## Membership and leadership matrix

| Action or projection | Guest or unrelated adult | Applicant/invitee | Current member | Current leader |
| --- | --- | --- | --- | --- |
| Listed public purpose/rules | Yes | Yes | Yes | Yes |
| Unlisted minimal invitation preview | No | Current named invite only | Yes | Yes |
| Private discussions/events | No | No | Yes, current source access | Yes, current source access |
| Other member names | No | No | Only members who chose roster visibility | Bounded current roster |
| Applicants and invitations | No | Own state only | Own state only | Current bounded management queue |
| Join/accept/leave | Eligible deliberate action | Own current version/rules | Leave own membership | Transfer/archive before owner exit |
| Approve/remove/invite | No | No | No | Scoped current authority, reason and audit |
| Change rules/identity or transfer ownership | No | No | No | Current owner; transfer requires acceptance |
| Report | Current readable public source | Own current readable source | Current readable source | Same source boundary |

Joining explicitly accepts the current displayed rules and chooses whether other
members may see the person's minimal roster entry. Leaders see the minimal roster
needed to manage the group; authentication email, contact details and church roles
are never roster fields. Roster consent defaults off. Members can hide their entry
without leaving. Bilateral blocks apply before any roster or invitation projection.

Join policy is open, approval or invitation-only. Pending applicants receive no
member content. Invitations name one eligible adult, obey current contact choices
and bilateral blocking, and confer no membership until that person accepts the
current invitation and rules. No automatic addition, email/phone send or inferred
consent. Withdrawal, decline, rejection, removal and banning have explicit versioned
states; an exact retry cannot resurrect an ended decision.

Only the current owner changes identity/rules, nominates leaders/successors, revokes
leadership and archives/reopens. A nomination grants nothing until the current named
member accepts while the nominator, rules, membership and invitation version remain
valid. Ownership transfer is atomic; an active group cannot become ownerless.
Leaders may handle ordinary membership and scoped content moderation, but cannot
silently replace the owner or promote themselves. Reasons and actual actors are
recorded. Privileged authentication rules apply to management projections/writes.

Church life groups and ministry teams reference a verified church. Creating or
managing official church-linked groups requires an approved church connection and
explicit scoped MANAGE_CHURCH_GROUPS authority. No capability is granted by a group
membership, title, graph placement or migration. Group leadership does not appoint
church officers. Church membership never automatically joins a group. Current
church visibility, capability revocation and assignment epochs remain authoritative;
a new church duty cannot inherit a former leader's authority silently.

## Canonical private threads and member safety

Add an explicit group post destination/audience bound to one current group; do not
encode private content as an ordinary public post. Group destination is immutable.
Every post/draft save, publication, edit, reply, reaction, poll operation and private
read uses the current group boundary plus the existing author/source checks. Removed
members lose the next server read, including direct URLs, search, media, notifications,
retained-page refresh, private drafts and exports of other people's content.

Reuse the existing post editor, private drafts, reader, chronological paginated
comments, reactions, polls and content decision/appeal UI. Group posts cannot carry
a church posting identity, public repost/quote, schedule, or a second canonical event
discussion. Accepted old drafts cannot widen their group destination after changes
or restoration. Public shares, metadata and image cards remain generic for private
sources; do not leak group names or membership through private share previews.

The initial bounded thread categories are General, Prayer, Planning and Resources.
Pinned current rules and a small bounded set of pinned threads are visible only
within their permitted audience. Pinning is distinct from author editing. A lock
rejects new replies server-side while retaining authorized history. Archiving a group
rejects new content, joins and invitations; current authorized members may read
retained history and perform negative choices such as leaving or unfollowing.

Questions use canonical replies. Only the question author or an authorized group
moderator may select/change an eligible current reply as an answer. Label it as the
question's selected answer, never platform or theological authority. Hidden, removed,
blocked or inaccessible replies cannot appear as selected answers. Reuse the existing
poll engine and ballot uniqueness; membership eligibility is current on every action
and ordinary member responses never reveal private votes.

Unread progress belongs only to the reading account. A read marker advances only
through a currently visible post/comment position actually shown; it cannot count
concealed, blocked or removed material or mark unseen pages read. Reading never
subscribes the member. Conversation following/muting remains deliberate and uses
existing deduplicated jobs with current group/source access checked at delivery and
opening. New membership/invitation notices are generic, bounded and governed by
separate current preferences; no automatic phone opt-in or external delivery.

Group reports reuse the existing shared reporting/decision/appeal services. Group
moderators can inspect only their current scoped cases, never unrelated private
platform reports. Platform-severity handling uses the existing explicitly selected
source/evidence boundary and current reviewer appointment; a report grants no group
membership or general private browsing. Reporters retain their private receipts;
affected authors can find the actual reason and existing reconsideration action.

Blocking cannot be bypassed by an invitation, reply, leadership offer, event link
or exact retry. End affected pending invitations/role offers when their authority is
revoked; unblocking does not silently revive consent. Revoked leaders immediately
lose private management/roster/report views. Account state, rules and source changes
must be rechecked before delayed work and after asynchronous provider operations.

## Recovery, interface and acceptance

Account export includes only the owner's choices and authored content. Do not export
another member's private roster history, drafts, votes, contacts or reviewer notes.
Erasure handles membership, invitations, read state and audit identifiers while
retaining only justified opaque security history. Active ownership requires a
legitimate transfer or archive before removal. Use existing retention holds for
selected reports; no indefinite duplicate evidence store.

Protected recovery carries minimal content-free security revisions. An older group
snapshot must not restore revoked membership, a ban, an invitation or old leadership.
Quarantine ambiguous authority and retire offers rather than guessing a successor.
Traffic-disabled recovery must verify current permissions before reopening sources.

Deliver discovery, About/Discussion/Events/Members surfaces, creation/editing,
join/approval/leave/invitations, roster consent, explicit leadership acceptance,
moderation/history, private/unlisted/archive states and existing Settings/My church/
Menu/Help/release integration. Reuse current read guards, preserve form edits and
exact retries, and include loading, empty, error/retry, permission loss and conflict
states. Test narrow screens, keyboard controls, dark appearance and enlarged text.
Do not display speculative inactive controls or invent future backend behavior.

Measure query and client-bundle cost; reuse canonical permission predicates within
bounded reads. Verify adversarial private/public projections, concurrency, old tabs,
removed members/leaders, blocks, archive/reopen, reports/appeals, read progress,
polls, account lifecycle, upgrade and protected restoration. Finish build/copy/lint/
types, full regression, browser acceptance, migration/installed recovery, exact
READY/canonical/serving identity, live read-only behavior and private task readbacks.
Real church pilots and physical devices remain distinct evidence. Continue the
ready priority queue afterward and keep the final batch review last.
