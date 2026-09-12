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
