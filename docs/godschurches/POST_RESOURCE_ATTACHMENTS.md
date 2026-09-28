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

## Password safety and post resource cards verified live, 27 September 2026 UTC

Password screening .32 and current listing/event/volunteer post cards .33 are
**implemented, tested, merged and verified live** in one **2026.09.27.33**
deployment. Source `8c0a7ad5184beb05908cf5f0034c83576edbc393` is READY and
canonical as `dpl_CXsPBL3gCRDkHAvvzaxGgzaMQNrw`, independently serving from
`godschurches.com` at **23:22:45 UTC**. This supersedes the local-only entries below.

Combined build `UDUz_KdQ1zgHa-A0tUPrb` took 42.199 seconds with all 1,965 tracked
files unchanged. Full TypeScript, lint/copy/build security and exact-source CI
passed. Twelve password and thirteen resource-card browser groups passed against
that build. The focused 116-assertion run passed 115 and recorded one query-count
mismatch, 13 versus 14. The unchanged four-test availability rerun passed; four
captured diagnostic reads each used the same 13-query policy sequence and one
bounded post query. Review found no reproduced product regression. The original
extra query is unidentified; asynchronous log attribution is credible, not proven.
The failed run remains recorded and is not presented as a clean whole-suite pass.

Production passed 100 guest/page/browser/API checks and six health checks, with
zero page errors, blocked mutation attempts, scoped error/fatal log rows, test
writes or real-recipient sends. All 153 original-table/column fingerprints were
unchanged at **23:24:50 UTC**. No new queue probe or provider activation occurred.

The single additive resource-reference migration was applied at **23:19:19 UTC**;
all 118 source and production checksums match. Existing post references were empty
and valid. Protected encrypted 117-to-118 restoration preserved all 153 original
table/column fingerprints and completed stable frozen-journal replay with zero
provider-write attempts or unresolved items. The installed 118 registry, ordinary
118-to-118 restore and actual nightly run 24 to 25 passed. All 111 backup sets
were preserved; there were no expiry candidates, removals or maintenance issues.

New-password checks run locally only at registration, change/add and reset.
Existing credentials still sign in unchanged, and rejected new choices preserve
the original session, reset grant or Google confirmation for correction. The
finite historical password corpus is not a current global breach lookup. Resource
cards recheck present source access and compatible publication audiences; hidden
or unavailable sources reveal no previous details. Removal-only edits retain the
unsaved-work guard, and reconnect respects focus and current access.

The broader security task and complete attachment tasks remain open: media and
campaign adapters need their owning source services and acceptance. Full CSP,
cookie prefix/session-idle policy, real MFA enforcement, provider/device/operator
and pilot gates are separate. Retain the complete .33 artifact and 118 schema;
the prior .31 client is additive-schema compatible but lacks these new behaviors.
Prefer a reviewed forward fix. No schema downgrade or production-restore readiness
is implied. See [password policy](PASSWORD_POLICY.md) and
[post attachments](POST_RESOURCE_ATTACHMENTS.md) for the scoped contracts.

# Typed post resource attachments

27 September 2026 — isolated implementation, ready for integration review after
the checks below. This report does not establish a production release.

Integration review subsequently reproduced two browser gaps on the original
handoff: removal-only post edits bypassed the unsaved-navigation guard, and
offline-to-online recovery required another focus event. The separate correction
tracks resource-reference changes in the existing form guard and tracks network
availability independently from focus. It preserves the original commit and
requires both commits for integration. Published and scheduled removal-only
edits now protect navigation; discard restores saved choices and save clears the
guard. Focused reconnect rechecks cards, while background reconnect conceals them.

People and authorized church publishers can add up to three existing listing,
event occurrence, volunteer opportunity or media catalog cards to a post. The composer accepts
canonical page links, checks current access and provides remove controls. Private
drafts preserve the ordered choices through save, resume, conflicts and retries.
Published changes reuse the existing post version, Edited label and deliberate
audience-widening confirmation. Source-detail changes refresh the card without
manufacturing a post revision or exposing previous private text.

## Permission and persistence contract

- Store only bounded, strict `{kind,id}` references. Reject duplicates, extra
  metadata, unknown kinds and unimplemented registry sources. The media adapter
  requires the separately implemented catalog source described below.
  Fundraising campaign cards remain unavailable until their owning service
  exists; this work does not create that service or document-upload processing.
- At publication, edit, exact retry and scheduled publication, require current
  author access and compatibility with the post audience. Private editor access
  and busy-only calendar access cannot become publication permission. A card
  creates no membership, delegation, calendar share or other grant.
- Resolve current canonical source details in bounded batches using existing
  listing, calendar and participation permissions. Blocks, source audience,
  moderation, recovery, withdrawal and owner eligibility remain authoritative.
  A source that disappears leaves the original readable post usable. Unavailable
  source IDs, titles, kinds and counts are omitted from reader responses.
- Normal post HTML, RSC, share and index projections contain no source metadata.
  The reader fetches current permitted cards through private availability reads;
  the chooser uses an owner-pinned, no-store, noindex preview endpoint. Cards and
  previews conceal on blur, page hide, offline and parent concealment. Focus and
  relationship changes recheck access; stale responses cannot redisplay cards or
  overwrite newer draft text. No explicit browser persistence is added.
- Event cards retain explicit timezone and all-day semantics; canceled events
  and closed opportunities are labeled truthfully. Management, organizer,
  applicant, contact, reservation and private online-meeting fields are absent.
- Owned exports include references only. Personal erasure, post withdrawal and
  withdrawal-journal replay clear them. Saving an existing resource draft from a
  client that omits its resource field fails without discarding saved choices.

## Migration and release requirements

Apply `20260927215500_post_resource_references` after the existing 117 migrations
and regenerate the Prisma client. It adds `PlatformPost.resourceReferences` with
an empty JSON array default and an array/maximum-three database constraint. There
are no new tables, enums, grants, secrets, packages, cron jobs or provider writes.
The previous 117-schema generated client was exercised against the 118-schema
fixture: reads succeed, old-client updates preserve references, and old-client
creates receive the empty default. This is additive-client evidence, not a
production rollback or operator acceptance drill.

The integration owner must reconcile the current release branch, apply the
migration in its protected upgrade/restore rehearsal, rebuild the combined
candidate and complete its release, canonical-domain and live checks. Product
versioning and production migration/deployment remain with that owner. Real
operator, policy, provider, physical-device and pilot gates remain open.

## Verification

Original application build: `48nHYzXNS8CWW_X7e2cx_`. Corrected application build:
`btg1xSkOzwDP-0QONKNQG`, with all 1,041 application-source digests matched.
The correction passed thirteen built-browser groups, two HTTPS groups, type
checking, targeted lint, copy, build, hydration, runtime-trace and security checks.
A separate bounded review found no remaining blocker. It changes four interface
files and the regression script; the backend and migration remain unchanged.
The original layered service/database evidence below remains applicable to that
unchanged backend, without claiming a fresh whole-repository regression.

- Seventeen focused service groups passed, including all three resource owners,
  source narrowing, blocks/revoked membership, busy-only event privacy,
  publication audience checks, omitted-reference retry revalidation, explicit
  removal, drafts, schedules, export, erasure and withdrawal replay.
- The original nine built-browser groups passed at a mobile viewport: chooser/link validation,
  delayed-response draft preservation, blur and relationship-change invalidation,
  saved-draft resume/publication, background concealment, revocation, existing
  versioned editing and another reader's source removal. Screenshots were
  inspected; no horizontal overflow or page errors were observed.
- Two HTTPS groups passed against that build: owner pinning, strict input,
  private cache headers, CSRF/origin protection, forged-metadata rejection,
  one publication, HTML/RSC omission and current permission-filtered cards.
- The workspace harness passed 76 assertions plus 118 fresh migrations,
  populated upgrade preservation and dump/restore of drafts, tombstones,
  collections, saved items, retry receipts and constraints. This layered run
  preceded the final omitted-reference retry correction; the seventeen focused
  service groups and nine browser groups verify the final corrections.
- Earlier focused post/draft/participation regression: 51 passes. Follow-up
  availability/lifecycle run: 20 passes. These overlap the final focused groups
  and are not a unique-test total or a whole-repository final regression claim.
- Source batching used nine SQL queries for either three unique or ninety
  repeated references; cost scales with resource kinds and relation queries.
- Type checking, targeted lint, website-copy checks, production compilation,
  hydration repair and runtime-trace checks passed. The build checked 236 traces,
  57,860 entries and 587 server JavaScript files; build security reported no
  findings. The staged source security check is recorded with the handoff.
- A bounded independent review found two retry/invalidation defects; both were
  repaired, covered by regressions and re-reviewed with no remaining blocker.

All runtime writes were limited to owned fictional fixtures. Production writes,
production migrations, deployments and main-branch changes by this builder: zero.

## Follow-on media adapter

The separate media-card change requires the tested media library and publishing
implementation, application `ebc3eb0` and report `2982152`. It adds no schema,
package, provider call or authority grant. Integrate it after that source and the
previous listing/event/opportunity correction; keep those handoffs immutable.

The existing chooser accepts a canonical media page link and retains only its
typed ID. The reader returns ID, title, format label and the internal detail
address. It never copies the external provider URL, rights evidence, assertion
actor or extended source description into a post card. One bounded SQL query
reuses `mediaReadableSql` for current lifecycle, audience, rights, blocks,
managed-church eligibility, moderation and recovery checks. It is one query for
one reference or 180 repeated references; no per-card provider work is added.

PUBLIC posts can attach only publicly readable media. Church and group post
readers are eligible accounts under their existing owners, so their posts may
reference MEMBERS media. Only an exact matching church audience can reference
CHURCH media. A group context acquires no church membership. Draft-management
access never becomes publication permission. Current author and least-privileged
post-audience checks run at publication, edit, retry and scheduled publication.

Source changes refresh the card without manufacturing a post revision. Changing
or removing the reference reuses existing post versions, Edited labels, explicit
widening confirmation, unsaved guards and private-draft recovery. Rights expiry,
withdrawal, unpublishing, source failure, moderation, quarantine, blocks and
membership revocation hide retained cards while preserving independently
readable post text. Current access is rechecked after concealment and reconnect.

Final adapter build `ubxpAF-D_K7UHQzRvQiX1` matched all 1,203 application-source
hashes. Twenty-five service groups passed (eight media-specific plus seventeen
existing attachment groups), as did four HTTPS groups (two media and two listing)
and two complete thirteen-group browser journeys, one for each source. Browser
coverage includes chooser validation, delayed reads, draft resume, publication,
concealment/reconnect, withdrawal, published/scheduled removal guards, discard,
save and revision markers. Mobile screenshots were inspected with no overflow;
no page errors occurred. Type checking, targeted lint, copy, build, hydration and
runtime traces passed. The trace check covered 242 traces and 601 server scripts.

Review/type checking identified a missing media reader label, which was fixed
before the final build. Initial media HTTP/browser fixture setup omitted explicit
personal ownership and was rejected before test assertions; the corrected setup
passed. A preliminary build inherited the test environment and is not the final
acceptance artifact; the final build explicitly used production mode and disabled
delivery. Current HTTPS fixtures derive their cookie wire name from the shared
issuer so the separate session-cookie migration does not require a second
fixture policy. Earlier failures and preliminary artifacts remain preserved.

The full cross-feature attachment tasks still require campaign adapters and
their own source acceptance. Media retains migration 119 and its mandatory
media-aware recovery/rollback baseline before activation; older recovery code
cannot replay `MEDIA_CATALOG` controls. A1 retains integration and production
authority. Real operator, provider, policy, physical-device and pilot gates
remain open.
