# Pilot capacity, costs and recovery limits

September 14, 2026. The sustained local rehearsal and full regression gate pass;
bounded cloud rehearsal and deployment acceptance are pending. Five hundred
registered accounts and one hundred concurrent people
remain a target, not a demonstrated production maximum. Registered accounts occupy
storage; daily active people produce traffic; concurrently active clients and
requests in flight are different measures. A fifteen-minute test does not establish
month-long reliability, and the Mac does not reproduce Neon or Fluid CPU limits.

## Current limits and useful triggers

Use the dated actual provider inventory in [operational health](OPERATIONAL_HEALTH.md),
then refresh it before broadening a pilot. Treat 70% consumed quota or a forecast
that reaches the allowance within seven days as an operator review trigger. These
are planning thresholds, not new automatic account restrictions. At 85%, pause
new bulk invitations and capacity experiments until the headroom is understood.
Never delete user content or shorten retention to meet a quota.

- Neon Free: 100 CU-hours per project/month, 0.5 GB data and 5 GB transfer. At the
  actual 0.25 CU size, 400 active hours consume the compute allowance; running
  continuously for 30 days would use 180 CU-hours. Five-minute idle suspension
  saves compute but adds a separate cold-wake condition. Review at 70 CU-hours,
  0.35 GB data or 3.5 GB transfer, and on repeated pool waits/timeouts.
- Vercel Hobby: 4 active CPU-hours, 360 GB-hours memory, one million function
  invocations, 100 GB fast transfer and 10 GB origin transfer per allowance period.
  Review the actual team totals, including other projects. The existing function
  deployment-storage figure already exceeds its included 10 GB; verify its
  accounting and retain a deliberate rollback window before changing retention.
- Blob: 1 GB stored, 10,000 simple operations, 2,000 advanced operations and 10 GB
  transfer. Four stored variants mean four upload operations per new image,
  excluding retries and dashboard/list operations. Roughly 500 new images consume
  the full advanced allowance, or 350 at the 70% review point. Retained profile
  history also consumes storage; selecting another image does not delete history.
  The current private storage adapter explicitly uses `useCache: false` on Blob
  reads. Budget each attempted private image fetch as a simple operation; do not
  assume a provider cache hit. Browser in-flight deduplication can avoid an app
  request, but does not change how a store read is configured.
- Image changes: the candidate retains 120 attempts/minute globally and ten
  changes of each kind/account/15 minutes, with a separate 300-attempt shared-IP
  image window. Sign-in keeps its existing 30-attempt network allowance. These
  transport limits are not paid-provider rate guarantees. Blob's Hobby rate is
  20 simple / 15 advanced operations per second; bursts and overlapping cleanup
  can receive provider throttles, which must be reported separately.
- Cleanup: at most 100 due prefixes/run, paced at 350 ms per four-variant deletion
  start within a 40-second application budget. Real provider delay reduces the
  daily ceiling. A 1,000-prefix due backlog therefore needs at least ten runs,
  more if interrupted; the daily schedule alone would take at least ten days.
  A failure does not receive automatic Vercel retry. Inspect ages and use explicit
  bounded operator passes. Existing grace and READY/history protection remain.
- Email: actual Resend plan/usage is blocked by owner dashboard sign-in. The public
  Free allowance of 100/day could constrain a signup/invitation burst even when
  the monthly 3,000 allowance remains. Do not use an unverified email quota to
  approve a large launch or send test messages to real people.

## Illustrative monthly envelope

The following is a scenario, not measured user behavior or a bill: 500 registered,
100 daily active, 100 application requests and 40 image deliveries per active
person/day, 20 new images/day, and 30 days. The actual fictional reference image
has four normalized variants totaling 1,314,064 bytes; its medium variant is
351,408 bytes and thumbnail 21,064 bytes. Real photos vary and originals are never
retained unprocessed.

| Quantity | Scenario result | Implication |
| --- | ---: | --- |
| Application requests | 300,000/month | Compare with other team traffic and measured CPU/request |
| Image deliveries | 120,000/month | Current uncached store reads imply about 120,000 simple operations before retries; over the Free allowance |
| New images | 600/month | 2,400 upload operations before retries/listing; over the Free allowance |
| New retained image bytes | 0.788 GB/month | Storage accumulates across months and existing history |
| All-medium image delivery bytes | 42.17 GB/month | An intentionally heavy case; beyond the Blob 10 GB allowance |
| All-thumbnail delivery bytes | 2.53 GB/month | Shows why observed image mix matters |
| Neon, continuously active at 0.25 CU | 180 CU-hours/month | Above 100 Free hours; intermittent usage is different |

Private delivery also passes through application functions and origin/edge
transfer. The current uncached store read must be included in both the operation
and byte budget. Do not add a public cache to private images to meet these
projections. Measure actual request counts and byte mix in a separately budgeted
cloud rehearsal before treating a model as production headroom.

Public current rates support a review, not an automatic purchase: Vercel Pro is
$20/month for the platform/one deploying seat with $20 usage credit; additional
seats and excess usage add cost. At Northern Virginia Blob rates, 120,000 simple
cache misses cost $0.048, 2,400 upload operations $0.012, 0.788 GB stored for a full
month about $0.018, and 42.17 GB store transfer about $2.11, before app/edge/origin
charges and credit allocation. These components are not a complete Vercel bill.
Neon Launch compute is $0.106/CU-hour, so 180 hours is $19.08, plus $0.35/GB-month
storage, chosen history and any excess egress. Resend Pro lists $20/month for
50,000 emails, with actual account access still unverified. No plan was purchased.

[Neon pricing](https://neon.com/pricing),
[Vercel Pro](https://vercel.com/docs/plans/pro-plan),
[Blob usage and rates](https://vercel.com/docs/vercel-blob/usage-and-pricing),
[Resend pricing](https://resend.com/pricing).

## Rehearsal isolation and rollout

The owned local rehearsal uses fictional data, guarded loopback PostgreSQL and
private filesystem images, disabled real delivery, and an explicit shared-network
model. A separate, disposable Vercel project, Free Neon database and private Blob
store now have a bounded cloud plan: 25 and 50 clients for three minutes each,
then 100 for five minutes, with two-second think time. Hard guards cap application
requests at 22,000, image-read attempts below 8,000, uploaded images at 175 beyond
the 100 seed images, and response bytes at 3 GB. Four hundred seed objects occupy
131,406,400 bytes. These counters account for uncached store fetches; provider
dashboards can lag and are not the per-request stop guard.

The test project protects all URLs and uses only its own temporary automation
credential. Its canonical alias initially lay outside the default protection
scope; the preflight stopped before load and passed after protecting all URLs.
All real delivery, scheduled jobs and queue triggers are disabled in the test
project. Its Neon default is PostgreSQL 18.6 at fixed 0.25 CU, while production is
PostgreSQL 17; preserve that limit when interpreting hosted results. The cloud
run is not yet an accepted operating envelope. Never point the loopback harness
or its fictional-data writer at production. Preserve test receipts and remove
only the owned disposable resources after the experiment.

Begin any human pilot with consenting small groups, inspect the exact deployed
health and usage, then expand only after the observed experience and headroom
support it. Keep the next cohort on hold for unexpected errors above 1%, repeated
slow primary reads, growing overdue work, failed protected recovery or a provider
quota concern. Existing browser/owner phone acceptance remains separate.

For rollback, record the last verified release and provider configuration. Stop
new activation of the affected capability, retain maintenance credentials/queues
needed for cleanup, and follow the current safe-release procedure. An older UI
cannot undo a schema migration or restore revoked permissions; preserve invitation,
account-switch and deletion protections. Verify canonical alias, serving identity,
cron configuration, ordinary reading and protected health after rollback. Never
replace production data with a restored snapshot simply to roll back code.

Local recovery copies require an awake logged-in Mac. The configured job refreshes
copies older than 20 hours, expires at 28 days within the 30-day policy, and records
restore attestations. Neon history is only six hours on the observed plan. A missed
local job can therefore create a longer recovery gap than the nominal daily
schedule. After restore, protected replay quarantines sessions/grants and leaves
traffic off until current authorization is reviewed. See
[backup operations](BACKUP_OPERATIONS.md) and [protected restoration](RETENTION_OPERATIONS.md).
