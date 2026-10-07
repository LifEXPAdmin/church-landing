# Proposed public offline content policy

## Status and decision

This is a proposal for separate owner acceptance. It enables no cache, download,
worker, offline library or background operation. The first proposed capability is
an explicitly saved, small installation and connection-help pack. User-published
resources remain online-only, including resources visible to anonymous visitors.
Policy acceptance must be recorded before implementation; implementation and
actual browser/device acceptance are separate release requirements.

The proposed limits are project decisions, not browser guarantees: one help pack,
at most 256 KiB of decoded content and support assets combined, expiring 24 hours
after a successful online validation. There is no automatic prefetch or refresh.
If these limits cannot be met, keep ordinary online help; do not silently widen
the budget or store a partial pack that claims to be ready.

## Reconciled current source

- `app/manifest.ts` uses the existing installation policy. Installation itself
  does not establish offline reading, a saved account or current authorization.
- `public/notification-worker.js` already exists. It handles push and notification
  clicks, calls `skipWaiting()` and `clients.claim()`, and has no fetch handler or
  CacheStorage access. `lib/platform/push-browser.ts` registers it with root scope
  after deliberate notification setup. The older installation contract's
  no-worker statements describe that earlier feature's changes, not the current
  whole application. Preserve the push owner and its generic notification body.
- `middleware.ts`, `next.config.ts` and `app/layout.tsx` preserve request-bound
  script nonces and no-store document/private boundaries. Do not save live HTML,
  RSC, a personalized shell or a nonce-bearing response as an offline shell.
- `app/platform/actions.ts` delegates logout to `clearPlatformSession`. Existing
  session revocation is not a receipt that future local help storage was cleared.
- [Saved resources](SAVED_RESOURCES.md) store private references and recheck the
  source. Bookmarks are not offline copies. [Media preferences](MEDIA_PREFERENCES_CONTRACT.md)
  and the [native media budget](NATIVE_MEDIA_BUDGET_CONTRACT.md) do not authorize
  downloads or native offline media. This proposal changes none of those owners.

These are source observations, not claims about a currently deployed browser or
physical device. No offline implementation has been tested by this document.

## Allowlist and retention

| Content | Proposed application-managed offline allowance | Lifetime and display |
| --- | --- | --- |
| Owner-reviewed installation and connection-help text, with its minimal generic reader/assets | One explicitly saved, versioned first-party pack; 256 KiB total decoded bytes, at most 16 entries | 24 hours from successful online validation; always show saved time, expiry and offline status |
| Existing public versioned static assets in ordinary browser/CDN HTTP caches | Existing behavior only; no wildcard copy into an application cache | Existing HTTP policy; their presence does not prove any offline feature works |
| Public posts, comments, profiles, church pages, calendars, event/shift details, Exchange items, media, campaigns, maps and resource cards | Zero application-managed offline copies | Current canonical source checks required, even if previously public |
| Private/member directories, prayer/support requests, reports/evidence, messages, contacts, invitations/tokens, drafts, account/preferences/export data and any child content | Zero application-managed offline copies | Never part of the help pack, fallback, metadata, telemetry or retry snapshot |
| Photos, original files, audio/video, provider embeds, third-party pages and signed/provider URLs | Zero application-managed offline copies | Existing deliberate online viewing remains separate |
| Privacy/terms acceptance, emergency instructions, time-sensitive advice and live service availability | No offline authority or acceptance flow | Link to the current online source; do not copy these into the initial help pack |

The help pack is a separate reviewed projection of generic instructions, not a
copy of `/help`, `/platform/getting-started`, `/platform`, `/privacy` or any other
current route. Even `/help` currently contains live feature statements and links;
reuse suitable wording only after review. Exclude real contact details, account
identifiers, provider responses and user content. Exact routes, pack hashes,
MIME types and reader implementation must be reviewed before activation. Missing
entries default to denied; neither anonymous access nor a public metadata label
adds a resource to the allowlist.

Store only the pack version, policy version, approved content digest, validated
time, expiry, latest observed wall time, nonpersonal cleanup/generation fence
and the bounded generic payload. No reading history, account ID,
source IDs, personalized query strings or analytics queue accompanies it. A
download/import/export UI or durable private draft is outside this proposal.

## Save, expiry and failure behavior

Saving requires an explicit user action while online. Fetch only exact same-origin
allowlisted resources without credentials; reject redirects, opaque responses,
non-200 status, unexpected type, unknown digest/version and mismatched lengths.
The server artifact must be independently verified to be account-invariant and
free of session cookies/personalized output; client code cannot inspect HttpOnly
cookies or rely on detecting every forbidden response header. Reject private or
no-store pack responses rather than overriding existing policy. A separate
no-store validation response is consumed in memory, never cached as a Response;
only its bounded public validation fields enter the pack metadata. Check actual decoded
bytes with a bounded stream, not only a declared Content-Length. Save atomically
only after the entire pack passes; quota errors keep the previous valid pack or
an honest unavailable state, never a false success.

The TTL is not extended by viewing, a failed fetch, an HTTP cache hit of unknown
age, a restart or a worker update. Use a successful no-store online validation
with a server-issued validation time and bind it to the exact content/policy
version. Reject inconsistent/future timestamps. At `now >= expiresAt`, hide the
payload and show “Saved help expired. Connect to refresh it.” Keep only generic
expired-state metadata until the next cleanup. No grace period or stale-on-error
fallback may reveal expired content.

Check validity before first paint, on every open and visibility/connection return,
and at the deadline while visible. Purge expired payloads on the next executable
opportunity; suspended browsers cannot promise deletion at an exact wall-clock
instant. Use monotonic elapsed time during a live context and a persisted latest
observed wall time to reject detected clock rollback. Missing/corrupt metadata,
unknown elapsed time or detected clock manipulation requires online validation.
No browser-only scheme proves trustworthy time across every offline restart or
host clock change. The residual limit is acceptable only for generic help, never
authorization, expiry-sensitive private content or a commitment.

The reader must label even an unexpired pack “Saved help; live details may have
changed” and separately show truthful current connection status. Nothing in it
may display signed-in identity or imply current
membership, access, inventory, capacity, availability or a successful action.
Returning online does not automatically submit or replay anything. A link that
leaves the reader requires a connection and then follows the normal current
session/source checks. No RSVP, volunteer commitment, purchase, payment, message,
posting, approval or agreement mutation is queued from the pack.

## Logout, withdrawal and shared devices

The future implementation must clear this feature's permitted caches and metadata
on explicit logout, observed account change/session invalidation, Clear saved help
and policy withdrawal. Conceal any displayed pack first, invalidate the local
generation, then delete only the owned namespace. Broadcast invalidation to live
tabs and fence in-flight downloads so an earlier save cannot repopulate storage
after logout. Close the feature to reads/writes until cleanup is acknowledged;
report a cleanup failure and retry on the next start. Do not claim physical secure
erasure or successful cleanup when storage is unavailable.

Local cleanup must not prevent server logout or claim a remote session was revoked
while offline. The two operations need distinct truthful results. Keep a minimal
nonpersonal cleanup fence if needed; a returning tab must consult that fence
before any pack display. Do not clear unrelated drafts/preferences, unregister
the push worker, unsubscribe notifications or delete every origin cache to clear
this feature. Existing owners remain responsible for their own lifecycle.

A remotely withdrawn help version is hidden and removed when a current validation
observes withdrawal; an offline device cannot receive an immediate revocation
guarantee. Its normal 24-hour deadline still applies. This unavoidable delay is
why revocable user content, child content and sensitive material have zero
allowance. Current access is always decided online by the canonical service.

## Worker and update boundary

Do not attach a general cache-first/network-fallback handler to the existing root
push worker or register a competing root worker. A later implementation must
specify exact ownership, narrow routing, storage versioning and migration with
the push/installation owners. The existing push-only `skipWaiting`/`clients.claim`
behavior is not automatically suitable for an offline reader with stored assets.
Activation, old tabs, rollback and abandoned partial packs require explicit tests.
Keep old code and new data from being mixed; unknown versions fail closed.

No arbitrary navigation fallback, cached live nonce, blanket `/_next/` precache,
RSC response, Background Sync, polling, automatic reload, storage-persistence
permission or notification permission is introduced by the proposal. Preserve
the existing dirty/saving/conflicted-work update guard and Data saver behavior.
An expired/missing help pack must never prevent ordinary online app startup.

Application CacheStorage is distinct from the HTTP cache and needs explicit
expiry/deletion logic; updating a worker does not itself remove its stored
entries ([Service Workers specification](https://www.w3.org/TR/service-workers/#cache-objects)).
Retain no-store semantics for current responses
([HTTP Caching, section 5.2.2.5](https://www.rfc-editor.org/rfc/rfc9111.html#name-no-store-2)).
These standards do not provide the application's authorization or logout logic.

## Acceptance before implementation or release

Owner policy acceptance must cover the one-pack scope, 256 KiB/16-entry limits,
24-hour TTL, explicit save, no user resources/private content, deletion semantics
and limited offline clock/revocation guarantees. A later expansion needs its own
source rights, privacy, retention, cost and access acceptance; it cannot inherit
approval merely because this help pack is accepted.

Implementation must then demonstrate the following with the actual reader,
network and owned storage, not just pure allowlist tests:

| Scenario | Required evidence |
| --- | --- |
| Fresh install, normal visit, Data saver, declined save | No application cache or large download without the save action |
| Anonymous and signed-in A/B saves | Byte-identical allowed pack; no credentials, identity, private requests or previews stored |
| Forbidden routes, variants, redirects, errors and oversized/chunked responses | Rejected without partial success or broad fallback; decoded byte/entry caps enforced |
| Exact deadline, sleeping tab, reload, corrupt clock/version/metadata, storage eviction | Expired/unknown copy concealed before use, truthful reconnect state, online app remains usable |
| Logout/account switch/Clear racing download and multiple tabs | Display concealed; no late repopulation; owned storage emptied or cleanup failure visible |
| Server logout failure or offline logout | Local cleanup and server-session outcome reported separately; no fabricated remote revocation |
| Withdrawn help, new release, old tab and rollback | Version compatibility and withdrawal enforced when observed; no immediate offline revocation claim |
| Private route, notification click and unsaved work during update | Current auth/source checks preserved; push still works; no copied private response or discarded work |
| Keyboard, screen reader, narrow/large text and real installed Android/iPhone | Reader/expiry/reconnect/clear controls usable; actual device results distinguished from emulation |

Until that evidence and the separate policy acceptance exist, online-only behavior
and the current push-only worker remain the supported implementation.
