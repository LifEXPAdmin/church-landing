# Personal photo library ownership and retention

12 September 2026 · The verified photo library is active in product 2026.09.12.6.
The feature switch still defaults off in an unconfigured environment. Earlier
local-only checkpoints below remain historical; final activation evidence follows.

## Canonical records and bounds

MediaAsset remains the canonical processed-byte identity and immutable storage
prefix. Existing profile, church and post purposes retain their source ownership.
A PersonalPhoto association identifies the personal owner and library membership;
its asset ID is unique. A church-authored post or church image never joins an
acting publisher's personal library. A new standalone PROFILE_PHOTO purpose uses
the owning profile account, without creating a feed post.

Current avatar/cover selection is independent from READY byte status. A retained
previous picture remains READY but is not current. Existing single-current-image
constraints continue to apply. History starts with current READY images and
future successful replacements; RETIRED, failed, expired and already cleaned
objects are never revived. Selecting an older profile/cover image reuses its
existing processed crop and bytes. Changing a collection does not upload again.

The initial library supports 1,000 nondeleted personal photo associations, with
24-item pages, independent from the ten-photo post limit. Reads are bounded and
use a cursor bound to viewer, profile, filter and ordering. Source visibility is
applied before returned counts, thumbnails and pagination. An exhausted bound
fails explicitly rather than omitting an unknown portion of the library.

## Audience intersection

Profile photos/covers retain their current signed-in-member source boundary.
Standalone uploads default to Only me, with an explicit final audience choice.
Supported standalone choices are Only me, Members, Public and a currently
approved Church audience. Public must explicitly explain guest visibility;
profile detail/library navigation still requires sign-in. Church access is
rechecked at save/publication and every read. No draft or processing upload is
readable from a profile, gallery or direct derivative URL.

Post-origin photos retain the source post's current audience, publication,
withdrawal, author and linked-event checks. A PersonalPhoto row does not create
an independent read grant. A standalone photo referenced by a new personal post
must satisfy both its original explicit audience and the destination post's
current access. Removing a source, narrowing an audience, blocking an author or
losing church access narrows all relevant projections and direct image reads.
Church-authored media remain in church context even when an individual uploads.

Future named albums narrow discovery and metadata access using the same audience
intersection. A visible album cannot expose private source photos or counts.
Private album membership does not revoke access to a photo deliberately public
elsewhere. Album membership never converts a dependent source into a new grant.

## Mutations, retries and references

All writes use the existing locked session, current capability checks, exact-body
operation receipts and expected versions. Uploads retain their stable requestKey,
identical bytes/details fingerprint, lease and bounded processing. Staged bytes
stay unavailable; a successful explicit save creates the READY asset and its
personal association in the same transaction. Individual successful files survive
another file's failure. Canceling an uncertain upload never claims the server
canceled its commit; retry the unchanged operation to reconcile it.

Current-picture removal, removing a photo from a collection and deleting its
underlying asset are separate actions. Removing current selection can retain
history. Hiding a post photo from the profile leaves its source post unchanged.
Deleting retained/direct media requires an explicit choice and current version;
active current/post references must be resolved or explicitly reviewed first.
Deleting a named album later removes its membership records, not the photos.

A saved direct photo may be explicitly passed to the shared composer through
stable image references. Publishing rechecks owner, source audience, destination,
versions and the ten-photo limit, and atomically creates references with the post.
Private snapshots preserve those IDs and replyAudience, including exact retries
and conflicts. No public empty placeholder post is created for pending uploads.
A new post does not upload existing saved bytes a second time.

## Cleanup, lifecycle and export

Retention and retirement use the existing shared lifecycle transaction gate.
Successful replacement retains the old READY asset and current/history changes
atomically. Cleanup skips every READY asset and active upload lease. A later
association cannot revive a RETIRED object or the prefix of an expired attempt.
The existing withdrawn-post retention policy remains: withdrawal denies every
projection and derivative, while the source record retains its bytes until an
explicit source removal/purge. It does not grant access through a library.
Only after the final permitted retention/source reference ends may retirement
schedule the immutable prefix in MediaGarbage; the existing 24-hour grace,
bounded worker and retry-safe external deletion remain in force.

Account deactivation retains its existing reversible semantics: it hides owned
personal media, revokes sessions and stops writes; it does not silently purge
photos that should return on legitimate reactivation. Existing permanent-account
removal is not introduced by this task. Any later irreversible account removal
must use the same owned-association retirement procedure and preserve church
ownership rather than deleting by uploader ID. Restrictive foreign keys prevent
an ad hoc account deletion from orphaning assets. Account export includes owned
photo membership, audience/current state and permitted derivative references,
without storage prefixes, reusable operation keys or other owners' data.

The feature switch controls new library/retention operations, never authorization.
Once a privacy choice exists it remains enforced even when the feature is hidden.
After retention is enabled, old code that assumes every READY profile image is
current is not a safe rollback. Prefer a compatible forward fix; never retire
history merely to make an old release's query work.

## Required proof before activation

Real processed isolated fixtures cover both profile purposes, direct save/retry,
post projection without duplicate storage writes, one-file failure, two-tab
replacement/select conflicts, current/source audience changes, account switching,
revocation and direct derivative denial. Race tests put replacement/retention and
cleanup on opposite sides of the lifecycle lock; deleted bytes cannot return.
Export, deactivation/reactivation and last-reference retirement must be exercised.
Named-album source-intersection checks remain mandatory before that later UI ships.

## Implemented adapters and initial verification

`personal-photo-policy.ts` defines current source predicates, owner attribution,
capacity and the feature switch. `personal-photos.ts` exposes bounded signed
cursors and versioned metadata/audience/hide/restore/select/delete commands via
`/api/platform/photos`. `post-photo-references.ts` validates saved photo references
inside publication. Gallery reads, permitted feed counts, current-image reads,
delivery and account export use the same records. The additive migration is
`20260912060000_personal_photo_ownership`; only current READY profile images and
READY personal-post images are associated during migration.

Eight isolated processed-photo groups pass alongside seven existing media groups
and four gallery/sharing groups. These cover both history purposes, exact retries,
current selection/removal versus deletion, direct-only save, private/public/member
and Church reads, account switching/blocking, source withdrawal, personal/church
attribution, 24-item pagination with 25 visible photos, draft/reply permissions,
revoked church publication, version conflicts, export and deactivation/reactivation.
A paused expired upload also proves a fresh attempt cannot attach its cleaned
prefix. Its late failure renews the cleanup ledger; conditional ledger deletion
preserves a concurrently renewed grace period.

Named-album intersection and browser integration remain subsequent gates. No
production migration or retention activation is claimed by this checkpoint.

## Interface and release-candidate verification

The shared composer accepts versioned saved-photo references. The profile Photos
route provides the paged library, current/history selection and direct uploads;
`/platform/profile/me?tab=photos` resolves to the signed-in owner's Photos tab.
The existing crop editor rechecks the authoritative current image after each save.
Post owners open Manage photos for per-file progress, captions, order and conflict
review. Management thumbnails load only after opening that panel. Reduced photo
data is a nonsensitive browser preference: one post thumbnail per deliberate step,
and one large derivative only when the viewer opens. No original is prefetched.

Selected files, metadata and exact pending request bodies remain in memory. The
shared workspace registers unresolved photo work for navigation/update protection.
Browser Back uses one same-address guard for all pending photo panels; nested viewer
Back closes the viewer, and saving/discarding removes the work guard. A changed
account clears stale files and choices. Requests bind the expected account at the
server boundary as well as checking identity before and after acknowledgements.
A superseded foreground identity read can retry draft resume once without changing
its account generation, preserving a real authentication failure's closed state.

Fresh verification includes nine processed-photo service groups, eleven draft
controller groups, four full library browser groups, two gallery conflict/retry
groups, five navigation/account/reduced-data browser groups and two crop-editor/guide
browser groups. Five release and
reading-preference checks pass. Browser checks use isolated fictional accounts and
production-mode HTTPS at 320, 390 and 1440 pixels; they are not physical phone tests.
All 29 migrations apply to an empty isolated database. A fresh encrypted production
backup restored locally, upgraded from 28 to 29 migrations and preserved original
column fingerprints in 71 existing tables. The new backfill matched the permitted
READY personal sources without creating posts or current-image changes.

Before activation, apply the verified additive migration, confirm the new serving
code and reconcile any READY personal images created by the preceding deployment
between backfill and handover. Only missing associations may be inserted; existing
audiences, hidden/deleted state and retired objects must never be reset. Confirm
zero missing eligible associations before enabling retention. Disabling the library
later still enforces every stored photo audience and preserves retained history.
Production release identity and activation evidence are recorded after deployment.

## Verified production activation

Application `42f62219c3d9c1faabc35fcd9c70ea99c4786353`, product `2026.09.12.6`,
serves from READY deployment `dpl_GV1ZG2UaUysw4eaneJhgfZuQRcaW` on the independently
verified canonical domain. Included service/interface checkpoints are `5c475bf`
and `16512aa`. The live return-path check found that account-entry normalization
removed the Photos tab; its narrow allowlist now preserves that tab on profile
routes while discarding other arbitrary queries. Twelve navigation and two release
checks, the final production build and two real sign-in-entry browser checks pass.

The fresh encrypted production backup restored and upgraded successfully. One
additive production migration brought the database to 29 matching migrations;
original-column fingerprints in 71 existing tables matched. Two derived personal
associations were inserted; no user content was created or altered. Compatible code
was deployed with retention off, old requests drained, and zero active uploads or
missing eligible associations were found. Only then was retention enabled in the
existing private Blob environment. The final 15 live read/browser checks passed at
06:58 UTC with zero application mutation requests, browser errors or runtime error
rows. Authenticated editing/privacy proof uses isolated fictional accounts. Physical
phone rehearsal and later named-album acceptance remain separate requirements.

## Named album extension — contract before activation

Named albums are owned reference collections inside profile Photos. A signed-in
reader must pass current profile, album and each source-photo predicate. Album
audiences are Only me (default), signed-in Members, or an approved Church; this
slice introduces no public profile/album navigation. A Public source photo remains
public elsewhere even when its album is private. Album title, cover, counts,
thumbnail pages and enlarged views apply the same intersection. Block, source
withdrawal, Church removal and account lifecycle changes apply on every read.

The bounds are 50 owned albums, 100 distinct owned photos per album and 24 visible
photos per page. Album lists are capped at 50; only one permitted cover and filtered
count per album are returned. Photo cursors bind viewer, album and version, so
reordering invalidates stale pages. No storage write occurs when adding a reference.
An unreadable chosen cover falls back to a currently readable member or a neutral
empty state. Owner management may show a neutral unavailable-reference row so it
can be removed, without projecting inaccessible source content.

Create, rename, audience/cover changes and add/remove/reorder use one versioned
snapshot and the existing exact-body social receipt. New members must be current
readable owned PersonalPhoto records at their expected photo/image versions.
Existing unavailable references can be removed without a new source grant. Shared
contributors, tagging and album conversations are outside this slice.

Deleting an album explicitly removes its references and metadata, preserving the
underlying photos. Retiring a referenced asset requires first removing its album
references; this applies to personal deletion and source gallery removal, and
explains the required action rather than silently deleting an album. Source post
withdrawal continues to deny reads while retaining its original byte lifecycle.
Album reference creation and image retirement use the existing shared lifecycle
lock. A retired/deleted asset cannot acquire a new reference; a prior album
reference prevents retirement. Only an explicit separate last-use photo deletion
queues the unchanged 24-hour cleanup grace. Export includes only the owner's album
metadata and ordered references; deactivation stays reversible and denies reads.

The additive album schema has no data backfill or user-content mutation. New album
operations remain off behind PHOTO_ALBUMS_ENABLED until processed privacy/race
fixtures, browser recovery checks, fresh backup/restore and migration rehearsal,
compatible deployment and old-request drain are verified. The flag never bypasses
existing source privacy or the reference guard once records exist.
