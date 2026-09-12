# Installation and social interface checkpoints

11 September 2026 · `codex/continuous-medium-social`, based on released
`ade4376`. Work uses the existing social and post-workspace services. No new
schema, permission rules, provider activation or notification delivery.

## Local checkpoints

- `20efdde`: Menu installation help captures the browser's install prompt before
  navigation, uses it only on request, distinguishes requested from installed,
  and provides manual platform instructions. Four isolated browser groups pass;
  production build, runtime traces and focused lint pass. Physical Samsung/iOS
  installation acceptance remains separate.
- Comment discussion: paginated roots in both orders, one visible reply level,
  exact context merge, neutral tombstones and foreground access rechecks.
- Comment composition: five-second serialized private saves, exact-body retries,
  acknowledged-snapshot publication, preserved conflict text, versioned edits
  and deletes, and independent desired Like state. Selected mention IDs and
  explicit church identity survive drafts. Server author labels are authoritative.
- Dirty, pending and conflicted comment work participates in safe update and
  navigation protection without modifying post-draft reply permissions.

## Verification at the comment checkpoint

- Fifteen post/comment controller checks, including legacy reply permissions,
  exact response-loss retry, conflict preservation, publish-once, revoked access,
  account changes and aggregated update protection.
- Twenty-six social/workspace/gallery/search service checks, populated upgrade
  across 27 migrations, and dump/restore preservation passed in disposable local
  databases. Zero production writes or migrations.
- Local HTTPS browser checks cover 60 roots, 45 replies, both sorts, a late exact
  target, neutral deletion, guest access revocation, signed-in save/retry/send,
  canonical Like/edit and concurrent edit preservation, and keyboard mention
  selection with stable IDs at mobile width. Eight browser groups passed, including
  revoked church publishing, public speaker labels and surviving replies after
  deletion through the interface.
- Production build/type checking and runtime traces pass: 105 traces, 8,570
  entries, 258 server JavaScript files. Focused lint and whitespace checks pass.

These are local implementation receipts. Release identity and live checks are
recorded at the release checkpoint. Parent integration, remaining reader and
recovery interfaces, source/owner acceptance and physical-device requirements
remain open until their own evidence is present.

## Private comment recovery checkpoint

The private recovery list reuses the composer, restores exact whitespace, checks
current target access, retains owner text for unavailable targets, and supports
versioned discard with exact retry. Explicit resume cannot resurrect a consumed
or discarded ID. Three additional local HTTPS browser groups pass: stale save
and explicit conflict review followed by consume-once publication; withdrawn
source with owner-only copy/discard and lost-response discard retry; and account
switch concealment. Seventeen combined controller checks pass, including idle
save timing and discarded-ID recovery. Focused lint and production build/runtime
traces pass (106 traces, 8,656 entries, 261 server JavaScript files). Release is
still pending the integrated checkpoint.

## Reader and conversation integration checkpoint

The full thread now also serves the native reader discussion sheet and authorized
church-event discussion. Individual links focus/highlight their exact target,
return through sign-in and preserve the prior feed position. Pin and conversation
preferences use independent canonical versions and exact retries. The separate
pin does not increase the chronological count. Saved reading size applies to
comment prose and entry text.

Five additional local HTTPS browser groups pass: pin/version/conflict/deletion;
real credential sign-in return to the comment; Bible/List/focused reader with
same IDs, add/edit/delete and exact lost-edit retry, dirty closure protection,
focus restoration and no gesture page turn; detail return to the same List URL
and scroll; and event audience revocation. Widths 390/1280, actual computed 24px
comment text, dark appearance and reduced motion are verified. Physical phones
remain owner acceptance. Ten reader/navigation checks pass. Final production
build/runtime traces pass: 106 traces, 8,658 entries, 261 server JavaScript files.

## First integrated release

Application `2eabdecf2d205f1bfc4bb7c40be4f3d1a37540b8` is live in READY deployment
`dpl_7XPNvsK174YQ4sN71CC1zUNUrgFX`, assigned to `godschurches.com`.
At 00:32 UTC on 12 September, 28 read-only live checks passed: 17 social API,
four private-workspace/identity, three update-notice and four installation/comment
browser checks. No mutation requests, browser errors or deployment error-log
entries were observed. All 27 production migrations are complete and checksum
matched; none pending or applied. Eight scoped installation/comment interface
slices were reconciled with verified evidence. Parent/source/physical-device
and owner acceptance remain open. Continuous work proceeds to relationship UI.

## Relationship controls local checkpoint

Compact profile, church and post-card menus use the existing status/version
service for Follow, private Favorite, Mute/Restore, Snooze and personal Block.
Unfollow clears favorite; church follow grants no membership; snooze shows its
actual expiry. Block explains public-viewing limits and separate church identity.
A canonical router refresh clears the route/prefetch cache while preserving
unrelated client drafts; open comment projections recheck current access.

Three local HTTPS browser groups pass for exact lost-follow retry, favorites,
unfollow, mute/restore, snooze expiry, concurrent-version conflict, account change,
church follow without membership and post projection removal after personal block.
Build/runtime traces and focused lint pass. The private relationship library will
provide the persistent blocked-account entry and integrated unblock check before
this relationship batch is released. Privacy settings are an independent local
work item; neither is part of the live installation/comment release above.

## Private relationship settings and library checkpoint

Settings now provides mention eligibility and profile-count visibility with
exact retries and deliberate conflict review. The private relationship page
paginates all five existing views and reuses the controls for restoration and
unblock. Account changes conceal private values/rows before rechecking ownership.

Four additional local HTTPS browser groups pass: all privacy choices, exact
lost-response retry and conflict across two separately signed-in sessions;
account change/guest privacy exclusion; 25 unique follows with cursor/Back
preservation; mute restore, unavailable targets, unblock without refollowing and
private-list account change. Combined with the three controls groups, all seven
relationship groups pass. Safe return tests include validated relationship view
and cursor without foreign-owner or token authority. Production build/runtime
traces pass: 107 traces, 8,754 entries, 264 server JavaScript files. No schema or
backend policy changed. Relationship parent/integrated privacy acceptance remains
open; deployment is recorded at the next checkpoint.
The five shared-reader browser regression groups also pass with the new
relationship menus, including gesture isolation, exact edit retry, source access
revocation, sign-in return and feed-position recovery. Full repository lint passes.

## Relationship release

Application `07b645ef78ea55132a826ffe1e0069a679b05c6a` is live in READY
`dpl_236681Pr23zn1S5sh8bZLWygTFM7`, assigned to `godschurches.com`.
At 00:58 UTC on 12 September, 32 read-only live checks passed, including private
relationship guest gates and the public compact menu. Zero application writes,
browser errors or runtime error rows were observed. All 27 migration checksums
match, with none pending or applied. The local seven relationship browser groups,
five reader regressions, eight navigation tests, lint and build passed. Parent
integration, owner acceptance and remaining source coverage remain open.

## Private Saved interface checkpoint

Menu now opens private collection management; post cards expose current Save and
Remove choices. Both use the existing owner-bound workspace service and exact
serialized retries. Collection conflicts preserve the unsent name, deletion moves
bookmarks to Unfiled, and unavailable sources have neutral removable rows.

Six local HTTPS browser groups pass: guest return and lost-save retry; create,
move, name validation and conflict review; deletion to Unfiled and withdrawn-source
removal; 25-item pagination/Back and account-switch clearing; exact collection
create retry and 25-collection pagination; concurrent save, removal and revoked
source rejection. Production build/type/runtime checks pass (108 traces, 8,839
entries, 267 server JavaScript files), and full lint passes. No backend, schema or
post-draft reply-permission changes. Release identity will follow verification.
The five shared-reader regression groups pass with the Save menu, including exact
edit retry, gesture isolation, sign-in return, feed-position restoration and
revoked event access. Nine safe-navigation tests pass.

## Saved interface release

Application `40369c21bc598405a44d7bfdfafe06eb1ef71457` is live in READY
`dpl_EL2zagXz2iJGaNFxR5w472Wc8udH`, assigned to `godschurches.com`.
At 01:06 UTC on 12 September, 36 read-only live checks passed with zero writes,
page errors or runtime error rows. All 27 migration checksums match; none pending
or applied. Collection and Save interface tasks are complete; parent acceptance
and remaining source coverage remain open.

## Typed Explore checkpoint

Explore now uses the five-category community search service. Five local HTTPS
browser groups pass: 23 unique permitted post results with pagination/Back;
Unicode/literal wildcard queries, minimal guest author labels, church results and
topic actions; occurrence links/timezone and revoked event visibility; failed-read
retry, 320px layout and church handoff/Back; and account-change clearing of private
results. Production build/type/runtime checks pass. Topic/church filter controls
and expanded history acceptance are the next dependent interface slice.

## Search filters and history checkpoint

The same Explore renderer now supports topic and church filters, explicit clearing,
bounded church lookup and opaque cursor preservation. Changed queries/categories/
filters start at the first page. Seven HTTPS browser groups pass, including the
five typed-result groups plus Unicode filter/history/church handoff, Back/Forward,
revocation between pages, invalid cursor restart, empty-query topic and keyboard
controls at 320/390px. Ten safe-navigation tests, full lint and production
build/type/runtime checks pass (108 traces, 8,741 entries, 267 server JavaScript
files). No search service, schema or authorization behavior changed.

## Community demo expansion — local implementation

The public sharing controls now provide fresh authorized previews, truthful
copy/native-share feedback and locally generated downloadable QR codes. Public
resource metadata uses anonymous permission checks and safe branding fallbacks.
A distinct website-sharing page links to the existing account and church flows.

The church overview reuses current calendar readers for a compact upcoming-events
section alongside existing posts and relationship/membership controls. Personal
profile images reuse the existing crop/upload editor and authorized image API;
post and comment avatars fall back to initials when access or delivery fails.

A maintained public release/feature source provides dated product versions,
retained notes, a searchable categorized guide and normal Menu/footer links.
The loaded layout captures its version/build once. The update notice reads notes
for the exact detected build in a dialog without refreshing or replacing drafts.
Public viewed-release IDs use a bounded cookie; no private draft content is stored.

The production private media store passed one isolated object upload/read,
unsigned-access denial and deletion, with zero objects remaining and zero database
writes. The private store is connected, but upload mode remains disabled: the existing
contract requires a deployed cleanup worker, which is still missing. Public church search
found no matching approved demo listing; no church content or approval was
fabricated. Owner setup and physical rehearsal remain separate prerequisites.

Local validation: production build passed with 112 traces, 9074 entries and 277
server JavaScript files; no private fixture/environment files or Prisma config
loader. Release-content integrity and guarded-refresh tests passed. Full lint
passed. Combined browser verification and live release receipt follow below.

Ten draft-controller browser groups passed again, including preserved reply
permissions, exact save/publication retries, stale/deleted drafts, revoked church
access, owner changes and dirty/offline/in-flight/conflict update protection. The
notes dialog was opened and closed while unsent text remained unchanged.
Nine sharing/demo browser groups and the separate real signup/account-boundary
verification/sign-in return check passed. Verification delivery used an isolated
sink; no external mail or physical phone scan is claimed.

Final local checks also passed: authorized comment avatars; 12 navigation/install
policy checks; 2 public release-content checks; and 18 media processing/service/
boundary checks. Two initial boundary failures were a test-launch configuration
error (missing isolated local storage); all three boundary tests passed with the
required isolated configuration. Final build retained the same clean 112-trace
runtime result. No schema migration was introduced.
