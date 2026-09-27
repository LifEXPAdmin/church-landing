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
