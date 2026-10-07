# Native direct text publication

The native `POST /api/platform/v1/posts` adapter calls the existing `postCommand`
and its `post-create` receipt. It creates one canonical post and no implicit
private draft. The website composer continues using its saved draft publication
flow; its resulting posts use the same readers, permissions and notifications.
This adapter does not supply a native composer or establish device readiness.

## Admission and supported input

Use the native bearer credential, `X-Expected-Account` and supported API version.
Browser authority, query fields, unsupported methods and unrecognized JSON
fields are rejected. Credentials, version and the optional `posts.create`
capability are checked before consuming a body or charging publication work.
The early session check precedes the existing `posts` transport rate bucket.
An independent canonical activity budget still applies to new publications.
`posts.write` remains unavailable.

Every body field is required, including deliberate empty or null choices:

| Field | Meaning |
| --- | --- |
| `requestKey` | Original canonical request reference, at most 100 letters, digits, underscores or hyphens |
| `content` | Text normalized by the canonical service, 3 to 3000 characters |
| `contentNote` | Optional text represented by an empty string, at most 120 normalized characters |
| `safeExcerpt` | Optional preview text represented by an empty string, at most 160 normalized characters |
| `scripture` | Optional reference represented by an empty string, at most 120 normalized characters |
| `type` | A canonical post category |
| `topics` | Up to five different canonical topic choices, with their original order retained |
| `authorChurchId` | Current approved church publisher identity, or null for personal authorship |
| `audienceChurchId` | Current connected church for sharing, or null |
| `audience` | `PUBLIC` or `CHURCH`, consistent with the selected church |
| `replyAudience` | `VIEWERS` or `CHURCH_MEMBERS`, consistent with the selected church |
| `allowReposts` | Explicit boolean choice |

The wire permits doubled raw text lengths to preserve CRLF input before canonical
normalization. The complete request still has the shared 16 KiB byte ceiling.
Canonical limits reject oversized normalized values without truncating them.
Church authority and audience combinations are validated by the existing service.

Photos, mentions, linked resources, group and Topic destinations, event links,
link previews, scheduling, reposts, edits, withdrawal and private draft controls
are outside this endpoint. They cannot be smuggled in through additional fields.
Do not pass `mutationId`, `operation`, `authorId`, a draft ID or a version.

## Ownership and retries

The command accepts an optional original account identity. When supplied, it
checks that identity inside the existing session transaction before both new
work and receipt replay. It checks again after any outside-transaction link
preparation. Existing website callers that omit this argument retain their
existing command contract.

Retain the exact original request key and JSON values until the result is
confirmed. Do not normalize text, sort topics or replace explicit choices while
retrying. Concurrent exact retries return the same receipt without a second post,
publication audit or notification job. Reusing a key with changed values conflicts.
Older canonical posts without a fingerprint retain the existing legacy behavior.

The result contains only `id`, `version` and `message` in an envelope bound to the
original viewer. It acknowledges historical publication and is not the current
post. Reload the native post reader before displaying current content or access.
Current canonical authority still precedes replay: withdrawal or loss of church
publisher authority can deny a previous creation request. A retry never revives
withdrawn content.

An unconfirmed response preserves the original request for exact retry. An
account change requires the original account; it must not replay under a new
account. The route resumes the existing domain activity and publication handoffs,
including on an exact retry. Durable fanout and source visibility remain owned by
the canonical notification services.

All responses retain private no-store headers and native version metadata.
No cookies, redirects, browser CORS authority, new tables or new outboxes are
introduced.

## Verification and integration

The original-owner regression is exercised before and after the command change
with isolated fictional accounts, including a session change after link
preparation. Focused tests cover admission, strict input, current church authority,
mid-request session changes, shared transport limits, raw retry fingerprints,
historical receipts, withdrawal and canonical author-bell fanout.

Run the pure contracts and capability tests with the existing TypeScript test
loader. `node scripts/test-post-workspace.mjs --native-post-publishing` selects
the native publication suite and affected website, quota and notification checks
inside the existing isolated migration and restore fixture.

`tests/native-post-publishing-http.test.ts` verifies the built native and website
direct endpoints over trusted local HTTPS. It seeds the fictional fixture used
by `scripts/qa-native-post-publishing-browser.mjs`, which exercises the actual
website composer, a committed response lost in transit, byte-identical retry,
canonical native reading and withdrawal at narrow viewport sizes. The website
composer has its own saved draft receipt and is not claimed to send the direct
native JSON body.

Save exact source, build, test, browser and final review receipts in the private
task history. Combine compatible reviewed branches before integration checks.
Native UI and physical device acceptance, hosted CI, security, staging, provider
configuration and release approval remain separate gates.
