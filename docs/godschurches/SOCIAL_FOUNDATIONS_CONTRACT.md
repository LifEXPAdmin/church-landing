# Relationships and conversations

September 11, 2026. Implemented foundation for focused Medium interface work.
See the newest batch report for the tested and deployed application identity.
These contracts do not complete the corresponding interfaces or physical-device
acceptance. Existing personal follows and flat comment IDs/content/timestamps
survive the additive migration `20260911161000_social_conversations`.

## Shared write protocol

Relationships, comments and galleries use POST JSON on the same origin with the
existing session cookie. Ownership comes from the revalidated session under the
account/church lifecycle transaction gate. Never supply an owner or acting user
ID. All writes use a stable `mutationId` of up to 80 letters, digits, underscores
or hyphens; UUIDs are recommended. A response is `{id,version,message}`. It is an
acknowledged operation receipt; refresh the relevant canonical GET for current
content and capabilities. Do not assume it contains a post object or `postId`.

An exact lost-response retry repeats the entire body with the same mutationId.
It returns the original receipt without writing again. A changed body with the
same key fails 409. A new intended change uses a new key and the acknowledged
version. Versions start at 1; `expectedVersion:0` creates a previously absent
setting/draft/reaction. Create-comment has no existing comment version.
Versions for comment text, the viewer's Like, the post's pin and the viewer's
conversation setting are independent. Never substitute one for another.

Codes: 400 unsupported/oversized input; 401 expired/revoked session; 403 origin or
current permission; 404 neutral unavailable; 409 stale version/changed key;
429 rate/storage review; 503 transient failure. Preserve unsent text on failure.
Do not reveal who blocked whom in error text. GET responses are no-store and vary
by Cookie; no account-scoped response may enter a service-worker/public cache.

An owner can store up to 2,000 explicit relationship settings. Policy expansion
beyond 2,000 effective blocks/mutes fails closed for an explicit size review;
it never silently omits a blocked account. Each API domain permits 240 POST attempts per owner per 15 minutes. Draft saves
must be debounced at least five seconds and serialized. Each owner has a shared
20,000-operation receipt cap across these domains. Successful old retries remain
available at the cap; new work returns 429. Compaction/retention requires a later
reviewed contract. No silent receipt or tombstone pruning is implemented.

## Relationship API

`lib/platform/relationships.ts`, `social-policy.ts`, `social-operations.ts` and
`social-boundary.ts` back `GET/POST /api/platform/relationships`.

GET views:

| View                                | Query                        | Response                                                                                  |
| ----------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| status                              | kind=person/church, targetId | Own version, following, consented reciprocal friends, favorite, muted, snoozedUntil and blocked state; absent version 0 |
| privacy                             | none                         | Own mentions, showRelationships and version; absent version 0                             |
| following                           | optional after               | Canonical person-follow IDs, public author labels and own settings                        |
| controls                            | optional after               | All own explicit relationship settings                                                    |
| favorites, muted, blocked, churches | optional after               | Filtered own settings; churches means followed churches                                   |

Lists return `{items,nextCursor}`, at most 20 rows in ascending ID order. Pass
`after=nextCursor` unchanged. Empty pages/unknown targets contain no other user's
private settings. Controls include target labels where active/available; a null
target is a neutral unavailable state. Querying your settings never reveals an
incoming block. The default `controls` view may contain inactive restored rows;
render their explicit settings rather than assuming row existence means followed.

POST fields, in addition to operation/mutationId/expectedVersion:

| Operation | Fields                                 | Meaning                                         |
| --------- | -------------------------------------- | ----------------------------------------------- |
| follow    | kind, targetId, desired boolean        | Person canonical follow or church social follow |
| favorite  | kind, targetId, desired boolean        | Private subset of current follows               |
| mute      | kind, targetId, desired boolean        | Set indefinite mute or restore; clears snooze   |
| snooze    | kind, targetId, days=1/7/30            | UTC expiry; replaces indefinite mute            |
| block     | kind=person, targetId, desired boolean | Bilateral personal interaction boundary         |
| privacy   | mentions, showRelationships boolean    | mentions is EVERYONE, FOLLOWED or NOBODY        |

Following a church grants no membership or capability. Unfollow removes a
favorite. Block removes follows/favorites and explicit follows of each other's
personal conversations in both directions; unblock restores none automatically.
FOLLOWED mentions means the recipient currently follows the sender. Every mention
also rechecks audience and bilateral blocks. These choices send no notification.

Personal blocking reaches direct post/profile/image reads, existing follow/Like/
comment actions, new comment actions, discovery, saved-source projections and
visible social counts. Hidden contributions on a third-party thread are omitted
or represented by a neutral structural root when other permitted replies remain.
Mute/snooze affects personal/church post feed discovery and matching personal
search results; direct permitted post reads remain possible. Neither control
cancels commitments, church membership or church responsibilities. Explicit
church records/operational directory and calendar access keep their own rules.

Church-authored content has a separate public identity. Blocking an internal
publisher does not reveal that publisher or silently hide the church. Use church
mute. Blocking cannot stop signed-out access to material already public on the
internet. The block confirmation must explain that limit plainly. Full member
profiles and profile media still require an account. Relationship counts are
omitted from another viewer's profile when showRelationships is false.

## Personal invitation extension

[Personal friend invitations](FRIEND_INVITATIONS_CONTRACT.md) reuse both canonical
follow edges plus consent metadata. Ordinary one-way follows remain unchanged.
Both relationship Unfollow and the legacy community Unfollow remove an invited
friendship in both directions and retain permanent removal records. Blocking,
suspension and deactivation also invalidate pending signup consent. Old successful
receipts never establish that a friendship is still active; read current status.

The separate invitation endpoint accepts `accountId` only as an equality guard
against browser account switches; authorization still comes exclusively from the
locked session. No invitation can grant church or private-content access.

## Comment read API

`comment-policy.ts`, `comment-reads.ts` and `comment-commands.ts` back
`GET/POST /api/platform/comments`. Every public/conversation read first rechecks
the post, linked event and current audience. A withdrawn/inaccessible post hides
its whole conversation; possession of a comment ID never grants access.

All conversation GETs include `postId`:

- `view=roots` (default), `sort=oldest|newest` (default oldest), optional `after`.
- `view=replies&rootId=…`, optional `after`. Replies are always oldest first.
- `view=context&commentId=…` returns the exact permitted target, root and the
  first reply page. The target can be beyond that page; merge by ID. Load further
  replies with view=replies and its rootId/cursor, not by scanning a huge prefix.
- `view=mentions&q=…`, optional `after`: q is 2–100 characters, literal matching
  of name/username. The discriminant is `kind:"mentions"`; items are eligible
  public author labels only. The bounded candidate scan may return no items with
  a non-null cursor; continue if needed without exposing candidate information.

Thread responses use `kind:"thread"`, postId, sort, items, nextCursor, root,
target, pinned, pinVersion, canPin, canReply, visibleCount and conversation
`{mode,version}`. Each page has at most 20 items. The signed cursor binds viewer,
post, root and sort. Changing those requires a new first page. Authorization is
rechecked on every page; cursor validity is not access. Sort stability is
createdAt plus ID, and visibility filtering happens before counting/pagination.

Each visible item supplies id/rootId/parentId, content, public author label,
createdAt, version, editedAt, isPostAuthor, replyTo, mentions, likeCount, liked,
likeVersion, replyCount, canReply/canEdit/canDelete and canonical href. No internal
church actor or private contact is projected. Reply-to-reply stores its actual
target but remains one visible indentation below the root. A hidden/deleted
parent's display name is null. Structural tombstones have unavailable=true,
content/author/version/editedAt=null, no mention/Like display and no actions.

visibleCount counts eligible content across roots and replies, excludes
tombstones and hidden authors, and does not add the separate pinned projection.
The pinned comment also retains its normal chronological place. Deduplicate or
clearly label the separate pin presentation. The existing flat preview is kept
compatible and uses the same visibility/count policy until the new UI replaces it.

## Comment mutations and drafts

| Operation    | Additional fields                                                        | Version                                        |
| ------------ | ------------------------------------------------------------------------ | ---------------------------------------------- |
| create       | postId, content, optional replyToId, mentionIds, authorChurchId          | No expected comment version                    |
| edit         | postId, commentId, content, mentionIds                                   | Comment expectedVersion                        |
| delete       | postId, commentId                                                        | Comment expectedVersion                        |
| like         | postId, commentId, desired boolean                                       | Viewer Like expectedVersion, initially 0       |
| pin          | postId, commentId or null                                                | Post pin expectedVersion, initially 0          |
| conversation | postId, mode=DEFAULT/FOLLOW/MUTE                                         | Viewer preference expectedVersion, initially 0 |
| draft-save   | draftId, postId, content, optional replyToId, mentionIds, authorChurchId | Draft expectedVersion, initially 0             |
| draft-delete | draftId                                                                  | Draft expectedVersion                          |

New comment publication/edit uses 2–1,500 characters with normalized newlines and
trimmed outer whitespace. Existing legacy forms retain their 400-character limit
until replaced; no stored legacy content is truncated. Mentions are up to five
distinct stable user IDs. Typed @names are plain text unless explicitly selected;
no mass mention exists. Unsupported IDs/changed access fail before commit without
discarding text. A correction does not create another ordinary activity intent.

Personal authors own their comments. An explicitly selected authorChurchId must
have a current publishing grant and fit the post's audience. Church-authored
edits/deletes require a current publisher for that church; display role alone
does not grant authority. Post owners/current church publishers/moderators can
pin one top-level comment. This does not confer comment-text moderation rights.
Moderation/reporting and Pray remain separate owning foundations.

Delete clears text, mentions and active Likes, and removes a pin. Structural IDs
remain for surviving permitted replies. Parent/root/post/speaker identity is
immutable and database constraints reject cross-post roots and cycles. A direct
link to deleted or blocked content returns neutral 404, even if other replies
remain visible through their root.

Private draft reads use `view=drafts` and optional draftId or postId/replyToId,
with optional after. Result is `{items,nextCursor}`. Each item has id/postId/
replyToId/authorChurchId/content/mentionIds/version/updatedAt. It contains only the
owner's saved entries, no current source body or other author's labels. Owners
can recover/discard their text after source withdrawal. Saves/publication recheck
the destination; publish cannot bypass its new restrictions.

Drafts preserve exact whitespace and incomplete text up to 10,000 characters;
this does not relax the publication limit. Maximum 100 active drafts per owner,
one active draft per account/post/reply target. A new draft ID is independent of
other accounts' IDs. Save the full current snapshot before sending, then include
draftId/draftVersion in create with exactly matching content, target, speaker and
mentionIds. Publication consumes the draft atomically. Discard/send clears its
content and retains a tombstone; late saves cannot resurrect it.

After a relationship mutation, refresh current feed/profile/search data and clear
any stale client projections. No existing snapshot becomes authorization.
The Medium client must clear private state on account changes, serialize saves,
retain exact failed request bodies for retries, and show stale-version conflicts
without overwriting unsent input. Identity changes require explicit UI review.

## Events, export and verification

One canonical SocialEvent intent is stored per created comment and one per
comment/recipient mention, deduplicated across retries and edits. Events hold IDs
and kind only, never text. These are not delivered notifications. Future activity
work must recheck active mentions, source access, blocks/mutes and conversation
preferences before projecting or dispatching. Do not turn these records directly
into email/push. The activity and prayer foundations remain open.

Own-data export includes explicit own social/preferences, active comment drafts,
comment Likes and conversation choices alongside authored comments. Operation
receipts, internal event intents and other owners' preferences are excluded.

Focused tests: `npm run test:social-foundations`. Full isolated integration and
actual production-mode local HTTPS routes: `npm run test:support`. Fixtures cover
60 roots/45 replies, both sorts/cursor binding, surviving tombstones, bilateral
blocks through legacy/direct paths, exact retries, concurrent edits/Likes,
mention consent/audience, speaker grants, own drafts and database constraints.
The common restore harness includes all new tables, indexes, checks and triggers.
Physical phone interactions are separate from browser emulation.

## Comment discussion client

The full post route uses `CommentThread` and the canonical comment endpoints.
Roots default to Oldest; Newest changes roots only. Root and reply pages merge by
stable ID, replies remain one visible level, and a validated comment query loads
the exact context endpoint. Unavailable rows retain only the server tombstone.
Foreground reads recheck the signed-in account and current access before showing
content. Compact feed previews and reader-sheet integration remain separate work.

`CommentDraftController` serializes saves after at least five idle seconds or an
explicit Save/Send. It restores the active account/post/reply-target snapshot,
keeps exact text, selected mention IDs and church identity, and sends only after
the matching complete snapshot is acknowledged. Network/unknown responses retain
the exact serialized mutation and ID; uncertain publication freezes its fields.
Conflicts retain unsent text and present the saved copy separately before explicit
replacement. The recovery library and discard lifecycle are separate UI work.

Create, versioned edit/delete and desired Like use the existing service. Like's
version is independent of the comment version. Receipts trigger canonical reads;
there is no optimistic permission or author inference. Edit work stays mounted
through foreground reads. Dirty/uncertain/conflicted social work participates in
the shared update/reload guard; it does not modify post-draft fields or their
reply-audience contract. Mention selections store eligible account IDs, never
infer recipients from typed text, and cap selections at five. Church identities
come from current composer grants and are checked again by the command service.

The private comment-draft library is at `/platform/comment-drafts`, linked from
Your drafts. It uses owner-scoped cursor reads and the same composer controller.
An explicit resume ID must still name the active target draft; a sent/discarded
snapshot cannot silently start a new draft. Target labels and discussion links
appear only after a current authorized comment read. Unavailable targets retain
only the owner's saved/working text with explicit copy and discard choices.
Discard uses its own exact serialized body and expected version; foreground and
account changes conceal previous-owner data before rechecking access.

## Shared reader discussion and conversation controls

Bible/Pages, List and focused feeds open `CommentSheet`, a native dialog containing
the same `CommentThread` used by post detail and authorized church-event discussion.
Dirty/uncertain/conflicted work blocks sheet closure; clean closure restores focus
without changing the feed anchor. Nested dialog gestures cannot turn the outer
reader. Comment prose and entry text honor the saved reading size, including 24px.

Individual links use the server's canonical comment href. Validated targets load
through context, merge by ID, receive focus/highlight, and survive sign-in return.
The detail Back control preserves browser history/scroll and protects unsaved work.
Private comment-draft entry is also an explicitly allowed account-return route.

Pin/Unpin uses `pinVersion`; the separate pinned summary does not change counts or
create a second chronological row. Follow conversation/Mute/Default uses the
independent conversation version and explicit desired mode. Both share exact-body
retry handling; a conflict requires a canonical refresh before another decision.
The controls save in-app preferences only and do not activate delivery providers.

## Relationship interface

`RelationshipControls` is shared by profile, church and post-card menus and the
private library. Opening a menu checks the current owner and status. Commands
send explicit desired values, the returned relationship version and a stable
serialized mutation body. Unknown responses retain the same request; version
conflicts require refresh. Account changes clear pending choices. Current draft
work must be saved/resolved before changing relationships. Success refreshes the
canonical route/prefetch cache and rechecks open comment projections. Personal
blocking never substitutes a church identity or infers church membership.

Settings contains `RelationshipPrivacy`, with EVERYONE, FOLLOWED (people the
owner follows), NOBODY and the existing profile-count visibility setting. Private
choices are fetched after owner verification, not included in guest props.
Uncertain saves freeze exact retry input; conflicts retain selected input and
show the saved choices separately before explicit replacement.

`/platform/relationships` is an account-private paginated library for Following,
Favorites, Muted/Snoozed, Blocked and Churches. The URL preserves the validated
view and page cursor across Back/sign-in. It renders only server-returned target
labels, including the service's unavailable-target case. Restore/unfollow/
unfavorite/unblock reuse the same controls. Unblock does not restore follows.
No public relationship list, notification delivery or permission change is added.
