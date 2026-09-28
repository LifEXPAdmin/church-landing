## Session isolation and media catalog verified live, 28 September 2026 UTC

The host-bound session transition and curated media catalog with post cards are
**implemented, tested, merged and verified live** in one **2026.09.27.35** batch.
Source `0af8462131ca12ff262b5ebc4b3ee54c5f5d6455` is READY and independently
canonical as `dpl_LHkzTEtKWDtc8xKTz1fs9GJzNb3C`, serving `godschurches.com`
at **00:34:46 UTC**. This supersedes the prepared/local-only entries below.
Subsequent documentation integration does not change the serving application.

Final build `h87kGl2Anql6gevOV1Myr` passed with all 1,995 tracked files unchanged.
Exact-source hosted CI, TypeScript and build copy/runtime/security gates passed.
The combined run passed **116 service/API groups**, **45 actual browser groups**
(six cookie, thirteen media, thirteen media cards and thirteen listing cards),
and **five HTTPS groups**, including enforced church MFA. Eleven development
HTTP/HTTPS groups are retained through exact unchanged account/cookie-source
comparison; only two media SQL owners, their test and report changed afterward.
Initial failed fixtures and stale expectations remain documented, not counted as
clean passes. The unchanged prior source reproduced the sibling legacy-cookie
issue before edits. Integration also reproduced hidden published media under a
non-UTC database session; explicit UTC timestamp comparison fixed publication
and rights expiry, with UTC, Chicago and Tokyo regression coverage.

Production passed **112 page/browser/API checks** and **six health checks**.
All 153 original-table/column fingerprints were unchanged at **00:35:50 UTC**.
There were zero page errors, blocked browser mutation attempts, scoped runtime
error/fatal rows, production application test writes, new grants, recipient sends
or new queue probes. Provider playback was locally blocked during fictional tests;
no real provider playback or physical-device acceptance is claimed.

Migration `20260927230000_media_catalog` applied at **00:29:35 UTC**: 119 matching
source/production checksums, three initially empty tables, 156 tables total,
two explicit media duties and protected media controls. No grants, role presets,
claim scopes or content were backfilled. Protected encrypted 118-to-119 restoration
preserved every original fingerprint and completed stable frozen-journal replay
with zero provider writes or unresolved controls. Separate fictional media replay
proved stale-content quarantine and no-source tombstones. The installed 119
registry was updated before activation. Ordinary 119-to-119 recovery restored all
156 tables, and actual nightly run 25 to 26 passed with all 113 backup sets
preserved, zero expiry candidates, removals or issues.

Keep the complete .35 artifact and 119 recovery owners as the compatible baseline.
The previous .33 application cannot read prefix-only sessions, new media duties or
media controls and is not a compatible fallback. No schema downgrade or production
restore is implied. HTTPS legacy-cookie compatibility ends **29 October 2026,
00:00 UTC**; residual sibling-domain legacy injection/conflict risk during that
interval remains explicit in [the session policy](SESSION_COOKIE_POLICY.md).

Media library/detail, current-permission filtered search, private publishing
studio, safe external sources, publication/withdrawal/removal, and media post cards
are usable. Local metadata preview and deliberate external-source opening do not
complete provider-preview failure/retry or embedded-player acceptance. Those gates,
normalized Scripture search, campaign cards, broader security, provider/rights,
reviewer/operator, physical-device and pilot acceptance remain open. No new billing,
organization authority or real policy activation comes from the separately reviewed
business, campaign, venture and free-pilot entitlement definition documents.

## Combined verification correction, 28 September 2026 UTC

The receiving release candidate reproduced a database time-zone defect absent
from the original UTC fixture: raw Date parameters were compared as zoned values
against UTC timestamp columns. This concealed newly published items on a
non-UTC connection and could misclassify rights expiry. Publication and export
predicates now bind canonical UTC text as timestamp, following the existing
application convention. A regression exercises published, future, expired and
exact-expiry cases in UTC, America/Chicago and Asia/Tokyo. The corrected media,
post-card and account/session suites pass 42 groups; the final combined build,
browser, protected recovery and live checks remain pending. Original failed
checks and fixture corrections are retained. No production data or grants changed.

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
  passed from the staged repository separately from the clean build snapshot:
  1,975 tracked files, 936 authored files and 548 locked packages, no findings.
  Hosted CI for application commit `ebc3eb0` also passed.

The library returns at most twenty items using a shared SQL permission predicate
before pagination/counting and a bounded projection query. No provider fan-out
is introduced. No latency or throughput improvement is claimed. All runtime writes use owned fictional fixtures. Production
writes, migrations, deployments and main-branch updates by this builder: zero.

The following remain separate acceptance gates:

- Normalized Scripture parsing, ranges and overlap search need the reviewed
  versioned registry from their owning task. The separate metadata-search task
  is implemented; the broader media feature remains partial until Scripture
  discovery is implemented and accepted.
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
