# Image foundation

Engineering checkpoint 6.1 · September 10, 2026 · `codex/image-foundations`

For the September 12 maintenance integration and activation gate, see
[Image maintenance and activation](MEDIA_MAINTENANCE.md). The original evidence
and limitations below are historical; use the newest dated operational receipt.

## Implemented

The shared image service supports personal avatars/covers, church logos/covers
and up to ten photos per published post. This checkpoint provides processing,
storage, access control and API behavior. Upload/crop/progress/gallery controls
and profile presentation follow in separate checkpoints.

An upload accepts at most 4 MiB of actual streamed bytes. JPEG, PNG and WebP are
identified from their contents and fully decoded with strict warning handling.
Empty, truncated, oversized, animated WebP/APNG and other formats are rejected.
Decoded inputs are limited to 40 million pixels and 16,384 pixels on either side.
Processing normalizes orientation, converts to sRGB and re-encodes WebP without
retaining EXIF/GPS, XMP, ICC, IPTC, filenames or appended payloads. The `original`
variant is the normalized full-resolution image; the supplied raw file is never
stored. Additional variants fit within 1,600, 800 and 240 pixels without enlargement.
Each variant is limited to 4 MiB so direct responses also fit the hosting payload
limit; the combined output limit is 12 MiB. Decode/encode deadlines and a 45-second upload
deadline bound work. Every variant records its actual dimensions and byte length.

Each request binds a stable reference to its signed-in uploader, target, exact
file bytes, caption, alternative text and replacement. Retrying a completed
request returns the existing image. Concurrent retries do not create another
asset; changing the input requires a new reference. A two-minute processing lease
allows interrupted requests to retry with the same asset ID and a fresh immutable
storage prefix. The database reserves active photo slots before storage writes.
Ten concurrent photos can succeed; an eleventh cannot exceed the limit.

A replacement identifies the previous ready image explicitly. The previous image
remains available until processing, all storage writes and a final authority check
succeed. A competing replacement produces a conflict. Removal is versioned and
invalidates delivery immediately. Post image mutations increment the post version
and edited timestamp so an older text editor cannot silently overwrite a newer
image change.

## Current permissions and delivery

All original and derivative files live behind the same application boundary:

- Member profile images require a current signed-in account and an active profile
  owner. Only that owner can change them. Guest author projections still contain
  only their existing minimal identity fields.
- A listed church's identity images are public; an unlisted church requires a
  current approved connection. Changes additionally require the current
  `MANAGE_CHURCH_PROFILE` grant, with its dependency checked.
- Post photos inherit the post's current status, author visibility, audience,
  church membership and linked event restrictions. Changes additionally require
  current post edit authority. Withdrawing a post hides every image variant.

Permission is checked before storage reads and again after the complete bounded
file is fetched. Membership/session revocation during that fetch cannot return
the bytes. Delivery never redirects to a storage URL, sends a signed bearer URL,
or forwards storage cache headers. Responses explicitly disable browser/CDN
caching, vary on cookies, and use fixed WebP MIME and filenames with `nosniff` and
same-origin resource policy. Range and conditional headers do not bypass the
checks. The shared Next image optimizer accepts only the existing static image
directory; upload endpoints cannot enter its persistent cache.

Already displayed or downloaded bytes cannot be recalled. Visibility changes
govern subsequent reads. These controls do not make a public photo confidential
after a visitor has obtained a copy.

## Storage and cleanup

`MEDIA_STORAGE_MODE` defaults to disabled. The production adapter uses
`@vercel/blob` 2.8.0 with explicit private access, immutable generated keys,
authenticated uncached reads and abort signals. It requires a connected private
store through server-only configuration. No storage URL or credential appears
in the API image view. The local adapter runs only with the isolated test flag,
loopback fixture database, a directory within `.account-test`, and no Vercel host.
It writes private fixture files outside the public directory.

Every external write has a durable garbage record before I/O. A successful
attachment removes that record; incomplete attempts and removed/replaced images
retain it. The bounded `collectImageGarbage` maintenance function processes at
most 20 due prefixes, skips current ready/active attempts, expires abandoned
leases, and deletes all four variants idempotently. A 24-hour grace period is
longer than request/lease deadlines. Provider deletion failure preserves the
record for retry. A crash or lost storage reply does not require knowing which
individual files reached storage.

An actual cleanup worker, provider setup and provider acceptance are required
before enabling uploads publicly. This checkpoint does not schedule maintenance,
create a store, or establish an external object backup. Metadata and retry
tombstones remain in PostgreSQL; broader account-deletion/retention work remains
in the existing queue. Media still attached to a withdrawn post is retained with
that post and denied to readers.

## API and migration

- `GET /api/platform/images?purpose=…&targetId=…` returns at most ten currently
  readable image views.
- `POST /api/platform/images` accepts the binary image body plus URL-encoded JSON
  in `X-Image-Details`: purpose, targetId, requestKey and optional replacesId,
  caption (500 characters) and alt (300 characters). Unknown actor fields are
  rejected. The server ignores client MIME/filename assertions.
- `DELETE /api/platform/images` accepts image id and expectedVersion in JSON.
- `GET /api/platform/images/{id}/{original|large|medium|thumb}` returns authorized
  WebP bytes with no shared cache.

Writes require a same-origin request, current session and durable account/IP
limits. Authentication is established before consuming an upload body; final
target authority is independently checked by the service. Errors preserve the
old image and avoid exposing provider messages or private paths.

Migration `20260910150000_image_foundations` adds `MediaAsset` and `MediaGarbage`.
Target constraints enforce exactly the appropriate profile/church/post relation;
partial unique indexes allow only one ready avatar/cover/logo for each target.
Existing account, church and post rows retain their values.

## Verification record

Processing (8), database service (7) and request-boundary (3) groups passed with
actual synthetic image bytes and isolated PostgreSQL. Checks include pixel-level
orientation, metadata removal, transparency, valid 24-megapixel images, oversized
decoded and encoded outputs, APNG/WebP animation, interrupted/repeated writes,
ten-photo contention, stale replacement/removal, garbage deletion failure/retry,
and authorization revoked during storage I/O.

The full regression command passed 245 checks and two expected disabled-delivery
skips before a test-harness mode error stopped two production image groups. The
fixture guard correctly rejected a production-mode test writer. The runner was
corrected to use its existing isolated fixture environment while keeping the
actual website renderer in production. All 49 remaining production HTTPS checks
then passed, including both image groups. Two additional processing/cleanup
checks passed in focused reruns: 298 distinct checks in total, 296 passing, two
expected skips and no unresolved failures. The final service and boundary rerun
passed all ten groups, and final processing passed all eight.

Additive upgrade, fresh migrations and the database backup/restore rehearsal
passed, including new media rows, constraints and indexes. HTTP checks exercise
actual persistence, stable retry IDs, every derivative, minimal JSON, guest
denial, current church/event visibility, former members, removal, and optimizer
rejection in both development and production over verified local HTTPS.

Build review found the local filesystem adapter caused Next's file tracing to
include the private fixture folder. The folder is now explicitly excluded and
the release checker rejects private fixture, Git and environment paths. Running
that new guard against the old trace failed as intended. The corrected final
build passed with 89 traces, 6,784 entries and 219 server JavaScript files; none
contains a private fixture/environment path or Prisma configuration loader.
Both final production HTTPS image groups passed again against that build.
Lint, standalone TypeScript and whitespace checks passed.

Production Blob transport, real media, physical Samsung, image UI, external
object backup and a deployed cleanup worker remain unverified. No storage was
created or production configuration changed. The post/image changes remain
local and unpublished; the calendar release remains live.

The existing dependency audit reports the same three high-severity Prisma
configuration/deepmerge findings. The runtime-trace check continues to prohibit
the Prisma configuration loader from application traces; an automatic major
dependency downgrade was not applied.

Implementation references: [Sharp metadata defaults](https://sharp.pixelplumbing.com/api-output/),
[Sharp input bounds](https://sharp.pixelplumbing.com/api-constructor/), and
[Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk).
