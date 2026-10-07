# Native comment reading

The versioned `GET /api/platform/v1/posts/:postId/comments` adapter calls the
same `readComments` service as the website. It introduces no discussion store,
schema, notification owner or native write operation. `comments.read` is an
optional capability; `comments.write` remains unavailable.

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
readable. The thread-level `requiresWeb: true` keeps writes, prayer controls,
mention suggestions, private drafts and group read acknowledgements on the
website until their native consumers have separate acceptance. Responses remain
bounded to 2 MiB.

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
