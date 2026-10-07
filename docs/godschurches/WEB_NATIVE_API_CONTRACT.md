## Core read adapter implementation, 7 October 2026

The selected capabilities/feed/post/profile/church adapters now reuse the
canonical service transactions. [Native core reads](NATIVE_CORE_READS.md)
describes strict owner binding, explicit audience, privacy projections and signed
pagination. Their local implementation does not establish deployment or device
acceptance. Generic `state: "contract-only"` descriptors remain schema metadata;
consult the actual capability endpoint after release for implemented operations.

# Shared website and native API contract

The local native authentication adapter now implements session discovery plus
password, activity/logout and authenticator routes. See
[NATIVE_SESSION_ADAPTER.md](NATIVE_SESSION_ADAPTER.md) for exact transport,
verification and deployment status. The remaining read/write adapters below
remain planned. The `contract-only` schema marker describes declarative
definitions; it is not runtime capability or deployment evidence. Clients must
use the specific implemented adapter receipt and eventual capability response.

This initial contract is ready for adapter implementation. It does not activate
new routes, native sign-in, capabilities or website behavior. The canonical
runtime schema and inferred TypeScript exports are in
`lib/platform/api-contracts.ts`; reviewable fictional responses and commands are
in `lib/platform/api-contract-examples.ts`. No generator, dependency, package
move or new service is required. The existing server-rendered website continues
to call its services directly.

## Inspected source and ownership

The service/consumer map below is bound to application
`caeff5d12f689308d40f5df2193e8f5dbb2ffb9a`, documentation handoff
`6c4f73d6b8af267cf63ccab3d3003b43ebe7d080`. Reviewed main was
`320396d496433611fa008a1a1f3148379195dd52`. The continuation contains newer local
search, calendar capacity, Needs privacy, profile featured resources, recruitment
conversations and reaction-count work. These are local handoffs, not evidence of
integration or production acceptance. Media playback still has provider gates.
The selected contract reuses their service projections and does not reactivate
held artist/music or dependency work.

Mobile workspace, framework spike and consumer reconciliation are still planned
in the private source records. This contract precedes those implementations;
native consumers must reconcile the same contract, not create a second server
specification. Authentication adapters, core read adapters, package extraction,
community write adapters, media, push, navigation and compatibility activation
have separate implementation owners in the private queue. No other current claim
overlapped this contract slice at selection.

## Endpoint, service and consumer map

All paths below have the proposed prefix `/api/platform/v1`. Every schema registry
entry is `contract-only`. A registry entry or resource kind never grants access.

| Proposed operation | Current authoritative service | Existing website transport/consumer | Adapter gap |
| --- | --- | --- | --- |
| GET `/capabilities` | Explicit service activation and compatibility policy | `resource-contracts.ts`, `settings-contract.ts`, `navigation-registry.ts`; release endpoint is only release identity | Add an allowlisted availability projection; never return grants or treat the website version as protocol support |
| GET `/session` | `withOwnedSession`, `readAccountSession`; session policy/rotation | Profile `view=identity` returns only `{id}`; `currentSocialOwner` and `SessionActivity` | Native credential verification and a minimal owner-bound envelope; no token in this DTO |
| GET `/feed` | `feed-reads.ts:readFeed` through its session-bound transaction | `post-session.ts:readHomeFeed`, `HomeFeedPage` | Existing `/api/platform/feed` only writes a preference; expose a safe read projection |
| GET `/posts/:postId` | `post-reads.ts:getPost` and current repost/resource policies | `post-session.ts:readPost`, post detail page, `PostCard` | Existing posts GET goes through `post-boundary.ts` editor/composer/availability branches; it is not this detail contract |
| GET `/profiles/:username` | `profiles.ts:getMemberProfile` | `profile-session.ts:readMemberProfile`, member profile page | Members only; current `view=member-snapshot` returns a revalidation digest, not the profile body |
| GET `/churches` and `/churches/:churchId` | `portal.ts:publicChurches`, session-bound `getPortalSnapshot` for member context, `post-reads.ts:getChurchPostFeed` | `PortalPage`, `readPortalPage`, church discovery/detail pages | Explicit public listing projection; never serialize the complete portal snapshot, directory or operator fields |
| GET `/posts/:postId/like` | `post-likes.ts:readPostLike` | `/api/platform/post-likes`, `PostLikeControl`, `socialRequest` | Current GET ignores expected-account and has no response owner; new adapter must establish the actual reader atomically |
| POST `/posts/:postId/like` | `post-likes.ts:postLikeCommand`, `social-operations.ts:socialCommand` | Same browser route/control | Require expected account and bind it inside the command transaction; derive `postId` from validated path, never body actor fields |
| GET/POST `/reaction-preferences` | `reaction-preferences.ts:readReactionPreferences/saveReactionPreferences` | `handleReactionPreferences`, `ReactionPreferences` | Reuse required original-owner checks and recovery receipt; adapt credentials and envelope only |

The legacy `/api/platform/session` has a different purpose: activity GET returns
`owner`, `legacy`, `deadline`, `absoluteExpiresAt`, `serverTime`; POST accepts only
`{activity:"foreground"}` with a required expected-account header and trusted
Origin. Reads never renew. The account POST handler contains multiple unrelated
operations. Browser login sets cookies, and logout is a Server Action. Neither
handler should be exposed wholesale as the native contract.

## Wire representation and bounded projections

The schema is the maintained field allowlist, including exact nullability and
size bounds. `encodeApiResponse` rejects unknown fields, including nested row
spreads. It must receive an explicit projection from an already authorized service.
`decodeApiResponse` strips additive fields, validates required data, and requires
the original expected viewer. `decodeApiSession` is only for initial identity
discovery; it must not rebind an existing draft. The helpers validate shape and
identity consistency; they do not authenticate, authorize, read storage or infer
permission from client flags.

- Success is `{apiVersion:"1",viewerId,data}`. `viewerId` is the actual session
  reader or `null` for a true guest, established in the same authorization scope
  as data. Members-only results cannot have a null viewer. Owner preferences and
  their receipts must match that viewer. Guest posts have null own-reaction data.
- IDs are opaque case-sensitive strings, up to 100 ASCII letters, digits,
  underscores or hyphens. Usernames retain the existing 3 to 24 character format.
  Never interpret IDs as authority or assume UUIDs. Date values are canonical
  UTC ISO strings with milliseconds. Missing data uses explicit `null`, not
  fabricated zero, empty objects or omitted required fields.
- Feed pages contain at most 30 posts, profile/church post pages 30, church
  discovery 100. Preserve the existing feed service page size and cursor boundary.
  Transport adapters enforce 16 KiB request and 2 MiB response
  byte limits as well as schema limits. Reject or reduce a server-selected page
  before emission; do not truncate a member's text or leak partial JSON.
- A post includes the safe author identity, current authorized text/link fields,
  content note and safe excerpt, timestamps, counts and its caller's own reaction.
  A church author exposes the church identity only, never the underlying personal
  publisher. A hidden total stays null throughout feed, detail and nested repost
  source. An unavailable source stays null without retaining its body or author.
  A receipt cannot substitute for the current projection.
- Native rendering must retain the existing content-note reveal choice and use
  the safe excerpt for previews. Treat text as text; use the existing safe link
  validation before opening a URL. Do not interpret HTML from wire fields.
  `requiresWeb` is selected by the server when full media, resource, prayer or
  other interactions are not represented by the initial native contract. Preserve
  a clear website handoff instead of pretending those interactions are complete.
- Member profiles are not guest-readable. Use the authorized member projection,
  with hidden location and relationship totals still null. Do not serialize
  location audience/recovery flags, preference objects, email, private role or
  account security data. This first read does not expose editor/presentation/media
  internals; preserve the website handoff for omitted modules.
- Church listing/detail fields are public listing data and bounded readable
  posts, plus up to three separately projected pinned notices from the canonical
  church feed. Preserve pins separately from unpinned pagination. Representative
  verification does not mean software permission. Keep
  membership records, directory consent/contact data, review queues and operator
  grants out of these DTOs. Omitted listing modules use the explicit `requiresWeb`
  handoff on the detail response.

Wire queries are normalized into their explicit schema fields before parsing:
omitted cursors/scopes become null; omitted church search becomes an empty string;
omitted feed mode becomes latest. Reject unknown or duplicate HTTP query keys,
GET bodies and invalid path parameters. Search accepts no more than 100 characters
before the existing normalization. Never silently truncate oversized native input.

All cursors are opaque, bounded and URL-safe. Retain the feed's signed scope,
snapshot and current-access behavior. A client never decodes, constructs or
changes a cursor. Profile and church adapters must wrap legacy date/ID pagination
in a signed cursor bound to endpoint, viewer, target, filter and expiry. Do not
expose the current raw row-ID continuation as a cross-resource bearer permission.
Invalid, expired or mismatched cursors yield `cursor_invalid` with a refresh hint.
Refreshing a reading set does not discard a pending write or draft.

## Identity, session and credential boundary

Native sign-in/issuance, refresh/activity, revocation, secure storage and logout
remain the authentication-adapter task. No credential mechanism is enabled here.
Do not remove browser Origin/CSRF/cookie checks to make native requests succeed.
Use a separate deliberate native transport, with no query-string credentials and
no fallback from an invalid supplied credential to public data. Native tokens must
reach the existing session authority, expiry, revocation, credential-version and
account-state gates. Native OAuth needs its own reviewed redirect/PKCE lifecycle;
the browser Google callback is not already that adapter.

For v1 authenticated reads and writes, require `X-Expected-Account` and compare it
with the current verified session inside the service's authorization transaction.
Initial session discovery is exempt. A guest request supplies neither credentials
nor the header. Reject conflicting credential sources rather than choose one.
Expected-account is a race guard, not authentication. Check the original request
generation again on receipt; never display A's result in B's interface.

Use `withOwnedSession`/`withAccountRead` and the canonical service entrypoints.
Never call `postContext(tx, suppliedUserId)` or internal `...In` helpers from an
unbound transaction. Some unbound service contexts intentionally support background
authority; using them for native clients could bypass session-bound MFA projection
restrictions. Privileged grants and purpose-bound challenges stay server-owned.
Ordinary Likes and count preferences do not themselves require privileged MFA.
A challenge hint is an instruction to verify, not a grant or proof.

Every private or viewer-sensitive response, including errors, uses private
no-store browser/CDN headers and varies by the selected credential transport plus
`X-Expected-Account`. No shared CDN cache or public persistence for these results.
Keep credentials, secret hashes and internal exceptions out of DTOs and logs.

## Selected writes and recovery

Like body: `{mutationId,expectedVersion,desired}`. Preference body:
`{mutationId,expectedVersion,hideAuthoredReactionCounts}`. Mutation IDs retain the
existing 1 to 80 character alphabet. Versions are nonnegative safe integers with
room for an increment. Body actor/owner/church fields are rejected. The adapter
adds the validated path post ID to the existing Like command input.

Canonical idempotency is account plus operation domain plus mutation key. The
server fingerprints sorted JSON. Clients retain the original body bytes, target,
owner, operation key and version through blur, network loss and account switches.
Changed work under the same key conflicts; do not generate a new key to retry an
uncertain mutation. A new valid session for the same account can retry after
revalidation; old MFA proof does not transfer to that session.

The existing receipt is exactly `{id,version,message}`. Plain repost Like IDs can
resolve to the current source. A successful historical replay does not reapply a
change or prove current permission. Ordinary Like replay does not repeat every
source-access check; group/topic restrictions have additional replay checks.
Require a fresh canonical read and exact receipt/target/version reconciliation
before announcing current success or clearing pending work. Preserve a later
conflicting choice. The preference service can commit and then return 503 when
its protected recovery receipt needs confirmation. HTTP errors, cancellation and
timeouts never universally mean that no write occurred.

Browser-local viewer hiding is separate from the persisted personal-author
preference. Do not apply a personal operator's choice to church-authored content.
Recovery-required preferences remain hidden until explicitly reviewed and saved.
Rollback must retain these privacy projections and the recovery journal.

## Errors and compatibility

The new error envelope is `{apiVersion:"1",error:{code,message,retryAfterSeconds}}`.
`apiErrorRules` is the stable status/action vocabulary: validation 400,
unauthenticated/account_changed 401, forbidden/authenticator_required 403,
not_found 404, conflict/cursor_invalid/recovery_required 409,
unsupported_version 426, rate_limited 429, feature_unavailable/unconfirmed 503.
Messages are safe human summaries, never machine-parsed. Retry hints are null or
bounded whole seconds, only for rate-limited/unconfirmed outcomes; the HTTP
`Retry-After` header agrees with the body. `unconfirmed` means reconcile original
work, not blindly retry. Unknown/non-JSON errors remain unconfirmed client failures.

These codes are a new adapter contract, not a claim that legacy services already
share error codes. Map known typed causes at their source, never English message
matching. Until a cause is classified safely, use an appropriate generic denial
or unconfirmed result; do not mislabel a permission denial as a retry. Malformed
v1 wire values are 400; a valid but stale expected version is 409. Legacy commands
also use 409 for some malformed versions; their current behavior is unchanged.
Privileged native challenge payloads are specified with their owning auth task.

Path major versioning is deliberate: incompatible changes get a new `/vN` path;
`apiVersion` repeats the selected major, and no optional header silently changes
behavior. V1 is the sole specified major and is not yet deployed. Additive response
fields and capability names can be ignored by older consumers. Do not add a new
required field, change a type/null meaning, or emit new required enum semantics
to an old major. Unknown required semantics fail closed. New request behavior
requires an advertised implemented capability; capability membership is never
authorization. Missing features mean unavailable. Unimplemented examples advertise
false and must not become enabled configuration.

Before enabling a replacement major, record affected released client versions,
owner, dates and a migration/deprecation window in the existing compatibility task.
Keep the prior major until its installed-client acceptance is complete; no invented
automatic expiry, forced reload or silent draft loss. Emergency security withdrawal
still requires an explicit safe unsupported response and recovery path. Existing
web routes remain supported independently. Rollback can disable new capabilities
without deleting data, receipts, schemas or restoring unsafe projections.

## Verification boundary

Pure contract checks cover explicit field allowlists, original-viewer consistency,
private-owner mismatch, hidden counts, missing/unavailable data, forged actor fields,
unsafe versions, opaque cursor/date bounds, finite pages, additive compatibility,
unknown semantics and uncertain error behavior. The examples compile against the
same inferred contract types. A separate no-DOM compile/import check verifies this
small boundary; it is not a claim that the entire website is platform-neutral.

Later adapter acceptance must exercise actual HTTP, database and client flows:
owner switching during reads/commands, source withdrawal, replay after later state,
cookie/native revocation, read-only activity, MFA denial, cursor tampering, protected
restore, response byte limits and browser regressions. Reuse existing account,
post reader, Like, reaction-count, profile and portal tests. No full production
build, native simulator, store, device, provider or deployment acceptance is
implied by contract tests. No existing route or service imports this new module.
