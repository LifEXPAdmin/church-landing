# Artist identity, credits and external releases

## Scope and existing source owners

September 18, 2026 definition, inspected against integrated `5dc7f77`. Artists
may represent solo musicians, bands, worship musicians, DJs, producers and music
ministries. This contract describes their identity, authorized editors, supplied
credits and externally available releases. It does not launch a music product,
verify an identity, distribute recordings or establish music rights.

The current account/profile, church and calendar owners remain authoritative.
`profiles.ts` and `public-profile.ts` control member identity disclosure;
`calendar-reads.ts` and `calendar-access.ts` control canonical event/occurrence
projections; `social-operations.ts` owns exact command receipts; and
`account-sessions.ts` owns coherent session/lifecycle checks. The accepted
[media catalog](MEDIA_CATALOG_CONTRACT.md) describes a separate recording identity
and current audiences. No artist/release persistence or permission adapter exists
in the inspected resource registry.

The later implementation must introduce explicit artist and release resource
owners before enabling their routes. Do not reuse a person account as a band,
make a church listing into an artist, treat an image asset as a release, or add
music to the catalog's sermon/testimony discriminator. A release can reference
an existing catalog recording only when that record's actual format, rights and
current audience fit; the reference neither copies it nor changes its format.

## Identity and accountable stewardship

An artist has one server-generated opaque identity and version, separate from
its display name, provider account, credited people, canonical account links and
any church attribution. It has a declared `PERSON` or `TEAM` presentation type.
This is a publisher-supplied description, not proof of legal personality,
membership, religious affiliation or representative authority.

Every artist initially has one accountable eligible adult account as its
steward. For a person profile the creator affirms that they are that artist or
currently authorized to represent that artist; for a team they affirm current
authority to maintain the team's public profile. Store actor, time, policy
version and assertion privately. Team members are not automatically account
delegates. A church/music-ministry credit grants no church or artist permissions.
Church-owned artist stewardship and ownership transfers remain unsupported until
their actual scoped transfer/approval owner is accepted. Do not silently convert
an artist to a church-owned record or infer rights from a church duty.

Creating, linking or publishing an artist must not set an identity, church,
ministry or musical-rights verification flag. Public labels describe credits as
supplied by the publisher. Email verification, account age, an accepted editor
invitation and a provider link establish only their specific facts. Do not show
a verification badge, official/endorsed claim or music-rights guarantee as a
consequence. A later reviewed verification program needs its own evidence,
reviewer authority, scope, expiry and correction process.

## Editing and delegation

| Current actor                                                                                                 | Permitted operations                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Artist steward                                                                                                | Edit and publish the profile; create/edit/publish/unpublish its releases; remove the artist; invite and revoke scoped editors. Rights and current-source checks still apply.                                                                                             |
| Accepted `EDIT_ARTIST_PROFILE` delegate                                                                       | Edit descriptive profile fields for this artist. Cannot publish a draft profile, change stewardship/delegates, change verification, edit releases or clear moderation restrictions. Editing a published profile is an explicit reviewed save, never background autosave. |
| Accepted `EDIT_ARTIST_RELEASES` delegate                                                                      | Create and edit this artist's DRAFT releases. Cannot publish, unpublish, remove published releases or change artist access.                                                                                                                                              |
| Accepted `PUBLISH_ARTIST_RELEASES` delegate                                                                   | Create, edit, review and publish this artist's drafts; edit, unpublish and remove its published/unpublished releases. Must provide the current accountable rights assertion for publication.                                                                             |
| Credited artist/member, follower, unrelated church delegate, unaccepted invitee or revoked/ineligible account | Only the currently permitted public projection. No editor view or mutation.                                                                                                                                                                                              |

These are proposed resource-scoped capabilities, not active church or operator
enum additions. No implied role hierarchy or title grants them. The steward
chooses explicit capabilities and the invited current account accepts those
exact artist/capability/version terms. A change to an unaccepted invitation
invalidates its old acceptance token. An invitation expires after seven days;
issuing a replacement invalidates the old token. No public email lookup, shared
password, external-account password or unsolicited provider login is required.
At most twenty current delegates and twenty pending invitations per artist;
authorization and mutations remain bounded. No automatic outbound notice is
enabled by this definition.

Delegates cannot invite others, expand their capabilities or replace the steward.
They can step down from their own artist scope. Every read, write and successful
receipt replay rechecks accepted nonrevoked capability, actor eligibility and
the current artist/steward lifecycle. Preserve only that grant's contributions
when other scopes end. A restriction or closure of the steward hides the artist
and its dependent releases; a delegate cannot take over through stale access.
Do not remove or deactivate the last steward silently during an artist action.
Account erasure still follows the canonical account owner: hide dependent artist
records, revoke delegation and retain only allowed audit/tombstones. Any later
continuity/transfer needs explicit current authority and reviewed recovery.

## Bounded profile, credits and release metadata

All textual fields are plain text, with no raw HTML, unsupported control
characters, NUL or lone UTF-16 surrogates. Preserve valid Unicode, quotations and
permitted line breaks. Enforce both individual bounds and the existing 32 KiB
write envelope; report the limit without silent truncation. The creator chooses
an explicit draft/publication action and expected version. Server-owned IDs,
owners, moderation state and verification are never writable metadata fields.

| Field                       | Meaning and initial bound                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artist name and biography   | Required nonblank display name up to 160 characters; optional biography up to 5,000. Duplicate display names remain distinct identities, not automatic merges.                                                                                                                                                                                                  |
| Artist roles                | Up to eight selected supplied roles: solo musician, band, worship musician, DJ, producer, music ministry, songwriter or composer. A PERSON/TEAM type must not invent individual team members or their accounts.                                                                                                                                                 |
| Genres                      | Up to ten distinct plain-text labels, 40 characters each, normalized for stable matching while preserving display text. No inferred genre, belief or ranking from listening history.                                                                                                                                                                            |
| Area and church attribution | Optional coarse country/town IDs from `discovery-options.ts`, explicitly supplied for discovery. No device location or private address. Church name is supplied attribution; an optional canonical church link needs its current permitted association/disclosure. It grants no official status.                                                                |
| Artwork                     | Optional permitted canonical image reference and alt text. Until a source-specific image purpose, audience and lifecycle adapter exists, use a text fallback. Never scrape provider art or copy private profile images into public artist pages.                                                                                                                |
| Credits                     | Up to 30 ordered credits per artist or release, each with supplied name up to 120 characters and role up to 80. Optional account/artist links require the linked subject's accepted association and current disclosure checks; a typed name is not such an association. No private evidence, contacts, implied membership or editor grant in the public credit. |
| Release identity            | One stable opaque ID under exactly one artist, with independent positive version. `SINGLE`, `EP` or `ALBUM`; title up to 160 and description up to 5,000 characters. Another edition may have another deliberate ID; a renamed title or changed provider link keeps the original ID.                                                                            |
| Release date                | Optional supplied date-only value. It is distinct from server publication time and does not schedule publication, send an announcement or prove distribution.                                                                                                                                                                                                   |
| Tracks                      | Up to 50 ordered entries within a release, each with a stable entry ID, title up to 160 characters, optional supplied duration of 1 to 604,800 seconds and optional existing readable recording reference. A SINGLE has one track; EP/ALBUM have at least one. Incomplete drafts may retain missing fields; publication validates the whole selected type.      |
| External listening          | Up to five distinct supported links per release and three per track, each at most 2,048 characters. Link type, provider and exact target are explicit. A URL/provider ID is not an artist, release or track identity.                                                                                                                                           |
| Rights assertion            | Private actor/time/policy/source fingerprint, asserted representation and permission basis, covered release/track/artwork/text, intended publication and any expiry/withdrawal boundary. Public credit/attribution is a separate minimal field.                                                                                                                 |

Reference a canonical event/occurrence rather than copy its date, location,
attendance or RSVP data. A supplied performance claim is not an organizer's
confirmation. The later event/credit association must be accepted by its actual
source owner; project the event only through current calendar access. Guest
pages may display an explicitly public occurrence, never busy-only/private
details. A changed/canceled event follows that source without a duplicate event
or stale copied venue. Creating an artist grants no calendar-edit capability.

Music-release metadata is descriptive, not a license to host the recording,
lyrics, composition or third-party artwork. Publication requires a current
assertion covering the publisher's use of those fields and supplied source links.
An assertion is not independent verification. Do not collect contracts,
signatures, government identity documents or private collaborator correspondence
in public metadata or ordinary request logs. A new source, changed rights scope,
new third-party material or changed accountable publisher requires the relevant
assertion to be reviewed again. Credits cannot substitute for permission.

## Audience, publication and unavailable states

Artist profiles and releases initially have private drafts and explicit PUBLIC
publication, with UNPUBLISHED and REMOVED states. A private team workspace, member
audience or church-only music release is not inferred from the media catalog's
different audience model. Adding those later requires a separate accepted source
projection. Unknown/legacy state fails closed. A draft artist may be useful with
no releases; publication of an artist never publishes its drafts automatically.

A release appears only while its artist and release are both currently public,
eligible and unrestricted with current required rights. Public track links and
optional recordings, artwork, credits and events are independently rechecked.
An optional unreadable recording reference is omitted without exposing its ID,
title, existence/count or private source URL; otherwise usable supplied metadata
can remain. If access to that recording is required by the release's rights
basis, denial gates the dependent release instead of treating it as optional.

Only permitted public projections enter search, facets, counts, share cards and
metadata. Guest requests for drafts/removed/denied records use the same generic
unavailable response. Current relationship blocks and source restrictions apply
to authenticated reads without claiming that blocking can retract a separately
public external page. No private delegate list, steward contact or rights
evidence appears in public HTML, RSC, JSON, provider URLs or previews.

Unpublish/remove, withdrawal, rights expiry and moderation changes stop current
application delivery and invalidate stale projections. A retained reference may
show a minimal unavailable tombstone only to an independently permitted owner.
It may not reveal removed title/artwork/source details. Rights disputes and
impersonation reports need the existing reporting/moderation pipeline's actual
artist/release source adapter before public launch. That integration is required
finishing work, not a new parallel support queue. The publisher cannot lift an
operator restriction by editing a title, replacing a URL or retrying an old save.

## External listening contract

The initial release version uses deliberate external destination links, not
in-site players, uploads, subscriptions, payments, royalty handling or downloads.
Show the provider and a clear Open on provider action. Before saving a link,
explain that the external site controls playback, availability, account/subscription
requirements and its own privacy; publication here proves none of them. Our
unpublish action cannot erase a provider page or previously copied link.

The first bounded link adapters are Spotify, Apple Music and Bandcamp. This is a
source-policy choice for later implementation, not provider activation:

| Provider    | Initial accepted link grammar                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spotify     | Exact `open.spotify.com`, `/album/ID` or `/track/ID`, with a 22-character ASCII alphanumeric ID. Album targets attach to releases; track targets attach to a SINGLE or named track. No playlist, artist-profile, podcast, shortener, URI scheme or embed URL in a release listening field.                                                                                                                          |
| Apple Music | Exact `music.apple.com`, `/{country}/{album or song}/{slug}/{id}`; country is two ASCII letters, ID is a positive decimal string of at most 20 digits, and the nonempty display slug is at most 200 decoded characters without separators/control characters. An album URL may carry exactly one positive decimal `i` track ID. Preserve that track selection; do not silently turn a song link into an album link. |
| Bandcamp    | One nonreserved ASCII account-label subdomain of `bandcamp.com`, followed by `/album/slug` or `/track/slug`; slug is 1 to 200 ASCII letters/digits/hyphens. Exclude service subdomains such as `www`, `daily`, `blog`, `get`, `help`, `support`, `auth`, `login`, `stats` and `api`. No custom domains, private-stream tokens, download/redemption links or exclusive embeds.                                       |

Use exact parsed HTTPS hosts with no credentials, IP literals, custom ports,
trailing dots, control characters, backslashes, encoded separators or malformed
encoding. Reject fragments, duplicate keys and query fields other than Apple
Music's explicit `i`. Show a field error and retain safe unsent metadata; request
the canonical item link instead of silently stripping tracking, secret or
selection context. Reconstruct a safe destination from validated parts. A later
additional host/path needs explicit source-policy review; a display label cannot
enable it. Treat all URLs as untrusted data, not HTML or executable schemes.

Spotify documents canonical album/track links, and Apple documents sharing
song/album links that open its web player.
[Spotify content links](https://developer.spotify.com/documentation/ios/tutorials/content-linking)
and [Apple sharing](https://support.apple.com/en-gb/guide/music-web/apdm0783785d/web).
Bandcamp permits artist/track URL changes and separately offers private streaming;
neither a mutable URL nor possession of a private link grants publication rights.
[Bandcamp URLs](https://get.bandcamp.help/en/articles/15263144-how-do-i-change-the-url-of-my-artist-account-a-track-or-an-album)
and [private streaming](https://get.bandcamp.help/en/articles/15263276-how-does-private-streaming-work).
These primary-source details were checked on September 18, 2026; this contract
does not promise all provider links match the intentionally narrow first grammar.

Do not scrape remote artwork, fetch an arbitrary source, preconnect or load a
provider script/player merely to render a release. Syntax validation cannot
establish availability or rights. Label links as publisher supplied; a known
restricted/withdrawn link is unavailable, while a transient failure offers a
deliberate retry. A public provider page does not guarantee every viewer can
play it. No playback position, completion, listening time or helpfulness can be
inferred from a click or a return to this website. App autoplay/caption/data
preferences cannot control another site's player.

Future embedded/native music must use its accepted source-specific player,
rights and storage contracts. An optional canonical catalog reference continues
to use that catalog's current adapter; it never converts an unsupported music
URL into supported private playback. Support/storefront/announcement actions
retain their own accepted owners and explicit user action. No empty working-looking
Follow, Support, Buy or Play control should be shipped without its actual owner.

## Persistence, recovery and acceptance

The later service must resolve the acting account and artist scope server-side,
reject unknown writable fields, enforce exact origin/expected account, and reuse
durable mutation limits. Artist and release versions remain distinct. Reordering
track entries preserves their IDs; adding a provider link never merges another
artist's release. A command applies once; repeated identical retries return the
original minimal receipt only after current scope/revocation checks. Different
payloads with a reused key and stale versions require an explicit conflict review.

Failed saves preserve safe local edits and the last confirmed state, unless
independent current access/rights requires it hidden. Uncertain saves retain
their exact body; never silently retry revised metadata or recreate an artist.
Scoped audit records actor/action/resource/version and assertion references, not
private documents or raw provider responses. Account erasure and protected
restore must include the new owners, grants, assertions and tombstones so a
restore cannot resurrect withdrawn rights or public releases. No schema or
recovery-registry implementation is introduced by this definition.

Required later acceptance:

- A created artist, accepted invite, church credit and working provider link
  produce no verification badge or implied rights. Duplicate artist names retain
  separate IDs; forged owner/verification fields are rejected.
- Person/team ownership, exact scoped invitations, acceptance/expiry, revoked
  editors, steward restriction and cross-artist writes/retries obey the matrix.
  Another artist's delegation remains unaffected by a scoped revocation.
- Draft and unreleased records never appear in public discovery; missing artwork
  or releases leaves a readable profile. Rights expiry, takedown and owner
  closure revoke current links/metadata after reload, Back and account changes.
- Invalid/oversized Unicode text and malicious links fail before persistence.
  Valid album/track links preserve the exact selection; private source and
  collaborator details never appear through a public wrapper.
- Actual canonical event updates, source restriction and credit withdrawal are
  reflected without copied dates, private venue leakage or automatic permission.
- Interrupted create/edit/reorder and repeated identical retries preserve one
  identity and ordered entries. Conflict/error recovery retains safe edits and
  exposes a real review action on phone, keyboard and doubled text.
- No provider traffic occurs before deliberate external navigation, and the
  application makes no playback, royalty, native-hosting or device acceptance
  claim from link syntax or service tests alone.

This definition changes no runtime, schema, permission grant, dependencies,
configuration, provider or production data. It does not claim the later artist
product is complete. Definition checks and integration remain distinct from
the subsequent service/UI/reporting/recovery and verified-release acceptance.

Two existing resource-registry tests pass, preserving unknown/reserved denial
and the separation between an address and authority. The current account,
calendar, receipt and disclosure owners were inspected, and the dated provider
links above were verified. Formatting, authored-copy validation, local links,
private-reference scan and diff checks pass. These are definition checks, not
tests of an unimplemented artist service. No build, browser, full-suite or
physical-device result is claimed for this document-only change.
