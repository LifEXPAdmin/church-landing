# Media publishing permissions and source policy

## Definition and existing owners

September 18, 2026. This definition extends the accepted
[catalog contract](MEDIA_CATALOG_CONTRACT.md) on integrated `5dc7f77`. It defines
the external-link publishing implementation and its acceptance. It does not
activate a catalog, grant a duty, add a provider account or enable native uploads.
`mediaCatalogItem` remains reserved in `lib/platform/resource-contracts.ts` until
its actual authorized persistence/read adapters exist.

Reuse the catalog's identity, formats, field bounds and audience matrix;
`account-sessions.ts` for coherent session/revocation checks;
`church-permissions.ts` and `church-assignment-permissions.ts` for current scoped
duties and grant ownership; and `social-operations.ts` for strict command fields,
versioned results and exact retry receipts. Existing still-image assets remain
distinct from catalog records. The [playback preferences](MEDIA_PREFERENCES_CONTRACT.md)
contract owns requested/effective playback defaults and browser-local Data saver.
Post links continue using their current owner; an existing post or image grant
is not a media publishing grant.

## Publisher and operation matrix

These are the precise capabilities for the later media implementation, not new
active enum values or automatic additions to role presets. Capability activation
must be coordinated with the canonical church privilege owner.

| Actor and current authority                                                                                                 | Allowed catalog operations                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eligible adult personal owner                                                                                               | Create, read and edit own drafts; preview; publish, unpublish and remove own items after rights/audience checks.                                                                                                                         |
| Approved member of an activated managed church with `EDIT_CHURCH_MEDIA`                                                     | Create church-owned drafts; manage only drafts they created. The same drafts are available to that church's current manager for review. No publication, live-item edit or audience widening. No separate submission queue is introduced. |
| Same church eligibility with `MANAGE_CHURCH_MEDIA`                                                                          | Read and edit that church's active drafts and items, review rights, publish, unpublish and remove them. May create a draft directly.                                                                                                     |
| Church access delegator                                                                                                     | Grant a named media duty only if they hold both that duty and current `MANAGE_CHURCH_ACCESS`, under existing explicit Privileges review and no self-grant rules.                                                                         |
| Other member, follower, credited speaker/church, role-title holder, platform operator without the relevant source authority | Only the current audience projection. No draft, source-management, publishing or grant authority.                                                                                                                                        |

Personal ownership may use PUBLIC or MEMBERS; church ownership may also use
CHURCH for that exact church. A viewer's membership and an editor's duties are
separate checks. Resolve owner identity from the authenticated command, never
from a trusted display label. No ownership transfer or arbitrary delegate list
is supported. Removing an editor assignment retires only its owned grant
contributions; another current independent grant retains its own effect.
An editor may choose a permitted intended audience on their own private draft;
that selection exposes no live item and still requires a manager to publish.

Recheck eligible account, current session, managed-church activation, approved
connection, effective duty, item ownership and source restrictions on every
management read, mutation and historical receipt replay. Preserve the current
privileged authentication policy; this definition does not turn global MFA
enforcement on or treat a role title as authentication. Loss of one editor does
not remove church-owned work, but it removes that person's management access.
Church withdrawal and personal owner restriction make their dependent catalog
items unavailable. Moderation override and rights-case investigation need their
own accepted source-specific authority; a publisher cannot clear a takedown.

## Supported external sources

The first version supports single publicly accessible items from the following
explicit allowlist. This is a product scope decision, not a claim that a provider
has verified a publisher's rights or that every valid-looking URL is playable.
The same parser governs draft source fields, preview, publication and playback.

| Source           | Accepted input and canonical destination                                                                                                                                                                                                 | Playback boundary                                                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YouTube video    | Exact hosts `youtube.com`, `www.youtube.com`, `m.youtube.com` with `/watch?v=ID`, `/shorts/ID` or `/live/ID`; `youtu.be/ID`. ID is exactly 11 ASCII letters, digits, `_` or `-`. Canonical link is `https://www.youtube.com/watch?v=ID`. | A recorded single item. A live broadcast, playlist, channel, shortener beyond the named host, or signed/private delivery source is unsupported. A `/live/` path alone does not prove that a broadcast has ended. |
| Vimeo video      | Exact hosts `vimeo.com` or `www.vimeo.com`, exactly one positive decimal ID path segment, at most 20 digits. Canonical link is `https://vimeo.com/ID`.                                                                                   | Public video only. Passwords, unlisted privacy hashes, private/team videos, showcases and provider file URLs are unsupported.                                                                                    |
| SoundCloud audio | Exact hosts `soundcloud.com` or `www.soundcloud.com`, exactly two nonempty ASCII slug segments of at most 100 characters each, using letters, digits, `_` or `-`. Canonical link is `https://soundcloud.com/publisher/track`.            | One public track. Reserved top-level site routes, `sets`/playlist routes, private secret-link segments, API/stream URLs and shortened links are unsupported.                                                     |

Reject HTTP, credentials, nondefault ports, IP literals, trailing-dot/lookalike
hosts, backslashes, control characters, malformed percent escapes, encoded path
separators and extra path segments. Match the parsed hostname exactly, never by
substring or suffix. Only the exact path grammars above are accepted. Reject
fragments, duplicate keys and all input query parameters except the single
required YouTube `v`. Explain how to copy the canonical item link; do not silently
remove a privacy hash, access token, start time or playlist context and claim the
same source was saved. Reconstruct the canonical URL from validated parts.

Do not accept publisher iframe HTML, scripts, embed URLs, arbitrary audio/video
file URLs, cookies, OAuth tokens or provider passwords. No server fetch or DNS
request is necessary to parse these URLs. A recognized URL is not a positive
availability check: draft state records that distinction. Public source access
and ended-recording status must be reviewed in preview and explicitly affirmed
by the publisher; known private, removed, live or rights-restricted sources cannot
be published. A transient provider failure is not evidence of deletion or public
availability. Preserve the draft and offer a deliberate retry or source change.

Metadata preview renders the publisher's escaped descriptive fields immediately.
Provider playback is a separate deliberate action; no scrape, remote thumbnail,
oEmbed HTML, download, transcoding or background source crawler is required.
If later enrichment needs server networking, reuse the validated-address,
redirect and total-deadline protections in `post-link-fetch.ts`, with a reviewed
provider-specific endpoint/response allowlist. Never fetch while holding a
database permission lock. Revalidate current access after network work.

## Audience warning and rights review before saving

Display the actual provider name, canonical destination and selected catalog
audience beside both Save draft and Publish, before either action. Required copy:

> This audience controls who can find this catalog entry on God's Churches.
> The audio or video stays on the external provider. Anyone who can open its
> public link may watch or listen there, even if they cannot open this entry.
> Do not use this source for a recording that needs private playback.

For every source-bearing draft or publication, require an explicit acknowledgment
bound to the canonical source, audience selection and this policy version. A
draft may retain a missing audience as `null`, displayed as Not selected; saving
its source still needs acknowledgment bound to that null selection. A new source
or any audience change, including selecting an audience for the first time,
clears it. A draft without a source needs no acknowledgment. All incomplete
drafts remain private; publication requires an explicit permitted audience and
the corresponding current acknowledgment.
Neither acknowledgment nor a private catalog wrapper supplies remote access
control. Rejection keeps safe unsent metadata visible and explains the field;
invalid credentials/token-bearing source strings are never persisted or logged.

Publication also requires the catalog's accountable rights assertion: own work,
permission for the intended use, or an identified applicable license; intended
audience; source fingerprint; current artwork/text permissions; required public
attribution; and any expiry. Retain private evidence references separately from
public credit. Third-party testimony needs its specific current consent basis.
Source replacement, audience changes or replaced third-party material require
review of the relevant assertion. Changed required attribution also needs review.
Unchanged exact retries do not renew an assertion or create a second record.

An ordinary edit to a published item is a deliberate reviewed publication of its
new version, with a clear audience preview; it must not silently publish autosave.
The prior version remains current if validation or persistence fails. A manager
can unpublish first to work privately. Current rights withdrawal/expiry or a
takedown hides the affected item immediately, including old previews and source
actions; a failed edit must not preserve a now-forbidden live version.

## Embedded playback and external fallback

External-link playback is the initial dependable path. The separately implemented
embed adapter may create frames only from the validated provider identity, after
a fresh source check and an explicit Load player action. Keep a named external
source link available for a permitted source. Loading explains that the provider
receives the request and applies its own privacy/playback rules. Neither a privacy
parameter nor a user's app setting is a promise of no provider contact.

The provider adapter definitions are:

- YouTube: construct `https://www.youtube-nocookie.com/embed/ID` with controls and
  keyboard enabled, `autoplay=0`, `loop=0` and inline playback. Prefer available
  captions through the supported adapter. Privacy-enhanced mode is documented by
  [YouTube](https://support.google.com/youtube/answer/171780); it is not private
  delivery. Preserve a visible player of at least 200 by 200 CSS pixels and use
  the external link when the layout cannot fit it. Related content cannot be
  fully disabled by `rel=0`; do not promise an isolated provider experience.
  [Player parameters](https://developers.google.com/youtube/player_parameters)
- Vimeo: construct `https://player.vimeo.com/video/ID` with `autoplay=0`, `loop=0`,
  visible controls and `dnt=1`. DNT still permits essential cookies. Do not use
  background/chromeless playback or strip privacy hashes to bypass rejection.
  [Player parameters](https://help.vimeo.com/hc/en-us/articles/12426260232977-About-Player-Parameters)
  and [privacy modes](https://help.vimeo.com/hc/en-us/articles/12426199699985-About-video-privacy-settings).
- SoundCloud: construct only `https://w.soundcloud.com/player/` with the encoded
  canonical public track as `url` and `auto_play=false`. A track redirect to a
  playlist or different unsupported source is unavailable. The reviewed Widget
  API supports explicit control; it does not grant arbitrary script/HTML input.
  [Widget API](https://developers.soundcloud.com/docs/api/html5-widget)

An iframe alone cannot claim to honor mute, caption, quality or progress settings.
Use the [effective-capability contract](MEDIA_PREFERENCES_CONTRACT.md). Until an
adapter can implement required supported preferences and current-access teardown,
use the external link. No automatic start, next item, hidden audio, preconnect,
provider thumbnail or player script on list cards or before deliberate loading.
Do not mask provider controls/branding or force a false success state.

Use an origin-only cross-origin frame referrer, never a private route/query,
account/church ID or source evidence. YouTube requires client identification via
Referer and recommends `strict-origin-when-cross-origin`; suppressing it can break
playback. [Embedded-client requirements](https://developers.google.com/youtube/terms/required-minimum-functionality)
Vimeo domain restrictions also depend on the referrer.
[Vimeo troubleshooting](https://help.vimeo.com/hc/en-us/articles/35817429341457-Troubleshooting-video-playback-errors-due-to-referrer-policy-conflicts)
Ordinary external destination links use `noopener noreferrer`; they are not
windows containing an embedded player. Keep first-party headers private and
no-store. Frame origins and permissions are narrowly enumerated in the eventual
CSP/adapter change; no wildcard, same-origin proxy or arbitrary publisher origin.

Known unavailable/denied sources have no fallback URL exposed by the application.
An embed blocked by browser/provider policy for an otherwise permitted public
source may offer that canonical external link. A readiness timeout after ten
seconds offers Retry or Open source without declaring it removed; retry is
user-initiated, not a loop. Before any retried load recheck current item/source
authority. Abort pending requests, destroy the player and conceal private
metadata on access loss, account change or navigation. Back/focus restoration
revalidates current access before showing the retained projection.

## Sizes, rate limits and processing states

The existing catalog field bounds still apply. Use the existing 32 KiB raw JSON
write envelope from `socialWriteInput`, validate serialized UTF-8 bytes as well
as field lengths, and show a clear too-large error without truncation. Optional
fields cannot bypass the aggregate bound. Reject NUL, unsupported control text
and lone UTF-16 surrogates before database writes while retaining valid Unicode,
tabs and line breaks in allowed plain-text fields. Source URLs are at most 2,048
characters; request keys and IDs reuse their canonical bounded validators.

Reuse the existing durable account/domain mutation limit and its Retry-After
behavior. Future provider preview requests need the same actor/IP/global budget
owner used by post previews, not unbounded calls on each keystroke. List/detail
reads use bounded pages and explicit projections, not a whole-library fetch or
one provider request per card. No native-media storage usage counter is invented
when the application only stores metadata and external links.

Native audio/video upload allowance is **zero files and zero bytes** in this
version. The dedicated budget/retention contract must first define approved
storage/processing providers, numerical file/duration/decoded limits, account
quotas, concurrency, total retry/time budgets, cleanup windows and cost stop
conditions. Do not infer those from the current image provider. Existing still
JPEG/PNG/WebP processing is limited to 4 MiB and 40 million decoded pixels, with
metadata removal; a catalog artwork adapter must additionally prove current
asset ownership, permitted purpose, rights, audience and reference-aware cleanup.
Until that adapter exists, omit artwork and retain a usable text card. Native
caption/transcript file attachment and generated captions are likewise unavailable.

Keep the catalog lifecycle independent of source/processing state:

| State or event                                                           | Required result                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DRAFT or UNPUBLISHED                                                     | Apply the operation matrix: a personal owner manages their own records; a church manager manages that church's records; a church editor accesses only DRAFT records they created, never UNPUBLISHED items. Incomplete fields are explicit; neither state implies playable media. |
| PUBLISHED                                                                | Current required fields, source policy, rights and audience passed. Read gates still apply every time.                                                                                                                                                                           |
| REMOVED, takedown, withdrawn rights or unavailable required source       | Hide body/source actions and discovery; retain only the permitted tombstone/minimal audit. No automatic restoration to public.                                                                                                                                                   |
| External preview/loading failure                                         | Preserve last confirmed metadata plus safe unsent edits; separate timeout, unsupported input, provider-blocked and known-unavailable states. An empty library is not an error result.                                                                                            |
| Future upload: pending, uploading, processing, ready, failed or canceled | Not active today. Ready requires all required outputs; failure cannot be labeled published/playable. Failed/canceled items are excluded from discovery, retain actionable status and follow the accepted cleanup window.                                                         |
| Future retry or replacement                                              | Retry the same canonical operation within its accepted limits; replacement requires explicit new bytes/source and rights review. No duplicate assets, surprise publication or public fallback. Exhausted retries remain failed and visible to their current owner.               |

Unpublish, narrowing, withdrawal and account/church restrictions must invalidate
list/detail/search/share/read caches and any loaded first-party player. Revalidate
saved references and exports through the same source owner. Record actor, scoped
item, action, versions, policy/assertion references and outcome in minimal audit;
never record credentials, entire provider responses or private testimony evidence
in ordinary logs. Protected recovery must not resurrect withdrawn publications,
rights or source URLs. Previously copied external URLs and downloaded provider
bytes cannot be recalled by this application.

## Required implementation acceptance

Use this checklist for the coherent catalog and publishing implementation:

1. Personal owner, current church editor/manager, unrelated church, revoked
   assignment, suspended account and forged owner tests cover direct reads,
   writes and successful receipt replays. No title or inherited role preset
   activates a new media duty. Another current independent grant survives.
2. Both draft save and publication show the external-host limitation before the
   action. Changed source/audience clears acknowledgment; missing rights or
   third-party consent blocks publication without discarding safe edits.
3. Each provider grammar accepts its canonical item and rejects lookalike hosts,
   unsupported schemes/routes, private hashes/tokens, duplicate/extra queries,
   oversized bodies and invalid Unicode. No arbitrary fetch or publisher HTML
   executes. The server does not mistake syntax validation for availability.
4. A command applies once; repeated identical retries return its original receipt.
   Different-body retries and
   stale versions return conflict with a review path. Current authority loss
   denies old receipts. Failed saves preserve the confirmed published version
   except when current rights/access rules independently require it hidden.
5. At 320/390px, doubled text and keyboard navigation, missing artwork/transcript
   remains readable. Provider requests are zero before explicit loading; player
   controls, focus, caption availability, timeout/retry and external fallback
   describe actual behavior. Unload and denied Back restoration stop delivery.
6. Publish/edit/unpublish and rights/source withdrawal reconcile list, detail,
   search, counts, previews, saved references and audit without stale private
   values. No native file upload, storage counter, processing job or playback
   progress is claimed without its accepted owner and actual implementation.

Provider references above were checked on September 18, 2026. The technical
definition does not accept provider terms on anyone's behalf or establish legal
rights in submitted material. Recheck relevant provider behavior when enabling
its adapter. Definition verification and later implementation/release acceptance
are recorded separately below.

## Definition verification

Thirteen existing checks pass: two reserved-resource/authority-registry checks,
three reading-preference checks and eight link URL, network, deadline and receipt
checks. They verify the reusable owners, not a new media adapter. Source review,
relative links, private-reference scan, authored-copy check and diff validation
pass. The new document is formatted; the existing catalog's prior table-format
warning is preserved rather than reformatting its unrelated content. A focused
read-only review clarified source-bearing drafts with a missing audience,
creator-only draft access and repeatable receipt recovery.

Only this document and the catalog cross-link change. Runtime dependencies,
client bundles, queries, configuration, database and provider accounts are
unchanged. No new build, browser, full-suite, native-upload or production
acceptance is claimed. Integration of this definition and implementation of the
authorized catalog/publishing journeys remain separate gates.
