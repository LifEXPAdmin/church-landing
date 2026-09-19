# Native media quotas, cleanup and operating budget

## Status and activation boundary

September 19, 2026 candidate against integrated `1fbcf9f`. Current native audio/
video authorization is **zero files, zero bytes and zero new provider spend**.
This document supplies proposed numerical limits and a release checklist. It
does not approve a provider, purchase a plan, provision storage, start processing
or enable uploads. The project owner must accept the provider, complete cost
estimate, operating budget and unresolved delivery/cleanup requirements first.

Preserve the accepted [catalog](MEDIA_CATALOG_CONTRACT.md) and
[publishing policy](MEDIA_PUBLISHING_CONTRACT.md), including current audience,
rights assertions, church duties, canonical identity, version/retry and source
revocation. Initial external links remain usable without native hosting. Still
images remain owned by `media-processing.ts`, `media-storage.ts`, image access
and maintenance: 4 MiB input, 40 million decoded pixels, bounded normalized WebP
variants. Existing private Blob credentials and image allowance are not a native
video budget. Do not relax the image decoder or stream video through its API.

The proposed first native pilot is recorded VIDEO only, a maximum of ten
explicitly authorized adult personal/church publishers. AUDIO-only uploads,
live streaming, HDR, automated excerpts, transcription/translation, downloads
and offline copies remain zero allowance until separately accepted. Existing
external AUDIO sources are unaffected. This limited pilot is a proposal, not
an assertion that a provider or the application already enforces these limits.

## Provider evidence and unresolved fit

Public documentation was checked September 19, 2026; rates are estimates, not
the project's account contract, current bill or proof of configured controls.

- Cloudflare Stream is a candidate to evaluate for managed video storage,
  encoding and delivery. Its published on-demand rates are $5 monthly per
  1,000-minute prepaid storage block and $1 per 1,000 delivered minutes. Encoding
  and ingress are included. Pending direct-upload duration reservations consume
  capacity; buffering/preloading counts as delivery. Do not assume trial credits,
  bundled allowances or enterprise rates. [Stream pricing](https://developers.cloudflare.com/stream/pricing/)
- Direct creator URLs can keep the provider API token server-side. For files
  above 200 MB, the documented upload path is resumable TUS; duration reservation
  and upload expiry belong in server-created constraints. The application's
  byte/owner limits must also be enforced and tested, not trusted from browser
  metadata. [Direct uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/)
- Provider signed URLs have expiry and signing-key revocation. Those primitives
  alone are not this application's per-account current audience check or a
  demonstrated spend ceiling; a copied still-valid token may continue to work.
  Signed delivery must also protect thumbnails/manifests. No native restricted
  audience is approved until actual revocation behavior meets the accepted
  source policy. [Stream access controls](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/)
- Stream does not return the exact uploaded original for download. A transcoded
  output is not an original-file backup. The owner must retain their source,
  or a separately costed/authorized original archive must be approved. Do not
  secretly add another storage copy. [Stream FAQ](https://developers.cloudflare.com/stream/faq/)
- Existing Vercel Blob is an alternative storage component, not an accepted
  transcoding/delivery pipeline. Private delivery through Functions incurs both
  store-to-Function and Function-to-viewer transfer components; multipart uploads
  add operations. Storage-only price is not the all-in video cost. A Blob-based
  option needs a separate processor, measured serving path and complete region/
  plan estimate before selection. Preserve current private image delivery.
  [Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)

Choose and record one pipeline only after the checklist passes. In particular,
public unrestricted provider URLs cannot enforce a per-project delivery budget,
and short token expiry cannot substitute for immediate source withdrawal.
If the candidate cannot satisfy current access and bounded liabilities, keep
native media disabled or revise the delivery design through its existing owner.
This definition does not weaken the policy to accommodate a provider.

## Proposed upload and processing limits

All limits below are server-side reservations and verified actual usage. The
most restrictive actor, owning church, global capacity or cost limit wins.
An account cannot evade a personal rate limit by uploading for several churches.
Quotas include draft, unpublished, pending, failed-awaiting-cleanup and retired
bytes until the provider confirms removal. Repeated identical requests consume
one reservation; cancellation is not an immediate quota refund before cleanup.
Pending-minute capacity includes uploading and processing reservations together;
the separate concurrency maxima never authorize exceeding that total.

| Dimension              | Proposed pilot maximum                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One input              | 2 GiB actual bytes, 3,600 seconds, one recorded MP4 video track with H.264 and optional AAC mono/stereo audio                                                                     |
| Decoded media          | Positive dimensions, at most 1,920 pixels on either axis and 2,073,600 pixels per frame; at most 30 frames/second and 108,000 frames; SDR only; audio at most 48 kHz/two channels |
| Personal owner         | 5 new upload attempts and 4 GiB accepted/reserved input over a rolling 30 days; 120 retained/reserved minutes                                                                     |
| Church owner           | 12 attempts and 10 GiB over a rolling 30 days; 360 retained/reserved minutes across all its editors                                                                               |
| Platform inventory     | 600 retained source minutes plus at most 240 pending minutes, inside one 1,000-minute provider storage block; 20 GiB reserved input over rolling 30 days                          |
| Concurrent work        | One open upload and one processing asset per actor; two per church; four uploads and two processing assets globally                                                               |
| Upload lease           | One source-bound attempt, expires after 60 minutes; deliberate cancellation stops further application authorization                                                               |
| Processing attempts    | Initial attempt plus one explicit retry, same logical asset/generation; no automatic unbounded provider recreation                                                                |
| Processing deadline    | 60 minutes from completed upload, including retry; timed-out work becomes terminal failed and enters cleanup                                                                      |
| Control requests       | Durable shared rate-limit owner; at most 10 new upload authorizations per actor/day and 50 platform/day, in addition to tighter 30-day quotas                                     |
| Polling/reconciliation | Signed completion events preferred; visible status no faster than once per 15 seconds, no background poll loop; bounded provider reconciliation at most 100 records/run           |

GiB means 1,073,741,824 bytes; provider GB billing units must be converted in the
estimate. Count actual transfer, duration and decoded shape; extension, browser
MIME, Content-Length and supplied duration are not enough. Reject zero/truncated,
malformed, encrypted/DRM, multi-video-track, archive, executable, remote playlist
and unsupported codec/metadata inputs. Do not fetch arbitrary publisher URLs or
pass user strings into a shell/transcoder command. No hidden source URL imports.

Use direct authorized resumable upload or an approved bounded quarantine path,
never a 2 GiB Next.js request buffer. An unverified upload stays private and
unattachable. The chosen pipeline must prove signature/container validation,
bounded probe/decoder behavior and output checks. If provider metadata cannot
prove a required bound, keep the item failed/unavailable. A custom probe/worker
would need its own accepted CPU, memory, disk, network and priced runtime limits;
none is authorized by the managed-provider estimate here.

Provider-internal transcoding resources are not measured app CPU. Do not claim
to enforce a vendor worker's memory or wall time from a UI timeout; cancellation,
deletion and outstanding liabilities must be reconciled. The application deadline
stops retries/publication even when the vendor still has work to clean up.

Completion events require signature, freshness, exact provider/account/asset
binding and idempotent state transitions. Verify current source owner, expected
generation and actual output metadata independently before READY. A duplicate,
late or out-of-order event cannot revive a canceled source. Stream documents
signed webhook bodies and distinguishes first-playable from fully encoded
outputs; require all selected mandatory renditions before publication.
[Webhook status and authenticity](https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/)

READY means validated required outputs exist, not published. Publication still
needs current editor authority, rights, audience and canonical catalog checks.
Do not emit captions, thumbnails or a source URL before their own validation/
privacy boundary. Optional outputs cannot bypass a missing required playable
source; generated captions and paid AI processing remain disabled in this pilot.

## Proposed cost envelope and stop rules

Candidate budget: **$25 USD of incremental native-media cost per billing month**,
with a $15 warning and $20 admission stop. Reserve the remaining $5 for already
authorized work, cleanup and billing lag. This is a requested operating limit,
not an approved purchase or a provider-guaranteed invoice cap. It excludes
pre-existing application subscriptions only after their baseline is recorded;
new processing, storage, delivery, app compute/requests, queues, logs, extra
backups, taxes and transaction/region charges attributable to native media must
fit inside it. Unknown charge categories are unresolved, never zero.

Illustrative managed-video subtotal: one 1,000-minute storage block is $5/month;
5,000 delivered minutes add $5, totaling **$10** before incremental application
costs/taxes. A 600-minute library still buys that one block; 100 viewers each
receiving 30 minutes add 3,000 delivered minutes ($3), not 30 minutes. These are
arithmetic examples using the cited list rates, not actual demand or a complete
approved quote. Set the proposed monthly delivery allowance to 5,000 billed
minutes, including buffers, retries and downloads if ever authorized. Current
downloads are disabled. Reprice at approval and before changing providers/plans.

The future budget owner records current-cycle committed charges, conservative
unbilled usage, outstanding upload/playback liabilities and recurring storage
commitments. Reserve before issuing provider work, atomically with actor/church/
global quotas. Never oversubscribe from concurrent tabs or forgive reservations
because a client disconnects. Count failed requests, duplicate provider work,
billable preview/buffer requests and cleanup costs where the provider charges.

Warn at $15 or 75% of any hard resource allowance. Stop new upload/processing/
playback authorizations when conservative total plus the next reservation would
reach $20, or a resource allowance would be exceeded. At $25 or unexpected cost
growth, invoke the verified native-media emergency pause and alert the operator.
Stop earlier on stale/missing usage telemetry (over 15 minutes), inconsistent
reservation totals, unknown billing rates or failed delivery revocation. Keep
safe removal/cleanup operational through the reserved budget. Do not pause the
whole existing website/image service to stop a new optional media subsystem.

Before approval, demonstrate that the chosen provider/delivery controls bound
traffic after pause, including copied valid tokens, concurrent/range/segment
requests, leaked URLs and already queued jobs. Merely ceasing new token issuance
does not prove this. If those liabilities cannot be bounded within the $5 reserve,
the $25 budget is not enforceable and the pilot remains disabled. Provider alerts
are evidence of notice, not a hard cap. Lower limits may be needed after measured
tests; a dashboard preference alone cannot justify a cost guarantee.

Do not automatically buy another storage block, raise spend limits, change plan,
restart after a month rollover or re-enable after telemetry recovers. An operator
reviews cause, current usage, outstanding work and the same approval boundary
before resuming. Existing storage can continue charging while stopped: maintain
its explicit renewal/deletion decision, rather than equating zero playback with
zero bill. The budget approval must name an accountable operating owner.

## Lifecycle, abuse and failure cleanup

Maintain source state separately from upload/processing state: pending, uploading,
processing, ready, failed, canceled and cleanup-pending never imply publication.
Use immutable asset generations and durable cleanup receipts. An owner may retry
only within quota and the attempt/time budget; a replacement is a new explicit
generation and rights decision. Keep the prior confirmed source until a permitted
replacement succeeds, except when rights/access already require withdrawal.

| Material/state                                              | Required access and cleanup behavior                                                                                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unused/abandoned upload                                     | Expire lease at 60 minutes. Revoke the upload opportunity and remove partial material within 24 hours of expiry; release quota only on confirmation.                                                        |
| Failed/canceled/invalid generation                          | Never discoverable/playable. Queue deletion immediately; complete within 24 hours or retain a visible cleanup failure and stop new work for the affected scope.                                             |
| Valid processed draft                                       | Private management-only preview under current authority; expire unused draft media after 7 days with a disclosed deadline and preserve safe editable metadata.                                              |
| Temporary input/probe artifacts                             | Remove within 24 hours after terminal processing; no second raw-original archive unless explicitly approved and costed.                                                                                     |
| Published or deliberately unpublished retained media        | Keep while owner retains it within quota/current rights; never treat unpublish as an automatic deletion promise. Storage still counts and costs.                                                            |
| Owner deletion, source withdrawal or account/church removal | Deny new access immediately through the current source owner; reconcile provider revocation and remove unreferenced native bytes within 24 hours unless a distinct approved preservation hold applies.      |
| Minimal failed-job/cleanup diagnostics                      | Retain safe status, opaque IDs, usage/error code for at most 30 days after terminal resolution; no source URL/token, filenames containing personal details, captions or raw provider body in ordinary logs. |

Deletion must include all renditions, thumbnails, captions, temporary parts,
provider-side copies and associated delivery grants that the application owns.
Check canonical live source references under current ownership before deleting
shared bytes; a bookmark, playlist tombstone or withdrawn record is not permission
to keep serving a deleted source. Initial pilot should not deduplicate physical
assets across unrelated owners. Idempotent cleanup must survive provider failure,
worker death, lost acknowledgments and stale jobs without deleting a replacement.

Account erasure and approved preservation/backup policy remain authoritative.
Document actual provider backups/deletion propagation and any remaining retention
window before promising erasure. Restore must replay source removals/rights and
opaque deletion barriers before traffic resumes, never recreate a withdrawn file
from an old manifest. A transcoded provider download is not restore proof.

Abuse response reuses current source-specific reporting, moderation and scoped
operator authority. Freeze the actor's new upload authorizations, conceal a
restricted source, stop delivery and retain only approved evidence/hold material.
No new reviewer grant or blanket content browsing follows from cost operations.
Publisher account restriction, church withdrawal or rights expiry must also stop
pending completion/publication. No automatic retry after an abuse suspension.

## Release checklist and current missing evidence

1. Record owner acceptance of the provider/processor, limited VIDEO scope,
   quota/retention rules, complete incremental cost calculation, $25 budget (or
   a reviewed replacement), accountable operator and recovery/removal obligations.
   No acceptance or provider account configuration is established by this document.
2. Verify actual provider plan/region, all charge dimensions, authenticated upload/
   private preview/delivery, least-privilege credentials, current audience and
   immediate withdrawal behavior. Copied token and public URL tests must pass;
   unsupported restricted delivery stays unavailable, never falls back public.
3. Implement atomic reservations, actor/church/global limits, actual bytes/decoded
   limits, duration/codec validation and input/output quarantine. Test 2 GiB and
   duration boundaries, malformed inputs, forged ownership, concurrent quota
   claims, retry conflicts, revoked editor and exact completion replay.
4. Prove processing time/attempt bounds and terminal failure behavior; mandatory
   outputs must be validated before READY/publication. Test crashes, duplicate/
   late webhooks, stale generations, external failure and incomplete renditions.
5. Run cleanup/erasure/restore drills with provider deletion readback and current
   references, including death after deletion and a replacement arriving during
   cleanup. Demonstrate 24-hour/7-day deadlines and expose pending failures.
6. Measure representative upload, processing, repeated playback, telemetry lag,
   emergency pause and cleanup costs. Show the liability reserve holds under
   copied-token traffic, quotas and concurrent work. If not, stay disabled.
7. Complete current schema/migration/recovery, source-owner regression, real
   upload/player browser accessibility, runtime/bundle/cost and combined release
   gates. A1 alone integrates, applies production migrations and releases after
   approval; a document or local fixture pass is not native-media readiness.

The outstanding provider acceptance, full cost/operating approval, enforceable
revocation/spend controls, implemented pipeline and provider cleanup/restore
evidence are explicit activation blockers. The numerical proposal makes their
review concrete; it does not satisfy them by declaration.

## Candidate verification

Eight existing foundation checks pass: malformed/oversized image rejection,
actual streamed-byte limits, unconfigured storage denial, durable cleanup after
provider failure/cancellation, protection of ready/retried image generations,
independent maintenance availability and reserved-resource/owner boundaries.
They preserve current image behavior and do not exercise a native-video provider.
Numeric byte/frame/quota/cost examples were independently recalculated. Primary
provider documentation, source/contract, link/private-data, website-copy,
formatting and diff reviews passed. No native runtime, paid provider, browser,
build, full-suite, benchmark or production acceptance is claimed. No runtime
bundle/dependency/query/configuration changed.
