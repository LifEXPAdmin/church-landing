# Private post workspace and community search

11 September 2026 · Foundation contract for focused interface implementation.
This is a service implementation, not a completed draft/collection/search interface
or a production receipt. Keep the parent integration acceptance open.

## Entry points

- `GET/POST /api/platform/post-workspace`: `post-workspace-boundary.ts`,
  `post-workspace.ts`; session-owned private work, no-store, noindex, Cookie vary.
- `GET /api/platform/search`: `community-search.ts`; current permitted community
  sources, no-store, noindex, Cookie vary, no total-count inference.
- Migration `20260911160000_private_post_workspace` adds four tables. Existing
  account/post content remains unchanged. Account export includes active owner
  drafts, collection names and saved organization, excluding source content,
  publication keys and retry receipts.

## Draft and saved-item write protocol

POST JSON from the canonical origin, with the existing session cookie. Ownership
comes exclusively from the locked, revalidated session. Never send an owner ID.
Every operation includes a stable `mutationId` (UUID recommended, maximum 80
letters/digits/underscores/hyphens) and `expectedVersion`. A new object uses 0.
An exact retry repeats the same entire body and mutationId. Changed work uses a
new mutationId and the acknowledged version. Successful responses contain
`id`, `version`, `message`, and only for publication, `postId`.

| Operation | Other fields | Resulting behavior |
| --- | --- | --- |
| save-draft | id, payload | Create or atomically replace the owner's complete snapshot; increment version |
| delete-draft | id | Clear content and retain a tombstone; delayed saves cannot recreate it |
| publish-draft | id, optional linkReceipt/keepLinkPreview | Validate current post, church and event permissions; publish and clear draft atomically |
| create-collection | id, name | Create a private collection |
| rename-collection | id, name | Rename at the acknowledged version |
| delete-collection | id | Move saved items to unfiled and increment their versions; retain a cleared collection tombstone |
| save-item | postId, optional collectionId | Save a currently readable post once per owner; return saved item ID |
| move-item | id, collectionId or null | Move the owner's saved item |
| remove-item | id | Remove the owner's saved item even when its source is unavailable |

Exact successful retries return the original receipt without repeating a write.
A different body with the same retry key returns 409. Publication uses a hidden
server-generated request key, independent of a caller-chosen draft ID.
Receipt responses retain identifiers and generic messages, never draft text,
collection names, excerpts, link-preview credentials or thumbnails.

Payload fields: `content`, `scripture`, `type`, `topics`, `audience`, `replyAudience`,
`authorChurchId`, `audienceChurchId`, `eventOccurrenceId`, `linkUrl`. Types use
existing PlatformPostType; topics use POST_TOPICS (up to five distinct values);
audience is PUBLIC or CHURCH. Null/empty optional references are accepted.
Incomplete and whitespace-only text is preserved exactly. Draft limits are 20,000
content characters, 1,000 scripture characters and 2,048 URL characters; these
recovery limits do not relax canonical publication validation (3–3,000 content,
120 scripture). Nothing is silently shortened. Unknown payload fields fail 400.

### Reply permissions and older snapshots

`PrivateDraftPayload.replyAudience` is `VIEWERS | CHURCH_MEMBERS | null`.
Both explicit modes survive complete snapshot saves, single/list reads, retries,
version conflicts, resume and atomic publication. Publication still revalidates
current church membership, church publishing grants and linked event access.
`CHURCH_MEMBERS` may be saved before selecting a church, but cannot publish until
the canonical post service accepts that church and the current actor's access.

Older snapshots omitted the field, so their original choice cannot be recovered.
Missing/null means **unresolved**, never `VIEWERS`. Private reads project `null`
without rewriting stored JSON, timestamps or versions. Old save bodies remain
accepted and store `null`; explicit null also permits saving incomplete work.
A complete replacement save that omits the choice likewise becomes unresolved.
Other values fail 400. No database migration, permission inference or backfill
is performed. Existing account exports retain the stored snapshot as recorded.

Publication of an unresolved draft returns 400 with instructions to choose who
may reply and save first; no post, tombstone, version increment or successful
receipt is written. This check runs both before link preparation and inside the
locked publishing transaction. The composer must display an unselected choice
for null, preserve it through conflict recovery/resume, and require deliberate
selection before publishing. Never replace missing/null with a form default.
Save the explicit choice using a new mutationId and the acknowledged version,
then publish that new version. Future autosave/resume UI consumes this contract.

Retry fingerprints continue to cover the original complete request body, before
payload normalization. An old successful retry returns its existing receipt
without changing the draft, even after newer work or publication. Adding null,
adding/changing the reply mode, or otherwise changing the body with that key
still returns 409. Do not normalize a queued retry body during an app update;
fetch the latest snapshot separately when resolving a conflict. Completed
publication receipts remain replayable without republishing or changing access.

Do not persist a short-lived link receipt or preview object. The current composer
must explicitly separate those ephemeral fields. Renew the preview before
publication if desired; otherwise publish the URL without preview. Rich image,
poll, volunteer and scheduled-draft payloads are not covered by this contract.
Those remain explicit parent acceptance/future foundation work, not silently
saved partial snapshots. Existing published media/poll controls remain available.

Limits: 100 active drafts, 100 active collections, 2,000 saved items per owner;
collection names 1–80 trimmed characters. The private workspace limiter permits
240 POST attempts per owner per 15 minutes independently of password/publishing
limits. Debounce saves at least five seconds, serialize them, and send only after
changes. Retries count toward the budget. At 20,000 durable operation receipts,
further new mutations return 429 pending a storage review; previously successful
retries still work. Do not delete receipts/tombstones casually to bypass this
limit; retention and compaction need a separate reviewed contract.

## Private reads and conflicts

GET views: `draft&id=…` returns `{draft}` (null if not owned/active);
`drafts`, `collections`, and `saved` return `{items,nextCursor}` with at most 20
items. Pass `after=nextCursor` to advance in ascending opaque ID order. Saved
supports `collectionId=…` or `unfiled`; omit it for all items.
`saved-status&postId=…` returns only the owner's item ID, version and collection.
No private list is serialized into guest page props.

Draft rows include id/version/payload/createdAt/updatedAt. Collections include
id/version/name/timestamps. Saved rows include id/version/collectionId/available.
An available row includes its currently readable post ID, 300-character excerpt,
type, publishedAt and canonical href. An unavailable row includes no post ID,
former excerpt, thumbnail or source-specific explanation. Recheck on every read;
bookmark possession grants no access. Source deletion keeps a content-free item
which the owner can remove. Re-fetch saved rows after deleting a collection.

400 = unsupported/oversized input; 401 = session gone; 403 = origin/current action
not permitted; 404 = unavailable owned object/source; 409 = version/key conflict;
429 = rate/storage limit; 503 = transient failure, with sanitized messages.
The interface keeps the unsent snapshot on every failure. On 409 fetch the latest
owner snapshot separately, explain which copy is saved, and offer deliberate
reload or Save as new draft with a new ID/version 0. Never overwrite the current
textarea, silently bump expectedVersion, or retry a changed body with the old key.
On account switching, erase displayed private results and abandon pending work
for the previous account; do not transfer its unsent contents to a new account.

## Community search

Query: `q` (trimmed, maximum 200), `kind` (posts default, people, churches, events,
topics), optional `topic` (posts only), `churchId` (posts/events only), `after`.
An empty query returns no results except an explicit post topic filter.
Response: `{kind,query,items,nextCursor}`; maximum 20 items, ascending ID order.
The opaque cursor binds the query/category/filters, not authorization. Changed
filters with an old cursor return 400. Authorization is rebuilt for every page.
Do not use the cursor as a bearer credential or infer a total from page size.

- Posts: current postReadableWhere before pagination; excerpt/type/topics/date and
  canonical href. Withdrawn/scheduled/private/unavailable-event posts stay hidden.
- People: active author labels only (name/username), profile href and
  requiresSignIn; no email, bio or private directory details. Profile pages keep
  their existing sign-in requirement.
- Churches: public listing name/city/region and canonical church href. A church's
  communityListed flag is not a new access control for its public reference page.
- Events: published active church calendar occurrences, current PUBLIC/CHURCH
  permission, excluding private personal calendars and canceled/archived sources;
  title/timezone/start/end and actual occurrence href.
- Topics: explicit public vocabulary matches and a `{kind:'posts',topic}` filter
  action. These are not counts or disclosures inferred from hidden posts.

Text matching escapes SQL LIKE wildcards. No prayer intake, directory contacts,
claim proof, raw files or unimplemented Exchange/media types are searched.
Existing Explore currently keeps its old UI; the Medium search task consumes this
contract and owns URL-preserved category/filter/page controls. Block/mute,
recommendation and advanced ranking contracts remain their owning future tasks;
apply any subsequently shipped global access predicates before releasing them.

## Focused implementation order

Ready on this foundation: composer save/conflict states; private collection
management; standalone draft library/discard; post save/remove button; typed
community search results; manifest wiring from the installation policy.
Follow-on Medium slices: composer resume entry after the save controller; search
filter/pagination polish after typed results; installation help after manifest;
update notification after draft dirty/saving/conflict state is wired.
Use one shared composer controller rather than separate autosave implementations.
Keep the final integrated review last, including rich post acceptance, account
switches, source revocation, phone/desktop navigation and production identity.

## Validation entry point

`npm run test:post-workspace` starts an isolated loopback PostgreSQL instance,
applies all migrations, verifies a populated additive upgrade, exercises workspace
and canonical post/search services, dumps/restores populated workspace tables and
constraints, and stops the database. It cannot point at production. Installation
contract tests use `node --import ./tests/register.mjs --test tests/install-policy.test.ts`.
Build/runtime trace and actual local HTTPS checks are recorded in CURRENT_STATE.

## Shared composer controller

The platform layout owns one in-memory draft controller across client navigation.
It debounces changed snapshots for at least five seconds and serializes writes.
Saving and Saved privately reflect actual requests and acknowledgments. Failed
requests retain their exact serialized body and mutation ID; later edits remain
unsent until that request is resolved. An uncertain publication freezes editing
until its exact retry resolves. No snapshot or receipt enters browser storage.

Conflicts show the latest saved copy separately. Replacing current entries is an
explicit action; Save as new allocates a new ID at version zero. Session changes
clear the controller and pending requests. Hidden or unverified sessions conceal
private contents. Dirty, saving, conflict and retry state protect navigation and
are available to the update notice. Legacy unresolved reply permissions remain
null through reload and require a choice before publication.

Controller verification: `node --import ./tests/register.mjs --test
tests/draft-controller.test.ts`; isolated HTTPS browser verification:
`scripts/qa-draft-controller-browser.mjs <fixture-directory>`.
