# Native comment reading, publication, editing, deletion and Likes

The versioned `GET /api/platform/v1/posts/:postId/comments` adapter calls the
same `readComments` service as the website. It introduces no discussion store,
schema or notification owner. `comments.read`, `comments.create`, `comments.edit`,
`comments.delete` and `commentLikes.write` are separate optional capabilities.
`comments.write` remains unavailable for drafts and other discussion controls.

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
bounded to 16 KiB and receipts retain the response bound above. Private drafts,
prayer, pins and conversation settings still use the website.

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

## Comment corrections

`POST /api/platform/v1/posts/:postId/comments/:commentId` supports text and
mention corrections through the independent `comments.edit` capability. Its
strict body contains only `mutationId`, `expectedVersion`, raw `content` and
ordered `mentionIds` (at most five). The path fixes both targets. Speaker,
audience, reply structure, private draft and operation overrides are rejected.
The raw text allowance and canonical 1,500-character normalization rule match
direct publication. Keep every original field for an exact retry.

The adapter calls the existing `commentCommand` under its exclusive permission
gate. A new correction requires a current readable source and comment, the
personal author or current speaking-church publisher, the current version and
reply permission. It preserves identity, audience and structure, then records
the new version and Edited timestamp. A conflict leaves the text untouched.
Original-account checks apply before body admission and inside the session lock,
including receipt replay. The shared website comment rate bucket still applies.

An ordinary exact receipt can acknowledge an earlier edit after later changes or
access loss without reapplying it. Topic and group receipts retain their current
participation gates. Always read current state and permissions separately;
a historical receipt grants no continuing access or editing authority.

Canonical mention eligibility, active flags and per-comment recipient intents
remain authoritative. Removing and re-adding a mention does not create a second
alert. Edits do not start publication follower jobs. Like the website edit route,
the native route schedules `dispatchNotifications` with the comment ID after
success, including exact retries. Post-commit handoff or receipt projection
failure remains unconfirmed; retry the same immutable request.

A different current church publisher may correct a church comment and select a
new mention. The canonical mention intent retains that editor as its actor;
the comment and Activity display retain the speaking church. Source resolution
admits this actor difference only for an active mention with the exact immutable
mention intent. Recipient blocks and followed-person consent apply to the editor,
and current source access and church mutes still apply. It does not grant reply,
prayer or follower notification authority or backfill old missing alerts.

## Comment deletion

`POST /api/platform/v1/posts/:postId/comments/:commentId/delete` uses the independent
`comments.delete` capability. Its strict body contains only `mutationId` and
`expectedVersion`; both targets are fixed by the path. It accepts no text, speaker,
draft, owner or operation override. Original-account admission, the shared
comment rate bucket and the canonical session lock apply exactly as for other
native comment writes. The adapter calls the existing `commentCommand` and
creates no separate storage, receipt or deletion authority.

A new deletion requires a currently readable source and comment, the personal
author or current speaking-church publisher, and the current comment version.
Closing a discussion does not by itself prevent its author from removing a
comment. Canonical deletion retires mentions, Likes, a matching pin or selected
answer, preserves replies beneath a neutral unavailable parent, and increments
the existing versions once. Ordinary removed text is cleared; text retained for
a report stays behind the canonical deletion and retention boundaries.

Deletion starts no publication or notification jobs. After the command commits,
the adapter awaits the website's existing `protectReportedWithdrawal` recovery
step, including on an exact retry. A confirmed receipt returns HTTP 200 with
`recoveryPending: false`. If removal is saved but recovery protection is still
pending, it returns HTTP 202 with `recoveryPending: true` and the same warning as
the website. A 202 receipt confirms the removal, not completion of the recovery
step. Keep the immutable request reference and retry that exact request to check
protection without deleting twice; do not generate a fresh delete command.

Ordinary and Topic exact receipts remain historical even after later access
changes. Group receipts retain the canonical current read-access gate. These
receipts expose no removed text and grant no continuing read or write access.
Read current authorized state separately, and preserve the original expected
account through every retry. Native app confirmation, warning presentation and
lifecycle recovery remain separate consumer acceptance work.

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

`--native-comment-editing` adds correction permissions, versions, raw retry
identity, mention deduplication, original-owner races, shared quotas and current
Topic/group replay gates. It also runs affected publication and Like regressions
and canonical notification tests. `native-comment-editing-http.test.ts` and
`qa-native-comment-editing-browser.mjs` exercise the production adapter and actual
website editing, conflict and lost-acknowledgement controls. Keep their exact
local evidence separate from native app, physical-device and release acceptance.

`--native-comment-deletion` adds author and church authority, versions, once-only
retirement of related rows, surviving replies, reported withdrawal recovery,
original-owner races, shared quotas and the distinct Topic/group replay rules.
It also runs existing withdrawal, read, edit, Like and notification regressions.
`native-comment-deletion-http.test.ts` checks trusted local HTTPS, strict
transport admission, website/native receipt parity and pending journal repair.
`qa-native-comment-deletion-browser.mjs` checks the website's confirmation,
cancel, immutable lost-acknowledgement retry and neutral-parent rendering. Test
definitions alone are not acceptance; retain the exact checks actually run and
their source/build evidence in the private handoff.

The 8 October 2026 deletion checkpoint passed 50 isolated database service and
regression checks, four trusted local HTTPS checks, and all four actual website
browser scenarios above. It also passed semantic types, the production build,
17 contract/admission checks and 99 portable/shared-package checks. Browser
verification used the same production bundle; selector and acknowledgement-wait
repairs affected only the test driver. The private handoff retains failed test
attempts alongside the passing results and exact source/build identities.

These results cover a fictional local database and website/native API parity.
They do not accept native app confirmation or recovery UI, physical devices,
provider delivery or a release. This adapter branch also needs integration with
the current website dependency/security baseline before release acceptance.
