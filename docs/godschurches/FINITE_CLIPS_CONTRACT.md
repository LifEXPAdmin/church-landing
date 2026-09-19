# Finite clip sessions and eligibility

## Scope and current owners

September 19, 2026 candidate against integrated `1fbcf9f`. The first clip
experience is a small related set, manual navigation and a real finished screen
with deliberate full-source or leave actions. This definition adds no clip
record, route, provider, player, session endpoint or active family control.

The [catalog contract](MEDIA_CATALOG_CONTRACT.md) owns canonical media identity,
current audiences, source rights and editorial metadata. Its registry entry is
still reserved and its defined formats do not yet include CLIP. The clip
persistence task must extend that same canonical owner with a validated CLIP
format and clip detail, rather than creating a second media identity or treating
an existing post/image ID as a playable clip. Metadata edits preserve identity;
source replacement increments its revision and requires renewed source checks.

Consume [publishing permissions](MEDIA_PUBLISHING_CONTRACT.md),
[playback capabilities](MEDIA_PREFERENCES_CONTRACT.md) and
[healthy use](HEALTHY_USE_CONTRACT.md). Existing `post-reads.ts` filters current
post authority before selecting a bounded page. `reader-navigation.ts` and
`feed-reader.tsx` preserve the post reader's navigation/batch behavior; that
reader is not a short-media session service. Reuse applicable navigation and
access patterns without changing post routes, page sizes or source permissions.

The original bounded-feed requirement calls for a technical hard stop, autoplay
off and no endless swipe endpoint. A decorative end panel over an automatically
refilled queue does not meet it. Runtime layouts, storage, selection, transitions,
shared actions and child restrictions keep their own implementation acceptance.

## Eligible media and attribution

An eligible clip is a deliberately published canonical item with one supported
source, current rights, explicit audience, accountable personal/church owner
and confirmed short duration. Publishing duties and draft/live authority are
exactly those of the publishing contract; a credited speaker, source link or
church title adds no duty. No automatic extraction, AI tagging, provider feed
import, arbitrary source HTML or native upload is activated here.

Initial duration is a whole number from 1 to 180 seconds, AUDIO or VIDEO.
Unlike optional long-form duration, unknown duration makes an item ineligible
for a bounded clip session. Publisher-supplied duration alone does not prove
playback length. The later source adapter must verify actual duration before
play, enforce the accepted bound and stop app playback at the end. A mismatch,
live stream, unsupported duration/stop capability or unbounded source becomes
unavailable for the session, with an explicit source action only when currently
permitted. Never pass a long recording as a clip by adding a start-time query.
Publisher-selected native excerpts retain their separate processing/rights gate.

Reuse catalog title, description, language, credits, artwork, topics and explicit
audience bounds. Clip-specific detail contains the verified duration/source
revision and optionally one canonical full-source reference plus caption track
metadata supported by the actual source. It cannot link to itself or another
clip as its full source. Missing captions are truthful unavailable state, not
an invented transcript or translated track. Third-party caption text, artwork
and attribution retain their own rights and current visibility checks.

Show the currently permitted clip title, supplied publisher/speaker attribution
and a clear full-source action when available. Credits are not verified account
associations or endorsements. Do not retain a denied full source's title,
artwork, speaker, URL or other metadata in a cached clip card, share preview,
search result or automatic caption/summary. A private parent never becomes
public through a public clip wrapper.

Distinguish two source relationships before publication:

- A separately licensed, independently published short work may optionally cite
  a related full recording. Its optional reference is projected only when
  currently readable; omit a denied link/metadata without exposing why. The
  standalone clip may remain available under its own current source rights.
- A dependent excerpt uses its full source as a required rights/audience
  dependency. Its audience must be within the parent's allowed audience at
  publication and on every read/play. Parent withdrawal, denied access or rights
  expiry makes the excerpt unavailable. Do not relabel a dependent excerpt as
  standalone to bypass that restriction. Excerpt creation remains disabled until
  the separate approved processing and rights workflow exists.

Guest eligibility is limited to current PUBLIC projections. Authenticated
viewers also need current account, relationship/block and audience checks;
MEMBERS and each exact CHURCH scope remain distinct. Unknown/legacy audience
values fail closed. The same authority checks apply to details, session
selection, every transition, source delivery, share metadata and exports.

Known child access remains disabled until the accepted family identity,
eligibility resolver and release gate exist. The later child implementation must
intersect every clip and required parent with current age/parent policy on the
server. Client parameters, a public URL, adult presentation defaults or a role
title cannot lift that policy. No child viewing history, inferred interest,
parent reporting or third-party tracking is authorized by this definition.

## Relatedness and a fixed selection

Start only after a deliberate Start clips action, optionally from one currently
readable seed item. Default requested size is two; the explicit adult/guest start
choice may request three. The server accepts only those supported choices,
with a global maximum of three. Future implemented lower-limit choices can
reduce the effective cap to one or zero; zero means unavailable, not a bypass.
Family limits, once activated, can only reduce the permitted set. A current
lower limit applies before a subsequent transition; it never appends entries.

Relatedness uses publisher-selected editorial facts that the viewer is allowed
to read. Choose one explicit context for the set: the same readable canonical
full source, the same owner-scoped series label, or one exact normalized ordinary
topic label selected by the viewer/from the readable seed. Use catalog text
normalization and exact comparison, not semantic inference. A common supplied
speaker/church name alone is not a canonical relationship. No private parent
ID, denied series, viewing history, prayer activity or inferred faith supplies
a selection signal. Explain the visible relation without revealing denied data.

Select only current published/eligible clips from that context, no duplicates,
ordered deterministically by publication time descending then opaque ID. A seed
clip occupies the first slot when eligible; fill remaining slots from the same
context. Do not broaden an empty context to unrelated popular material. Enforce
source/audience predicates before LIMIT, batch required projections and cap
candidate work. No per-candidate provider calls or unbounded scan to fill a set.
The implementation must prove its bounded query plan for sparse visible data.

The initial response contains at most the effective cap, an opaque session
handle, currently permitted entries and one fixed ordering. If only one item
qualifies, show a one-item set; if none qualify, show Empty with a leave/source
action. Counts derive only from readable entries, never denied candidates.
There is no next-page cursor, offset, automatic replacement token or endpoint
that grows this session beyond its selected membership. More than three eligible
records does not change these rules.

Bind the session to the current account or ephemeral anonymous context, explicit
relation, selected canonical references/source revisions, effective limit,
created time and expiry. An opaque server record or authenticated encrypted handle
may carry this state; do not expose denied IDs or private metadata in a readable
URL token. Handle validity never replaces fresh source authorization. Never
accept a client-provided replacement item, widened limit or alternate owner.
Bound session state to 30 minutes from creation without sliding expiry; discard
it on expiry/account change. It is navigation state, not durable watch history.
If stored, the implementation needs a bounded cleanup owner and documented
retention before activation. An authenticated session cannot be replayed as guest.

## State transitions, interruption and reset

The server and interface share this finite contract:

| State                  | Deliberate action or event                                           | Result                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Idle                   | Start clips                                                          | Authorize and select one fixed set; show Ready or Empty. Do not start playback.                                                   |
| Ready                  | Load/Play current clip                                               | Recheck authority/capabilities and load only that source; show Playing only after confirmed success.                              |
| Playing                | Pause, navigation, full source, comment/report action or page hidden | Pause/destroy the current supported player and cancel pending starts. Retain only safe in-set position.                           |
| Ready/Paused/Playing   | Next or Back                                                         | Stop the previous player, select an existing permitted position, then wait for deliberate Play. No set refill or automatic start. |
| Playing                | Current clip ends                                                    | Stop; offer Next when an existing later position remains. Last position enters Finished.                                          |
| Any current item       | Source fails or access is lost                                       | Cancel load/player, conceal denied metadata and offer permitted Retry or Skip/Leave. Skip advances only within the existing set.  |
| Final position         | Next/Skip, or last clip ends                                         | Finished. No additional selection request, player load or timer follows.                                                          |
| Any state              | Session expires or account changes                                   | Stop and discard session playback state; show Expired or return to entry. Do not create a replacement set.                        |
| Finished/Expired/Empty | Leave or open permitted full source                                  | End the clip journey. A later new set requires an explicit new Start clips action at entry.                                       |

Loading has cancel/error/timeout states. The publishing contract's readiness
timeout and user-initiated retry apply; a retry rechecks the same selected source,
not a new candidate. Abort late responses and destroy old players so a resolved
load from a previous position cannot start alongside the current player. Pause
before opening another view; provider tabs opened independently are outside app
playback control and must not be described as controlled by this session.

Back, refresh, browser restoration, comments/report return and changed layout
may resume the same unexpired selection only after current access checks. They
never start playback or select a new set automatically. If state cannot be
validated, show the stopped entry/expired state with deliberate start available.
Newly published clips are not inserted mid-session. Removed or revoked entries
are omitted from fresh projections and visible positions/counts recomputed;
do not expose hidden IDs, original index gaps or reasons. They consume the
original selection's capacity and are never replaced. If none remain, Finished.

The finished screen says the set has ended and offers Leave, currently permitted
full teaching/source and supported Save actions. Replay, if offered, is explicit
and revisits the same currently authorized fixed set while unexpired. It does
not reset an enforced family limit or opt into progress. No countdown, automatic
replay, swipe past the end, intersection observer, polling, playback-ended event
or repeated failed item can mint a replacement set. Retried starts with the same
request key return the same bounded session after current checks; invalid/expired
replays stop, not renew. Multiple clicks cannot append concurrent start results.
A source-revision mismatch retires that selected entry; it cannot silently play
replacement bytes under the old duration/rights check. A later explicit set may
select the revised source only after fresh eligibility validation.

The first version has manual transitions even if a general media autoplay
preference permits an attempt elsewhere. Default OFF, mute/caption capabilities,
reduced-data/motion and healthy-use Take a break remain effective. Any future
automatic within-set playback needs separately tested behavior and still cannot
cross Finished. Explicit Play cannot override source or active child restrictions.
The app promises no app-generated endless recommendations; it cannot remove an
external provider's independent recommendations or guarantee its privacy rules.

## Accessible controls and runtime cost

Show the current visible position and finite total, readable title/attribution,
Play/Pause, Next/Back, Stop/Leave, and supported sound/caption controls. Every
action is keyboard reachable with visible focus and a named result. Announce
position/errors/end politely without moving focus unexpectedly. Swipe is optional,
never the sole navigation; vertical scrolling and interactive controls must not
advance clips. Reduced motion removes transition motion and keeps the same end
boundary. Enlarged text and narrow screens retain the controls and source link.

Distinguish missing/unsupported captions and mute from a saved off choice.
Use text/error fallback when the accepted player cannot fit or function; no
hidden playback, arbitrary embed, fictitious transcript or unlabeled icon-only
escape. Caption availability does not establish translation or source rights.

Load only the explicitly selected current source. No provider scripts, images,
preconnects, next-video preloads or progress/analytics writes from a list card
or merely receiving a set. Do not make watch history to enforce a cosmetic adult
session boundary. Later saves/comments/reports consume their implemented
canonical owners and current rights; do not wire a reserved resource to an
existing post-only endpoint. Private progress is a separately accepted adapter,
not implied by a session handle. Measure source requests and bounded selection
queries when implementing; no speed or bandwidth claim follows from this plan.

## Required implementation acceptance

- Seed more than three eligible clips and assert the server returns at most the
  chosen cap, deterministic related items and no continuation cursor. Exercise
  every last-item transition; no client/server path appends or replaces a set.
  Test invalid limits, forged/replayed handles, simultaneous starts, expiry,
  refresh, new arrivals, all-removed sets and explicit new-start behavior.
- Test PUBLIC/MEMBERS/exact-CHURCH, blocked and revoked viewers, standalone versus
  dependent parent, rights expiry and source replacement. Search/HTML/RSC/API,
  counts, relation explanation, captions, preview and export must not contain
  denied metadata sentinels. A private parent cannot leak through a public clip.
- Test unknown/false/out-of-range duration, unsupported/uncontrollable sources,
  late player readiness, duplicate Next, loss of focus, provider failure and
  account switch. Exactly one supported player can be active; Retry/Skip cannot
  expand membership or trigger an automatic loop. Native excerpts remain gated.
- Browser acceptance proves keyboard/touch/vertical-scroll behavior, visible
  focus, narrow/enlarged text, reduced motion/data, truthful captions, real
  Finished/Leave/full-source flow and current permission rechecks on return.
  Actual family server tests must reject direct endpoint/URL limit overrides
  before any child activation. Adult controls are not evidence of child safety.

Definition review and reused-foundation tests are distinct from these future
runtime gates. No migration, provider configuration or production acceptance is
established by this document.

## Candidate verification

Eight existing checks passed: reserved/unknown resource denial and current-owner
separation; frozen post selection and current revocation on refresh; touch,
horizontal-wheel and vertical/interactive gesture boundaries; and stable batch
navigation through account/action returns. These verify the reused foundations,
not a clip endpoint or player. Source/contract review, relative-link/private-data,
website-copy, formatting and diff checks passed. Review explicitly covered source
revision replacement and opaque session state so neither can bypass current
duration/authority checks. No runtime dependency, client bundle, request or
database query changed. No new performance, browser, build, full-suite or live
clip acceptance is claimed for this definition-only candidate.
