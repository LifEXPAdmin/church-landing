# Playlist ownership and private playback progress

## Scope and existing owners

September 19, 2026 candidate, inspected against integrated `1fbcf9f`. This
defines ordered personal/church playlists, private saved media and supported
playback progress. It activates no service, schema, grant, provider or setting.
The canonical `mediaCatalogItem` remains reserved in `resource-contracts.ts`;
there is no implemented playlist or playback-progress owner in this checkout.
Acceptance of this definition is separate from implementation and live release.

Consume [canonical catalog identity and audiences](MEDIA_CATALOG_CONTRACT.md),
[publishing permissions and source policy](MEDIA_PUBLISHING_CONTRACT.md),
[effective player preferences](MEDIA_PREFERENCES_CONTRACT.md) and
[healthy use](HEALTHY_USE_CONTRACT.md). Reuse coherent account/session checks,
current scoped church grants and the strict command/version/retry pattern.
Existing `post-workspace.ts` privately owns saved posts and collections; it
already reprojects saved sources through current post access. Preserve it.
Media saves must reference the canonical media owner, not become fake posts,
image assets, duplicated media metadata or a second source-permission service.

The initial layouts and persistence implementation must include item-access
intersection before exposure. A later integration checklist is not permission
to ship public playlist responses without that boundary. Church delegation,
progress and series continuation remain separately implemented consumers of
this definition. Collaborative personal editors and downloads remain later work.

## Identity, ownership and editing

A playlist has a server-issued opaque identity, optimistic version, one exclusive
owner (`account` or `church`), lifecycle and intended audience. Private creation
actor/edit attribution is separate from public owner attribution. Ownership is
immutable in the first version; another user's supplied ID or credited church
name never establishes ownership. No implicit transfer on account closure,
church withdrawal, editor removal or source deletion.

Personal playlists start as private drafts. The eligible adult owner can create,
edit, publish, unpublish and remove them. Published personal playlists permit
PRIVATE (owner only), MEMBERS or PUBLIC. Church playlists permit CHURCH for
their exact owning church, MEMBERS or PUBLIC, with drafts visible only through
current management authority. PRIVATE is a playlist policy, not a new catalog
audience or permission to publish a draft media item.

Reuse the publishing contract's proposed scoped capabilities when that owner
actually implements them: `EDIT_CHURCH_MEDIA` can create and edit its actor's own
church playlist drafts; `MANAGE_CHURCH_MEDIA` can manage that church's drafts
and published playlists. An editor may choose the intended audience on their own
private draft; only a current manager publishes, widens a live audience or
changes live ordering. Require an activated managed church, approved current
connection and effective duty on every management read, command and receipt
replay. Duty assignment uses the existing explicit privilege/grant owner and
no-self-grant rule. This document adds no duty to a role preset or active enum.

A removed editor loses management access immediately; the church retains its
playlist. A remaining independent valid grant keeps only its own effect. A role
title, follow, prior edit, playlist URL, item credit or platform operator status
does not substitute for a current scoped duty. Playlist management never grants
read/edit rights over underlying media. Recheck both authorities before adding
an item; use published readable media only. Source owners still control source
audiences, rights, withdrawal and playback.

## Ordered membership and private saves

Playlist membership stores only its own opaque entry ID, canonical media ID and
order. One media ID occurs at most once per playlist. Saves are private to the
signed-in account, unique by account plus media ID, and do not publish a playlist
or grant access to a source. Unsaving does not delete source media, playlist
membership or unrelated playback progress. Removing a playlist does not delete
its sources or private saves. Explain these distinct actions in the UI.

Initial implementation bounds: title 1 to 160 trimmed characters, optional plain
description at most 2,000 characters, at most 200 entries per playlist, 100 owned
playlists and 1,000 private saves per account. A church has the same 100-playlist
bound. A viewer page returns at most 25 authorized items. These are product
limits to enforce before activation, not measurements of current capacity.
Show actionable limits and retain unsaved edits. Do not silently truncate.

Use same-origin and expected-account protection, strict payload validation,
expected playlist version and exact-body idempotency receipts. Atomically
validate add/remove/reorder and write one new version. Reorder submits the exact
set of current entry IDs once each, bounded by 200, or fails with a conflict;
no omissions, duplicates, foreign entries or stale resurrection. A repeated
successful command returns its result without an extra membership/write, only
after current authority checks. A changed retry body is rejected. Revoked actors
cannot obtain a formerly private payload by replaying an old receipt.

Provide labeled keyboard Up/Down controls, stable focus and an announced result;
dragging is optional. Boundary moves are harmless. Conflicts retain the local
draft and show the current authorized order for review instead of silently
overwriting it. A failed item must not prevent selecting a later available item.

## Audience intersection and metadata protection

For every reader, first authorize the playlist container. Then resolve each
entry through the canonical media reader using that reader's current account,
church membership, source lifecycle/rights and implemented safety restrictions.
Both checks must pass. Playlist PUBLIC never makes a MEMBERS or CHURCH item
public. CHURCH audiences for different churches are not interchangeable or a
simple ordered privacy scale. A management-only media projection is never a
playable/public projection. Draft, unpublished, removed, denied and unknown
required sources are unavailable regardless of playlist ownership.

Public/non-management responses omit inaccessible entries entirely, including
their entry/media IDs, titles, credits, artwork, descriptions, transcripts,
provider URLs, durations and source-specific errors. Filter before serializing
HTML, RSC, JSON, search, previews, embeds, share metadata or export projections.
Visible positions are dense; visible counts, totals and duration summaries
derive only from readable entries. Do not reveal original index gaps, hidden
counts or a cursor/has-next flag computed from inaccessible rows. Unknown
duration remains unknown, not zero or a fabricated full-series total.

Public playlist copy is its publisher's separately reviewed text. Do not copy
source titles/descriptions/artwork into durable playlist summaries, labels or
search indexes that outlive current source permission. Any automatically derived
cover or preview must use currently readable items and their independently
authorized optional references. Do not represent public text review as a
guarantee that a publisher cannot manually type sensitive information.

Use bounded source queries and an authorized projection before pagination;
opaque cursors bind the current viewer/scope and playlist version. No N+1 provider
requests or unbounded scan to fill a page. The persistence implementation must
demonstrate the bounded query plan, including sparse visible collections, before
enabling search/pagination. URL/QR possession and signed cursor validity never
authorize source access.

Only the private save owner or current playlist manager may see an opaque
unavailable entry for a reference they already own/manage. That projection can
retain the entry's local identity and ordering for removal, with generic
"Item unavailable" text, but no denied media ID, historical title, URL, artwork,
reason or hidden publisher identity. It is not included in public counts or
previews. Management export preserves only permitted reference/tombstone data;
it never bypasses current source access to recover removed metadata.

Narrowing an audience, rights withdrawal, membership/grant revocation, block,
account restriction or church withdrawal invalidates affected projections.
Use private no-store responses for viewer-specific reads and generic no-index
metadata for restricted/denied routes. An anonymous public projection must never
reuse an authenticated user's broader projection. Recheck source access on
open, focus/Back restoration, retry and continuation; destroy an active player,
cancel queued work and conceal private metadata on observed access loss or
account change. Never return an old source URL as an unavailable-item fallback.
This cannot retract media already downloaded or control an independent provider.

Child eligibility is a required source boundary. Until an accepted family
resolver and child-safe media projection exist, do not activate child playlist,
save or progress surfaces by reusing an adult/public projection. Later approved
child access must intersect both container and each item's child eligibility;
parental or playlist management authority cannot turn ineligible public media
into eligible child playback. No playback history becomes parent/church reporting
implicitly. The family safety/review owner governs any such later proposal.

## Private progress, retention and clearing

Progress is an optional resume aid, OFF by default, with an explicit account
choice before persistence. Enabling it is separate from analytics consent,
notification settings, healthy-use estimates and automatic series playback.
Eligible adults may play/save media without enabling it. Show whether progress
is off, supported, unavailable, unsaved or saved; do not label unsupported as off.

Store at most one latest position per account, canonical media ID and current
source revision. Progress is owner-only. Publishers, playlist editors, church
leaders, followers and another account on the same browser receive no position,
viewing timestamps, completion flag or per-person audience analytics. Do not
copy it into URLs, shared metadata, operational logs, general analytics or public
exports. No learning, attendance or faith score is inferred from playback.

Accept progress only from a currently authorized, deliberately loaded supported
player. Require a finite nonnegative position within the accepted source-duration
bound (catalog maximum seven days); when a trustworthy duration exists, reject
positions beyond it. Unknown duration must not be invented or inferred from
iframe visibility. The capability adapter must establish trustworthy position
and source identity; otherwise progress is unavailable. Client reports do not
prove listening, completion or human engagement.

Bind each write to account, source revision, progress preference/clear generation
and an optimistic record version. Serialize/coalesce writes from one player;
competing tabs/devices receive an explicit conflict, not a stale overwrite. Allow
intentional backward seeking rather than selecting the largest-ever position.
Use a bounded write budget, no more than one normal checkpoint per 15 seconds,
with coalesced pause/exit flushes inside the same server-enforced budget. No
background timer or offline outbox is required; a failed flush may lose only the
unconfirmed position and must not trap playback or loop automatic retries.

Retain progress for 90 days after its last accepted position update, at most
1,000 current records per account. Reading/resuming alone does not extend this
deadline. Exclude expired rows synchronously; purge in bounded jobs within 24
hours after expiry. Capacity removes the oldest inactive record, with the limit
disclosed before opt-in. These are proposed product retention limits, not legal
retention claims. Deployment requires the actual cleanup owner/job and evidence;
no future job may be assumed to exist from this definition.

Turning progress off stops writes and clears stored progress. Clear history keeps
the preference but clears positions. Both atomically advance the owner's clear
generation, delete active positions and invalidate cached/resume responses;
delayed requests and old retries cannot resurrect them. A supported per-item
clear similarly advances that item's generation. Account switching/sign-out
discards prior-account local state and queued writes before new account values
load. Never persist private progress in shared browser storage as a fallback.

Source replacement invalidates the old revision's resume position. Revocation
or source removal stops writes and conceals progress immediately; delete its
obsolete active position through the cleanup owner within 24 hours. Previously
expired/cleared/deleted positions do not return when access is restored. Account
export may include only the current owner's unexpired positions with readable
source metadata; erasure removes them. Existing protected recovery/erasure
contracts must cover progress, preference/clear generations and replay barriers
before activation, so a backup restore cannot resurrect cleared history. Keep
only the minimal opaque barrier needed by that contract, not old positions.

## Unsupported players and deliberate continuation

An iframe, external-link click, elapsed wall time or successful load does not
establish a supported progress/seek capability. Until the accepted provider
adapter proves current position, revision binding, seek confirmation and access
teardown, show "Playback progress is unavailable for this source" and the
canonical Open source action only if the source is currently permitted. Do not
inject a guessed timestamp, claim the provider saved a position, or scrape its
private history. Provider-side history/privacy is independent of this app.

When supported, offer Resume and Start from beginning with the saved position;
do not automatically seek or start on a list visit. Confirm actual player results
before showing resumed/playing. Failure preserves access to deliberate playback
and explains that the latest position was not saved. A denied item has no source
link; a still-authorized source whose player fails can offer Retry/Open source.
No repeated autoplay loop or automatic retry burst.

Series continuation selects only the next currently readable entry in the
explicit finite playlist. Provide Next and Stop, keep unrelated recommendations
out of the app's queue, and recheck source access before loading. Automatic
continuation remains OFF by default and must consume the accepted playback
preference's requested/effective state, browser capability, reduced-motion/data
and implemented healthy/family policy. A separate series toggle cannot override
OFF or silently allow audible autoplay. Access loss, navigation, account change,
Stop or a failed next item cancels queued continuation; offer deliberate Retry
or Skip rather than looping. Last item ends app-generated continuation without
app-generated recommendations. The app cannot promise to remove a provider's own
related content or independent player recommendations.
No provider request, speculative preload or progress write on a playlist card.

## Implementation acceptance

- Public playlist with public, MEMBERS, other-church and removed items: guest,
  member, church member, editor and blocked viewer receive only their current
  intersection. Verify HTML/RSC/API, metadata, artwork, IDs, pagination, visible
  numbering/counts, direct URLs, export and private tombstones with denied-text
  sentinels. Changing an item to restricted removes all restricted details from
  the next public response; a shared link never restores them.
- Owner/version tests cover forged ownership, revoked church duty, independent
  remaining grants, cross-church reads, source edit authority, exact retry,
  concurrent reorder, remove versus reorder and stale receipt replay. Reload
  preserves order; keyboard moves/focus/conflict recovery remain usable.
- Progress tests cover opt-in/off, unsupported source, finite bounds, deliberate
  backward seek, stale multi-device writes, source revision replacement, account
  switch, expiration/capacity and source revocation. Clearing/off, retry and
  restore tests prove old positions cannot reappear. Test real export/erasure
  adapters and the cleanup job before enabling retention promises.
- Supported player browser tests prove Resume/Start/Next/Stop, unavailable/retry/
  skip, rejection by browser/provider, access teardown and no automatic loop or
  unrelated playback. Verify default OFF, reduced-data/motion and separately
  approved family eligibility. Run source-owner regression and required release
  gates for the runtime implementation; mock success alone is insufficient.

This candidate changes only this document. Four existing boundary checks passed:
reserved/unknown resource denial, existing resource owner separation, private
saved-collection ownership/unavailable projections, and bilateral block/revocation
across saved sources. They validate the reused foundations, not an implemented
playlist. Source/contract review, relative links, private-data, website-copy,
formatting and diff checks passed. Focused review clarified intended draft
audience versus live publishing authority and app versus provider recommendations.
No runtime bundle, dependency, query or provider request changed. No new speed,
browser, build, full-suite or production acceptance is claimed for this definition.
