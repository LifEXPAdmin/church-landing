# Native comment reading, publication and Likes

The versioned `GET /api/platform/v1/posts/:postId/comments` adapter calls the
same `readComments` service as the website. It introduces no discussion store,
schema or notification owner. `comments.read`, `comments.create` and
`commentLikes.write` are separate optional capabilities. `comments.write`
remains unavailable for drafts, editing and other discussion controls.

The default view is `roots`, ordered `oldest`; roots also support `newest`.
`replies` requires `rootId`, while `context` requires `commentId`. Replies and
context always use oldest-first order. Mixed selectors, unknown fields, private
drafts and mention suggestions are rejected. A context response preserves its
exact permitted target even beyond the first reply page.

Each page contains at most 20 items, with root, target and pin separately
projected. Signed native cursors wrap the canonical cursor, bind the original
viewer, post, view, sort and selector, and expire after one hour. Continuations
keep the original deadline. A context cursor cannot be transferred to replies;
open the replies view from its first page. Every request rechecks current
permissions. A cursor does not preserve access after withdrawal, blocking or
membership loss.

Native requests use the existing origin/host, version, credential and private
cache controls. A supplied bearer requires its original expected account.
Expired or revoked credentials never become a guest read. The optional strict
identity reaches the canonical permission lock before any projection. Existing
website callers retain their expected-owner argument and behavior.

Available comments expose only approved public author identity, complete text,
timestamps, structure, filtered mentions, current permissions and viewer-bound
reaction state. Hidden reaction totals remain null. Church speech exposes the
church identity, without its underlying publisher. A retained unavailable
parent exposes only structural identifiers, creation time and visible reply
count. Topic restrictions apply to that projection even when a permitted child
keeps the parent in the thread.

Current writers allow up to 1,500 characters, but retained SQL text has no
length constraint. A longer permitted legacy comment returns
`available: true, requiresWeb: true` with only its structural fields. Ordinary
available comments use `requiresWeb: false` and retain complete text, including
empty legacy text. Nothing is truncated or deleted, and other comments remain
readable. The thread-level `requiresWeb: true` keeps comment text, prayer controls,
mention suggestions, private drafts and group read acknowledgements on the
website until their native consumers have separate acceptance. Responses remain
bounded to 2 MiB.

## Comment Likes

`POST /api/platform/v1/posts/:postId/comments/:commentId/like` supports only an
explicit Like or unlike through the separate `commentLikes.write` capability.
Its body contains `mutationId`, `expectedVersion` and boolean `desired`.
The original member must be supplied with the bearer credential. Identity is
checked before the shared `comments` rate bucket and request body, then again
inside `commentCommand`'s existing permission and session lock before receipt
replay. Both path targets become part of the canonical command fingerprint.
The website and native adapter use the same command, versions, operation cap,
permissions and durable notification outbox. No receipt or storage is duplicated.

The response contains only a historical mutation receipt. Re-read the authorized
thread for current Like state, version and visible count. Exact old retries never
restore a state that a later change replaced. A lost response keeps the original
request reference and intended state; a different command needs a new reference.
Post-commit handoff or projection failures remain unconfirmed. Requests are
bounded to 16 KiB and receipts retain the response bound above. Editing,
private drafts, prayer, pins and conversation settings still use the website.

## Direct comment publication

`POST /api/platform/v1/posts/:postId/comments` publishes a root comment or reply
through `comments.create`. Its strict body requires `mutationId`, `content`,
nullable `replyToId`, nullable `authorChurchId` and `mentionIds` (at most five).
It accepts no private draft identity, draft version, owner or operation override.
Publication calls the existing `commentCommand`; it creates no implicit draft,
new storage or separate notification pipeline. Clients must keep unsent text and
the immutable original request until the outcome is known, with bounded local
retention and separate acceptance for any native draft UI.

The shared contract admits raw text up to 3,000 characters so canonical valid
CRLF text is not prematurely rejected. The canonical service normalizes line
endings, enforces its 1,500-character limit before trimming and requires at least
two non-whitespace characters. Raw text stays in the command fingerprint. An
exact retry must retain the same text, target, identity, ordered mentions and
request reference; an equivalent normalized text is a different request.
Native direct publication can replay an identical direct website command, while
the website composer's explicit draft publication retains its own draft fields.

The common native write boundary checks the original owner before body access
and again under the canonical lock, shares the website's comment rate bucket,
and retains current audience, reply, mention and church-speaking permissions.
Replying to a child keeps that child as parent and the canonical top-level root.
Ordinary receipts are historical; Topic and group replay retain their existing
current participation gates. A receipt never proves continuing read access.

The route schedules `advanceCommentFollowers` and, when needed,
`dispatchCommentFollowers` after publication, exactly as the website does.
Existing recipient deduplication, bounded follower batches, private delivery
payloads and delivery-time access checks remain authoritative. A failed handoff
leaves the committed outbox and continuation available to existing recovery.
Local browser acceptance proves interoperability with the website; app UI,
device lifecycle, provider delivery and release acceptance remain separate.

## Verification

`tests/comment-visibility-projection.test.ts` reproduces a restricted Topic root
with a permitted child for guests and the signed-in post owner. The canonical
repair preserves neutral parents, the permitted reply and direct-target denial.
`tests/native-comments.test.ts` covers both root sorts, exact late targets,
cursor binding and expiry, strict identity, unavailable parents, hidden totals,
church speech, legacy text and queued session revalidation.

`node scripts/test-post-workspace.mjs --native-comments` runs those service
checks with relevant social, Topic and resource-conversation regressions, plus
populated upgrade and dump/restore preservation. Use an owned isolated fixture
and the existing machine resource reservation.

`tests/native-comments-http.test.ts` exercises a trusted local HTTPS production
server and compares canonical website/native results. Its fictional fixture is
then consumed by `scripts/qa-native-comments-browser.mjs` to check actual website
rendering, linked children, unavailable roots and interrupted-read recovery.
Retain exact source/build evidence separately from app integration and native
device, security and release acceptance.

`--native-comment-likes` on the same fixture runner adds native Like service
checks and canonical comment notification regressions. The corresponding HTTP
and browser checks compare native changes with the website's existing Like
controls, immutable lost-response retry and current access. A source receipt
does not complete the separate mobile UI or native device journey.

`--native-comment-publishing` adds direct publication, reply structure, raw-text
retry identity, mention and church permissions, session races, rate admission
and existing follower/outbox integration. The HTTP checks cover the production
route over trusted local HTTPS; `qa-native-comment-publishing-browser.mjs`
checks native roots and replies on the actual website, website publication in
native reads, and immutable retry after a lost website acknowledgement.
