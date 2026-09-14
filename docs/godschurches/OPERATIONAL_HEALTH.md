# Operational health and measured hosting resources

September 14, 2026. Verified live on version 2026.09.14.7; exact deployment,
47 migration checksums and actual worker evidence are in
[the capacity receipt](CAPACITY_REHEARSAL.md). The 10:03 UTC operational probe
completed with an empty final backlog, no alerts and no user/profile/asset changes.
The public `/api/health` remains liveness only. The new private
`GET /api/maintenance/health` requires the existing exact bearer maintenance
secret, before database access. It never accepts account cookies as authority.
It makes two aggregate data reads in a read-only transaction, with a three-second
statement timeout and six-second transaction deadline. No telemetry store,
provider subscription, dependency, schema, schedule or public status page is added.

The response contains database inspection time, feature configuration, pending/due
counts, oldest timestamps and ages for image cleanup, notification deliveries,
protected retention controls, account deletion, report/hold review, founder welcome
and announcements, and scheduled posts. It excludes account/content IDs, names,
addresses, text, object keys and credentials. Unverified signup intent is excluded
from dispatchable welcome backlog. Configuration booleans are not delivery probes.
An empty queue does not establish the last worker success: that field explicitly
requires scoped completion logs. Scheduled publishing has no configured dispatcher;
due scheduled work raises attention rather than claiming delivery.

Responses are private/no-store/noindex. HTTP 503 means attention is required or
the bounded snapshot could not be obtained. A safe failure returns no database
error text. Alerts cover due media above 100 or older than 25 hours, delivery or
protected-control work older than five minutes, recent terminal delivery failures,
overdue retention reviews/deletions, and overdue scheduled publishing. A 200 is
this snapshot only; it is not a provider uptime or recovery guarantee.

## Operator procedure

1. Verify exact serving identity and canonical deployment first. Request private
   health with the secret loaded from protected operator configuration, never a
   browser URL or copied shell command containing credentials.
2. Inspect response status, actual backlog age, active feature settings and scoped
   worker logs. Recheck public liveness and ordinary authenticated reading separately.
3. For media, the read-only inspection mode shows backlog; an explicit normal
   maintenance invocation considers at most 100 prefixes in 40 seconds, pacing
   deletion starts by 350 ms. After a partial run inspect again, preserve its
   receipt and run another bounded pass if needed. Avoid overlapping drains.
   The daily schedule and full 24-hour grace remain unchanged; provider delay can
   reduce throughput. See [image maintenance](MEDIA_MAINTENANCE.md).
4. For notification or retention failures, follow their existing retry/replay
   runbooks. Do not use a queue count to authorize a new send, account deletion,
   reviewer grant or shortened grace. Preserve the failed receipt.
5. Check the separately protected backup job receipt and restore attestation.
   Its daily execution still requires the Mac awake and operator logged in.
   If the latest verified copy is stale, run its established protected workflow;
   a deployed health response cannot observe that workstation.

## Hosting observations — September 14, 06:26–06:51 UTC

The authenticated account views identify Vercel Hobby with Fluid compute in
Northern Virginia, Node 24, and standard function allocation. The current provider
mapping is 2 GB / 1 vCPU per function instance; the project's basic 2 CPU / 8 GB
build machine is separate from request memory. Neon Free runs PostgreSQL 17 in
AWS Northern Virginia, with 0.25 CU fixed minimum/maximum, approximately 1 GB RAM,
105 direct or 10,000 pooled connections and five-minute scale to zero. The actual
PostgreSQL system setting allows 112 connections including system reservations.
The app uses the pooler; this does not grant 10,000 simultaneously executing queries.
[Function allocation](https://vercel.com/docs/functions/configuring-functions/memory).

Neon's September usage view showed 9.66/100 CU-hours, 0.04/0.5 GB storage and
0.04/5 GB network transfer. A read-only SQL inspection measured 14,606,336 database
bytes, 128 MB shared buffers and 4 MB work memory. The private Blob store had
2,473,608 bytes in eight objects. Both provider usage views can lag by an hour.
These are dated observations, not projected load-test limits.

The application project's preceding 30-day usage was 228.44 MB fast transfer,
110.99 MB origin transfer, 33,535 edge requests, 17,385 function invocations,
1.4 GB-hours provisioned memory and 21m10s active CPU. Team totals include other
projects: 3.6 GB-hours and about 1h6m active CPU against 360 GB-hours / 4 hours.
Function deployment storage was 7.08 GB for this project and 13.95 GB across the
team, versus 10 GB included. This is retained deployment GB-month accounting,
not function RAM or user photos. No old deployment was deleted, and no hard
service stop was inferred from that usage figure. Current retention keeps 30 days
and at least ten deployments; reducing it needs a considered rollback-history tradeoff.
[Deployment storage](https://vercel.com/docs/deployment-storage).

Thirty serial fresh-connection requests from the Mac, ten per route, all returned
200. TTFB p50/p95: release 100.7/121.7 ms, Home 155.8/1485.4 ms, liveness
107.7/113.8 ms. This small public sample is neither a concurrent load test nor
signed-in paint time. Separate direct Mac-to-Neon connection setup was
213.3–239.3 ms including process/TLS startup; it is not a Vercel query duration.
Avatar browser measurements are in [the completed report](AVATAR_STARTUP_REPORT.md).

Read-only worker inspection found no due image, notification, scheduled-post,
protected-control or account-deletion backlog. Two notification attempts in the
preceding day had accepted provider outcomes; that does not prove phone display.
No send, cleanup or erasure was triggered by this inventory.

## Access and cost boundaries

The actual Vercel percentile-query API returned 402 requiring Observability Plus
on Pro/Enterprise. Current documentation prices new Pro at $20/month including
one deploying seat and $20 usage credit; Plus is $1.20 per million events.
No upgrade was purchased. Basic logs, direct measurements and aggregate health
remain usable. Resend integration SSO returned `account_not_found`, so the actual
email account plan and usage remain unverified; public Free/Pro prices are only
scenario inputs until that access is restored.
[Pro](https://vercel.com/docs/plans/pro-plan),
[Observability Plus](https://vercel.com/docs/observability/observability-plus),
[Resend pricing](https://resend.com/pricing).

Capacity envelopes and purchase triggers must use measured request/image volumes,
separate registered accounts from daily active and concurrent users, and keep
cloud CPU/egress limitations distinct from isolated Mac results. The next receipt
belongs in [capacity and recovery](CAPACITY_REHEARSAL.md).
