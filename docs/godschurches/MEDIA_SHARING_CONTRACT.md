# Gallery and public sharing foundations

September 11, 2026. Reuse existing image processing/delivery and canonical data.
See the newest batch report for release evidence. Photo UI, upload-provider
acceptance, dynamic page metadata, QR rendering and mobile sharing remain focused
follow-on work. No storage provider was activated by this foundation.

## Post galleries

`post-gallery.ts` backs `GET/POST /api/platform/gallery`. It uses the shared
session/version/retry protocol in SOCIAL_FOUNDATIONS_CONTRACT.md. GET query
`postId` returns `{postId,postVersion,canManage,imagesAvailable,images,pendingUploads,limit:10}`.
Only currently readable published posts are available. Images are READY assets
in persisted position/ID order, never UPLOADING/RETIRED storage objects.
Pending upload count is returned only to a current manager.

An ImageView has id/version/purpose/caption/alt/position/crop and variants
`original`, `large`, `medium`, `thumb`. Each variant includes width/height/bytes and
a same-origin `/api/platform/images/{id}/{variant}` URL. Storage prefixes,
credentials, uploader IDs and private contacts are never exposed. Reserve layout
space from dimensions. Use responsive medium/thumb images; fetch a large image
when opening it. Do not prefetch every original. A reduced-data presentation can
use thumbnails until explicit Open/Load, without changing access.

| POST operation | Fields in addition to mutationId/postId                               | Behavior                                                                                                           |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| reorder        | expectedVersion=postVersion, images=[{id,version},…] in desired order | Every current READY photo exactly once, max ten; reject missing/foreign/duplicate/stale images and pending uploads |
| metadata       | expectedVersion=postVersion, imageId, imageVersion, caption, alt      | Replace caption up to 500 and alt up to 300 characters                                                             |

Both actions require current post edit rights, increment the post version and
affected image versions, and return `{id:postId,version:postVersion,message}`.
Re-fetch the gallery before the next change. A caption/reorder conflict never
silently overwrites another tab's work. Exact retries use the original entire
body/key and do not change order or versions again.

Upload/replace/remove continue through the existing image API and its tested
storage adapter. `POST /api/platform/images` accepts the bounded binary body plus
URL-encoded JSON in `X-Image-Details`: purpose, targetId, requestKey (UUID), optional
replacesId/caption/alt/crop. POST_PHOTO takes null crop; avatar/cover crop uses the
existing bounded ImageCrop contract and approved aspect. Max input 4 MiB, still
JPEG/PNG/WebP, max 40 MP decoded, four oriented/metadata-stripped WebP variants,
12 MiB total output. Retry the same bytes/details/key; changed bytes need a new key.
`DELETE /api/platform/images` uses `{id,expectedVersion}`. Removal/replacement
retires old delivery and creates durable cleanup records. Each derivative
rechecks current rights before and after storage I/O; source withdrawal stops all
variants. Keep those URLs unoptimized and uncached as the current component does.

Use the returned imagesAvailable flag and media-storage.ts readiness helper to keep production upload controls honest while
private Blob is unconfigured. Medium may implement/test upload UI using isolated
fictional assets and the local adapter; publishing disabled-provider UI does not
claim actual provider acceptance. Church logo/cover controls use existing
CHURCH_LOGO/CHURCH_COVER purpose and MANAGE_CHURCH_PROFILE. The read adapter is
`GET /api/platform/church-images?churchId=…` backed by `church-images.ts`:
`{churchId,canManage,imagesAvailable,logo,cover}`. It returns the current allowed
ImageViews or null and requires public listing or current church membership.
Only a current approved member with MANAGE_CHURCH_PROFILE can manage identity
images; public read access is not an edit grant. A logo never implies
verification. Personal profile media continues to require an account.

Viewer acceptance: keyboard close/next/previous, current-photo label, focus return,
captions and alt, missing/withdrawn images, reserved dimensions, enlarged text,
reduced motion/data and nested gestures. Carousel gestures must not turn the Bible
feed at either end. Upload/editor acceptance: ten real images, one failed upload
does not discard others, retry retains the image identity, persisted reorder,
two-tab metadata conflict, remove and denied direct derivative access.

## Canonical sharing and previews

`public-sharing.ts` supplies `canonicalSharePath` and `publicSharePreview`.
`GET /api/platform/share-preview?kind=…&id=…` accepts post, comment, church,
event or profile. Comment uses the post ID plus commentId. Event IDs are
CalendarOccurrence IDs, not CalendarEvent IDs. Profile IDs are usernames.

Paths are `/platform/posts/{id}`, `/platform/posts/{id}?comment={commentId}`,
`/platform/churches/{id}`, `/platform/events/{occurrenceId}` and
`/platform/profile/{username}`. The origin comes from canonical server config,
never request Host, a form or a redirect query. A URL/QR grants no membership,
invitation privilege, staff role or permission to RSVP.

The preview result is `{available,kind,path,url,title,description,author,image}`.
author is null or `{name,kind:person|church}`. image is the existing public branded
PNG at `/brand/share-card.png`, absolute canonical URL, 1200×630 with alt text.
No uploaded original, private thumbnail or internal acting publisher is included.
The service is the permitted data adapter for future Open Graph/card components.
It does not itself install metadata into every HTML route or render a QR.

Anonymous permission is the upper bound, even for signed-in callers. Public,
published, nonwithdrawn posts and their readable comments may supply public author
labels; public prayer/comment preview descriptions remain generic. Public church
previews require communityListed. Event previews require active, uncanceled public
church occurrences/calendars. Personal calendars and member profiles never supply
rich previews. A signed-in block may further narrow a preview; it cannot widen it.
Missing/private/withdrawn targets return the same generic branding and no author,
private content, counts, directory contacts or source-specific explanation.

Responses are no-store at browser and CDN layers and vary by Cookie. Future
metadata/image renderers must call this current-access adapter without a privileged
session and keep revocable data out of long-lived generated caches. Third-party
copies already made cannot be guaranteed erased. Use the static branded image
as a safe fallback rather than exposing stored media URLs.

`safeAccountReturn` preserves a validated comment ID on post routes while removing
tokens/authority flags and rejecting external, protocol-relative, control-byte,
backslash and unapproved paths. Authentication still rechecks the destination's
access. Comment target highlighting/context UI is a separate Medium integration;
the server context API can already retrieve the exact permitted target.

Share controls may use an available public preview's canonical URL for explicit
Copy, native Share and locally rendered QR. Handle unavailable/canceled native
share and clipboard failures accurately. No automatic message, contact import or
invitation is part of this contract. Reposts and their revocation/attribution
lifecycle remain an independent high-level foundation.

Tests: `tests/gallery-sharing.test.ts` uses ten actual processed images, ordering,
metadata races, source withdrawal, public/private/profile/comment/event previews
and safe authentication returns. `tests/social-foundations-http.test.ts` exercises
the actual production-mode local HTTPS API, CSRF, session revocation, ownership,
public image delivery and generic crawler responses. These run in the full
isolated account harness; they do not create production fixture records.

## Shared controls and demo entry

Public post/church/event pages use `PublicShareControls` and anonymous metadata
reads. Each Copy/Share/QR action rechecks the existing preview; native completion
means the dialog completed, not that another person received anything. QR codes
are generated locally and PNG download remains disabled until drawing completes.
`/platform/share` is a separate app-level entry using the configured canonical
`/platform` URL. It grants no additional permissions. Public metadata uses the
existing 1200 by 630 branded card; unavailable/private targets remain generic.

Post/comment personal avatars use the account-gated image list and derivative
routes with owner checks and no-store delivery. Initials remain for guests,
church publishers or unavailable images. No raw storage URL enters public HTML.
Private Blob connectivity was exercised, but public upload mode remains disabled
until the existing image cleanup-worker gate is satisfied. The feature guide
explicitly records this limitation.

## Permitted photo presentation

The reusable PhotoViewer re-reads the existing image or gallery endpoint before
showing the selected photo. It preserves persisted order, caption and alt text,
supports up to ten gallery images, and requests only the opened large derivative.
Zoom is bounded to three times the fitted display; it does not eagerly request
originals. Profile-header avatar/cover buttons reuse it, while feed avatars retain
their existing profile navigation. Post reads expose a READY photo count only
after the current post audience check. Visible post galleries load thumbnail
lists on approach to the viewport; photos do not add a new access rule.

Native dialog focus, scroll restoration and a same-URL history entry let Close,
Escape and Back return to the page. Previous/Next, arrow keys and horizontal
single-touch gestures move only inside the viewer. Foreground, relationship and
connection refreshes recheck the expected signed-in account. Concealed or revoked
sources are cleared; a removed selected ID does not silently show a replacement.
No service worker, original prefetch, new storage association or retention is
introduced by this presentation layer. History and personal photo libraries
require their separate lifecycle contract.

Pending photo panels share one Back guard. After profile-photo Discard, its
asynchronous history cleanup must finish before completion is announced. A
same-window link clicked during cleanup waits for settlement. Discarding one
selection preserves other pending panels, unsaved profile text, upload state and
the viewer's independent history entry. Successful saves use the same settlement
boundary before allowing navigation.

## Church management navigation and identity controls

The public church detail and approved-member overview project current church
capabilities through `church-tools.ts`. Manage church links reuse the existing
profile claim, organization, roles, privileges, chart history, access and review
routes. A profile editing link requires an owned activated approved claim in
addition to current profile management permission. Contributors and pending
claimants receive only their own status and next action; authority/contact data
and other people's claims never enter this navigation projection. A community
listing does not appoint its contributor. Ordinary member links remain separate.

`ChurchIdentity` uses the existing church-images adapter and shared crop editor
for CHURCH_LOGO and CHURCH_COVER. `canManage` and `imagesAvailable` remain server
facts; approved membership and current MANAGE_CHURCH_PROFILE are required on
every mutation. Images on public listings remain public; unlisted identity
requires current approved membership, including every derivative and viewer read.
Logo imagery never implies a verified-management badge. Church replacements use
the existing retirement policy and do not enter a personal history or library.

Selection/crop and immutable upload retry bodies survive uncertain connections.
A conflict explicitly reloads current saved identity before the user retries
their edits. Foreground/sign-in checks hide stale projections, clear selected
files on changed account or lost management, and recheck access at the write
boundary. Provider-disabled controls explain unavailable uploads. Existing
personal picture history and reply-permission behavior remain unchanged.

Isolated verification covers real independent claim review/activation, contributor
and pending claimant privacy, scoped managers, ordinary members and revoked
manager access. Processed media checks cover public/unlisted reads and lifecycle;
mobile browser checks exercise both crop ratios, cancel, replacement, removal,
exact lost-response retry, concurrent edits and revoked-access cleanup. Production
release evidence is recorded separately after the deployment is verified.

## Current-account church welcome projection — September 12, 2026

The existing uncached church-tools read now projects optional introduction/photo
steps, current follow state, own connection state and a boolean for a connection
elsewhere. It returns no bio, other church ID or additional private member data.
Guests receive no personalized steps. The shared client conceals and rechecks
on account/visibility/relationship changes. Member team links still require
current approved eligible membership, and every destination checks access again.

Welcome copy uses the church's existing published website; optional steps stop
being offered after completion. Pending connections are acknowledged and disabled
review intake is stated. No representative, ministry record, external form
submission or source-content publication is inferred. Prepared church-specific
content remains subject to the normal claim/correction and approval workflow.
Three service groups cover own-state projection, contributor/claim privacy and
current grants/revocation; the latest release/browser evidence is in Current State.
