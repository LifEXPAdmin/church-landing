# Media library and publishing

27 September 2026. Isolated implementation for integration review. This report
does not establish an integrated release, production activation or provider
acceptance.

People can save private drafts, review a preview, explicitly publish a recording,
edit it with fresh rights review, unpublish it, withdraw its rights, mark its
source unavailable or remove it. The library supports sermons, podcasts,
testimonies, services and teaching, independently labeled audio or video. It
searches currently readable titles, descriptions, formats, speakers, series,
topics and owning churches. Readers see useful text without artwork, transcripts
or embeds and can deliberately open a freshly checked external source.

## Authority, consent and privacy

- One canonical media ID survives edits and format changes. Ownership is either
  personal or one currently approved, activated managed church. Credited churches
  and speakers convey no ownership or delegation. No automatic grant, transfer,
  role preset or historical-duty backfill is added.
- `EDIT_CHURCH_MEDIA` prepares only the editor's own church drafts.
  `MANAGE_CHURCH_MEDIA` manages that church's items and publication. Current
  approved membership, effective scoped duties, managed-church eligibility and
  fresh privileged MFA are checked independently. A personal publisher cannot
  select a church audience. Removing an individual publisher preserves church
  work and removes that person's management access.
- Private drafts have no public read path. Published PUBLIC, MEMBERS and exact
  owner-CHURCH audiences use current account, relationship, rights, moderation,
  source and recovery gates. Search, pagination and totals filter by that same
  predicate before returning results. Denied detail responses reveal no title,
  source, hidden owner or private rights evidence.
- Every source and audience warning binds the exact canonical source, audience
  and policy. A changed field clears review. Publication requires an explicit
  assertion of ownership, permission or license, public completed recording,
  relevant text rights and another person's testimony consent when applicable.
  Private evidence, actor identities and assertion fingerprints stay out of
  reader projections. Expired or withdrawn rights make dependent reads
  unavailable; an exact retry never renews an assertion.
- Sources use strict canonical public YouTube, Vimeo or SoundCloud URL grammars.
  Private tokens, signed links, credentials, extra query parameters and
  unsupported routes are rejected. Syntax does not verify remote availability
  or licensing. Provider requests, fetches, artwork and embeds never happen
  automatically. The explicit source action rechecks current access and version
  before opening an isolated provider tab; a response after concealment cannot
  launch it. Public provider URLs can circulate independently of catalog access.
- Management and reading use no-store, noindex APIs with same-origin writes,
  expected-account pinning, bounded bodies, optimistic versions and exact retry
  receipts. Initial HTML/RSC contains no item metadata. Blur, page hide, offline
  and parent concealment remove protected UI; focus/reconnect reads fresh data.
  Delayed responses cannot restore concealed content or overwrite newer edits.
  Conflicts and uncertain writes preserve local changes and original retry
  bodies until a deliberate resolution. No browser storage is added.

Provider privacy documentation was checked on 27 September 2026:
[YouTube sharing](https://support.google.com/youtube/answer/57741),
[Vimeo privacy](https://help.vimeo.com/hc/en-us/articles/12426199699985-About-video-privacy-settings)
and [SoundCloud private links](https://help.soundcloud.com/hc/en-us/articles/115003450427-Sharing-a-private-track-or-playlist-within-SoundCloud).
These references explain provider distinctions; they do not accept terms or
validate any real publisher's rights.

## Data and recovery

Migration `20260927230000_media_catalog` follows the existing 118 migrations.
It adds three tables, `MediaCatalogItem`, `MediaCatalogRights` and
`MediaCatalogEvent`, two explicit church capabilities and a protected
`MEDIA_CATALOG` control kind. Database checks enforce exclusive ownership,
tombstones, enums, versions and bounded fields. No package, secret, cron job,
provider write or old-data rewrite is required. Regenerate the receiving Prisma
client after integration.

Personal exports contain bounded currently permitted owned metadata, excluding
church work and private third-party evidence. Personal erasure clears owned
source/content/rights and records opaque recovery controls. Church work remains
church-owned; erased creator/assertion/event attribution is detached. Replaying
a newer media control into older backup state strips sources and rights and
quarantines the item without inventing ownership or authorization.

The populated 118-to-119 fixture upgrade preserved all 153 original table
fingerprints and added three empty tables. Actual 119-schema dump/restore and
protected-control replay passed. The previous 118 client can perform ordinary
reads/writes on the additive schema before new duty rows exist, but it rejects
the new church-capability values. The previous recovery code rejects new media
controls before replay. Therefore a media-aware recovery and rollback baseline
is required before media writes are activated, and a client aware of the new
capabilities is required before those duties are granted. This is an explicit
release gate, not a compatible-old-release rollback claim.

## Verification and remaining acceptance

Final application build: `EB_MFCV_XHsEOa3mHRWt2`, with all 1,203 application-source
hashes matched. Verification receipts are maintained with the private handoff.

- Twenty focused service/parser/resource groups passed. They cover all five
  formats, strict URLs and metadata, current rights and audiences, scoped church
  duties, version conflicts, exact retries, changed retry bodies, removal,
  export/erasure, protected replay and permission-filtered pagination.
- Thirteen built-browser groups passed. They cover create and fresh saved-state
  loading, explicit publication, unsaved navigation, focus/network concealment,
  current library/detail reads, deliberate isolated source opening, a late source
  response after blur, doubled text at 320/390 pixels, rights withdrawal,
  post-commit account switching, conflicts and lost removal-response recovery.
  Screenshots were inspected. No page errors or automatic provider requests
  occurred. The single deliberately attempted provider navigation was blocked
  by the test transport; no remote playback acceptance is claimed.
- Three final built HTTPS groups passed, including strict input, origin/identity
  checks, cache/noindex headers, HTML/RSC omission, private counts and actual
  local MFA enrollment, proof, expiry and unconfirmed-session denial. Personal
  actions remain separate from church privileged assurance.
- The broader focused regression found two failures: a stale navigation test
  still reserved media, and a PostgreSQL 16 dump tool was incompatible with the
  isolated PostgreSQL 17 server. Fifty other groups passed. After correcting
  the expectation and selecting the matching tool, all four navigation groups
  and both actual retention restore groups passed. These overlapping runs are
  layered evidence, not a clean whole-repository final regression claim.
- The populated migration preserved all 153 prior tables; actual dump/restore,
  previous-client behavior and recovery incompatibility were exercised as
  described above. The first fingerprint harness attempt had a quoting error
  before migration and was corrected; its failed receipt remains preserved.
- Type checking, targeted lint, website-copy checks, production compilation,
  hydration verification and runtime-trace checks passed. The final build
  checked 242 traces, 59,479 entries and 601 server JavaScript files. A bounded
  final independent static review reported no new blocker. Source security
  is checked from the staged repository separately from the clean build snapshot.

The library returns at most twenty items using a shared SQL permission predicate
before pagination/counting and a bounded projection query. No provider fan-out
is introduced. No latency or throughput improvement is claimed. All runtime writes use owned fictional fixtures. Production
writes, migrations, deployments and main-branch updates by this builder: zero.

The following remain separate acceptance gates:

- Normalized Scripture parsing, ranges and overlap search need the reviewed
  versioned registry from their owning task. Metadata discovery is usable, but
  the full search task remains partial until that prerequisite is implemented.
- Media-specific moderation and rights-investigation authority has not been
  accepted or mapped. Generic post/report operator powers are not source access
  or takedown authority. Publisher commands cannot clear moderation restrictions.
  Real operator/policy activation remains open.
- Artwork, transcripts, native upload, service-occurrence linking, embeds,
  restricted-delivery adapters and typed post media cards remain with their
  owning tasks. Standalone service recordings and explicit external-link
  playback are usable without implying those integrations exist.
- A1 must reconcile the combined source, rehearse migration and recovery, build
  and verify the release, and record deployment identity and live checks.
  Real provider terms/licensing, physical devices, policy and pilot acceptance
  are not established by fictional fixture tests.
