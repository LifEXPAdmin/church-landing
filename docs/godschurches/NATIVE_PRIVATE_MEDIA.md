# Native private image transport

The v1 image routes call the same media services as the website. They add native
credential transport and bounded descriptors, without copying permission,
processing, storage, retry or garbage-collection logic. The adapter has passed
isolated local service, production-build and HTTPS checks. Integration, device,
real-provider and live acceptance remain separate.

## Transport and supported operations

Every request requires `Authorization: Bearer <session-token>` and
`X-Expected-Account: <original-account-id>`. Tokens are never accepted in URLs.
The native boundary rejects browser Origin/Fetch Metadata, session cookies,
ambiguous query parameters and unexpected fields. The existing browser routes
retain their cookie and CSRF behavior.

| Method and path | Input and result |
| --- | --- |
| `GET /api/platform/v1/images?purpose=...&targetId=...` | Up to ten current authorized image descriptors for the selected target. |
| `POST /api/platform/v1/images` | Raw file bytes plus encoded JSON in `X-Image-Details`; returns an image descriptor. |
| `DELETE /api/platform/v1/images` | JSON `id` and `expectedVersion`; returns the canonical removal result. |
| `GET /api/platform/v1/images/:id/:variant` | Current authorized image bytes, with `original`, `large`, `medium` or `thumb`. |

Collection commands support `PROFILE_AVATAR`, `PROFILE_COVER`, `CHURCH_LOGO`,
`CHURCH_COVER`, `POST_PHOTO` and `EXCHANGE_PHOTO`. Personal-library pagination,
album/tag controls and support attachments keep their separate canonical
workflows. This adapter does not grant ordinary image readers access to support
attachments. Direct delivery retains the canonical policy for an existing image,
including an authorized personal photo; an ID is never authorization.

The small collection limit cannot replace the paginated personal photo library.
Native commands for that library and private support intake require their own
adapters. Core feed/profile projections remain conservative about media and may
still require the website. The new `media.images.*` capabilities describe these
image endpoints, not a general media-library or audio/video player capability.

## Exact upload and retry contract

`X-Image-Details` is URI-encoded JSON containing exactly `purpose`, `targetId`,
`requestKey`, `replacesId`, `expectedVersion`, `caption`, `alt` and `crop`.
The request key is a lowercase UUID v4. New uploads use null replacement ID/version;
replacement requires both the prior asset ID and version. Crop is null for the
default framing, or finite x/y from zero to one and zoom from one to four for
cropped identity pictures. Post/listing images use null crop. Caption and alt
text retain the canonical 500 and 300 character bounds.

Upload raw JPEG, PNG or WebP bytes using the corresponding image content type
or `application/octet-stream`. File signatures and decoded content remain the
server's authority. Multipart, base64 JSON, SVG and animation are unsupported.
Encoded details are at most 8 KiB, actual streamed bytes at most 4 MiB, still
images at most 40 million pixels and each normalized derivative at most 4 MiB.
The existing decoder removes source metadata and creates WebP variants.

The authenticated account and existing image rate budget are checked before
consuming the body. Native size/format/input failures use the v1 `validation`
error with HTTP 400; the browser's existing HTTP 413 behavior is unchanged.
Explicit native privileged challenges use `authenticator_required`; canonical
services can instead deny an unavailable privileged action with `forbidden`. Unexpected failures
return `unconfirmed` without provider, database or input details.

The canonical upload receipt binds the acting uploader and request key to
normalized metadata plus the original bytes. Replacement version is included
when supplied. After an uncertain response, retain the same account, key,
metadata and file bytes. Reusing a key with changed input is a conflict. A
successful replacement creates a different asset, not an incremented old ID.
An exact retry can return the current version of the already-ready asset.

## Identity, cancellation and cleanup

Expected account identity is checked inside both the reservation and final
publication transactions. Existing permission/MFA checks run in both phases.
The reservation and cleanup ledger commit before processing or storage; no
outer transaction holds account locks across storage I/O. Permission or session
loss prevents publication even if storage has already accepted some bytes.
Replacement versions are checked before and after storage.

Delivery checks current identity and audience before and after storage reads.
Expired native credentials cannot silently become a public guest. Responses
are private/no-store and vary by Authorization, Cookie and expected account.
No storage redirect, shared optimizer, range/conditional response or signed URL
is introduced. Descriptors contain only bounded metadata and fixed native paths.

Cancellation is bounded by the request signal and time limits. A late lost
response can still leave a committed result, so clients reconcile by exact
retry. Failed attempts retain the canonical garbage ledger and grace period;
they do not delete objects that an uncertain provider operation may still write.
The server does not create a new upload temporary-file mechanism. Native device
pickers, local-file retention/removal, account-change cache clearing and actual
device cancellation must be verified in their platform adapters.

Data saver consumers should request thumbnails first and fetch larger variants
only on an explicit choice. Descriptor byte counts allow a transfer-size hint.
Existing website Data saver behavior remains owned by its current provider and
viewer; no preference, database schema or storage provider is replaced.

## Verification boundary

Application source `6976a72cad06bdae1448ba4c443058074def23c6`, production build
`3XOVMPDcXSfgfEou7COuz`: 63 contract/service checks and 6 actual local HTTPS
checks pass against an isolated fictional database with all 125 migrations.
Full TypeScript, lint, source/copy security, build, hydration and runtime-trace
checks pass. Lint retains 39 existing warnings and no errors. The build scan
covers 270 traces, 67,427 entries and 663 server JavaScript files.

Focused checks cover native contract rejection, body/metadata limits, account
consistency, exact replay, version conflicts, private audiences, revocation
during storage access, uncertain writes and cancellation. Canonical media,
personal-photo, recovery, abuse-budget and browser HTTPS regressions pass.
A saved personal-photo reference is readable through its current post audience;
its database position is separately bounded from an ordinary media asset.

Retained failed attempts exposed a dependency-copy resolution error and two
fixture assumptions: missing church MFA produces a canonical permission denial,
and saved-photo references have a database position limit. Those fixtures were
corrected before the passing run. All owned runtime processes stopped gracefully
and their three ports were checked closed. A later test-only correction makes
uppercase UUID rejection deterministic; it does not change application code.

No browser or physical-device acceptance was performed for this server adapter.
Native picker behavior, HEIC conversion, local-file cleanup, account-cache
clearing, real storage providers and the combined production release still need
their respective acceptance. The full dependency security gate remains blocked
as recorded in `DEPENDENCY_REMEDIATION.md`. This receipt does not establish a
schema-1 complete product release or canonical live acceptance.

## Compatibility admission

The [native compatibility policy](NATIVE_API_COMPATIBILITY.md) can separately
pause image reads, listing, upload or removal without deleting assets or receipts.
Disabled requests stop before body/database/storage work. Already admitted uploads
may finish; retain exact retry inputs and reconcile after admission is restored.
