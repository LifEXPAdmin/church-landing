# Image maintenance and activation

September 12, 2026. Extends [the image foundation](IMAGE_FOUNDATION_REPORT.md).

The deployed worker must pass operational acceptance before enabling public
uploads. `GET /api/maintenance/images` uses the existing `collectImageGarbage`
service and private Blob adapter. It requires an exact bearer `CRON_SECRET` of
at least 32 characters and fails closed when absent. Account cookies and public
requests cannot authorize it. Responses are uncached and expose only aggregate
completion or a safe error; logs contain no owner, asset, key or provider details.

`vercel.json` schedules one invocation daily at `0 7 * * *` UTC. The current Hobby
plan invokes within the 07:00–07:59 UTC window. No new paid plan or store is
required. Each invocation considers at most 20 due prefixes, with a 40-second
application deadline and a 60-second function limit. Each provider deletion is
also bounded to 15 seconds. Pending work survives failures, missed invocations
and function termination; the next invocation retries it. A failure returns 503
and logs `image_cleanup_incomplete`; Vercel does not retry failed invocations.

The 24-hour grace period remains unchanged. Normal cleanup can therefore occur
24–48 hours after removal, or later during outages/backlog. The current daily
capacity is 20 prefixes; inspect the due count and oldest due timestamp as volume
grows and review capacity before broad rollout. This is object reclamation, not a
promise of immediate physical deletion. Access to a retired image is denied by
the existing image service immediately.

Before external deletion, the existing shared lifecycle gate rechecks READY
assets and active upload leases. An expired attempt cannot subsequently attach;
retries use a fresh immutable prefix. Provider I/O holds no account/lifecycle
transaction open. Duplicate invocations can delete the same retired prefix
idempotently, and count only the durable records actually removed. An aborted or
failed provider reply retains its record even if bytes were already deleted.

Maintenance uses server-only private storage independently of
`MEDIA_STORAGE_MODE`; turning uploads off must not stop queued cleanup. The
local filesystem adapter remains guarded by the existing isolated-test checks.
No schema, user authority, audience, retention grace or account deletion policy
is changed by this worker.

## Activation and operation

1. Verify the connected private store and configure a random server-only
   `CRON_SECRET` in production. Do not place credentials in logs, query strings,
   the repository or browser code.
2. Deploy the worker with uploads still disabled. Verify the exact READY build,
   canonical domain, deployed cron schedule and unauthorized 401 response.
3. Invoke the deployed worker with its bearer secret. Verify actual private
   provider cleanup using only a newly generated isolated probe prefix, a durable
   cleanup record created before its four tiny synthetic variants, and no user
   account or profile changes. The probe is due immediately because no upload can
   ever attach it. Normal user garbage retains the 24-hour grace. Confirm no probe
   objects/records remain and record exact operational write counts.
4. Only after those checks pass, set `MEDIA_STORAGE_MODE=private-blob`, update
   current release/feature availability, deploy and verify the serving version.
   Isolated profile/UI and provider checks remain distinct from a consenting
   owner's real photo/device acceptance.
5. Inspect Vercel cron/runtime logs and due-queue age when investigating a missed
   cleanup. An authenticated manual invocation uses the same bound and checks.
   Repeated failures/backlog require an explicit operational follow-up.

If uploads must be disabled, remove their mode and redeploy while retaining this
route, cron and Blob credentials for cleanup. Instant Rollback does not update
cron schedules; verify them explicitly. Retain the invitation lifecycle hooks
when selecting any older UI release. External object backup and wider retention
work remain separately unverified; this worker does not establish them.

## Verification

Five new isolated cases cover fail-closed authorization/method checks, the
20-prefix bound and grace, overlapping invocations, provider failure/abort,
retry during deletion, READY-image preservation, and maintenance independent
of the upload switch. Existing processing, image service, boundary and HTTPS
checks also pass. The focused command passed 23 cases and populated
upgrade/dump-restore; two final production-mode local HTTPS cases passed. Lint,
types and the production runtime-trace gate also passed.

## Deployed worker acceptance — September 12, 2026

Worker application `8ef6c199f297fa9da70c8e1473643be043da4d5c` is READY in
deployment `dpl_7CRhJ1MPJvWVnKBSDr4AGr6VNEdL`. The canonical release endpoint
matched the application SHA during the 03:40 UTC provider check. The project
reports cron enabled with this deployment's host, `/api/maintenance/images`
and `0 7 * * *`. Its first scheduled time has not yet occurred; acceptance used
authenticated manual invocations of the actual deployed endpoint.

All six operational groups passed: 28 complete migration checksums with none
applied; uncached unauthorized denial; authenticated empty-queue completion while
uploads stayed disabled; four tiny private variants uploaded/read with unsigned
access denied; actual worker deletion followed by an inert repeat; and no
remaining probe objects or records. Exact writes: one maintenance record created
and one deleted, four private objects created and four deleted, zero user/profile
or asset records changed. The existing private store was reused. No schema or
plan change was needed. Public activation follows this verified worker gate.

References: [Vercel cron operation and authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs),
[cron usage and limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
