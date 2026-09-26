# Shared abuse budgets and retry responses

## Integrated release acceptance, 26 September 2026 UTC

The image Retry-After repair is integrated and deployed in **2026.09.26.2**,
serving commit `20d81d73706e2ef38488617ebf57a27beb12acdb`. Combined verification
reran the new 15 checks plus existing media and social regressions inside its
89 service/HTTP checks. All pass. Live health and release acceptance pass, without
production throttling, writes or sends. Actual operator, MFA, response and hosted
capacity acceptance remain open. See [deployment evidence](DEPLOYMENT_REPORT.md).

## Original engineering receipt

26 September 2026 UTC. Local engineering acceptance; integration and live
acceptance remain with the designated release owner.

## Existing control ownership

The audit reuses the existing PostgreSQL `PlatformAuthLimit` counters and
canonical operation receipts. Counters use atomic upserts. Acceptance exercises
two independent Prisma clients sharing PostgreSQL in one test process, not
independently deployed servers. No process-local limiter,
duplicate spam service, new table or external provider is introduced.

| Surface                                    | Existing transport admission                                                                                                 | Committed activity and retry behavior                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Signup and login                           | 120 attempts per minute globally, 30 per network per 15 minutes, 10 per operation and normalized subject per 15 minutes      | Existing account validation and duplicate-registration behavior remain authoritative.                                                   |
| Password reset and verification requests   | Same global/network controls; 3 per operation and normalized address per 15 minutes                                          | Eligible local delivery occurs only after admission. Public responses remain neutral, including throttled and unknown addresses.        |
| Ordinary signed-in posts and social writes | 240 attempts per acting account and transport domain per 15 minutes                                                          | New posts default to 10 per hour. Exact committed receipts replay before new-activity quota; changed reuse conflicts.                   |
| Private messages                           | Existing account/domain transport budget                                                                                     | Canonical limits of 30 messages per minute and 500 per day, plus consent checks, remain inside the command transaction.                 |
| Community reports                          | Existing account/domain transport budget                                                                                     | Default 5 reports per 10 minutes, current target visibility and reviewer policy remain authoritative.                                   |
| Image upload and removal                   | Separate image namespace: 120 per minute globally, 300 per network per 15 minutes, 10 per owner and operation per 15 minutes | Every transport attempt is admitted before reading bytes. Existing upload fingerprints and receipts govern later idempotent processing. |

Global counters are scoped to their HMAC namespace. Account boundaries trust
the configured origin. Outside the hosted environment,
forwarded address headers do not create new caller-selected network buckets.
Signed-in community activity intentionally does not borrow the narrow sign-in
network allowance: independent adults can share church Wi-Fi. This change does
not introduce an unmeasured global posting ceiling or alter those accepted limits.

The account JSON reader bounds the consumed body before processing. Post and
social boundaries retain their existing bounded JSON readers; messages, reports
and posts also retain their individual text limits. Images reject declared
oversize and cap actual streamed bytes before image processing or storage.

## Reproduced response defect

Image upload and removal correctly returned HTTP 429 when their owner allowance
was exhausted, before consuming a request body or accessing storage. Their
response omitted the `Retry-After` header used by the other write boundaries.

The image boundary now supplies the existing 900-second wait on its rate-limit
error and propagates that duration only for a matching 429 response. This is a
conservative full-window delay, not calculated remaining bucket time. Existing
private cache, content-type and cross-origin response headers remain intact.
Authentication, permission, validation, size and unavailable-service responses
do not acquire a retry deadline.

This is a response-header repair. It changes no quota, permission, account grant,
MFA mode, provider configuration, schema, migration, client component, dependency
or background job. It adds no database query, browser request or automatic retry.

## Verification

Runtime and test commit `b0aa39086a20d612fb03920ab5d990865af59d8d` passed
37 targeted checks, with zero failures, cancellations or skips in the final runs:

| Check set                                         | Passed | Node test duration |
| ------------------------------------------------- | -----: | -----------------: |
| New shared account and transport admission        |      7 |       3,976.551 ms |
| New image rejection and retry headers             |      4 |       1,741.094 ms |
| New post, message and report shared budgets       |      4 |       4,189.380 ms |
| Existing image admission and boundary regressions |      5 |      17,977.444 ms |
| Existing social activity regressions              |      9 |      38,404.561 ms |
| Selected message regressions                      |      4 |       5,662.463 ms |
| Selected report regressions                       |      4 |       6,524.254 ms |

These are separate serial test invocations. The message and report selections
are four cases each, not their full files. The existing social suite includes
independent accounts sharing a network. New reset acceptance inspects exactly
three fictional local delivery records as well as three grants after five
attempts. Case-folded email addresses share a budget; whitespace normalization
is source-inspected only.

Scoped ESLint, full TypeScript checking, authored-copy validation and the
production build pass. Built hydration verification and all 231 runtime traces
pass; private fixture/environment files are absent from those traces. No client
component or dependency changed. The runtime diff contains only the error's
retry duration and conditional response header, with no additional database or
network call. No performance improvement is claimed.

The unchanged source first reproduced two missing image-header failures. An
account fixture initially supplied a valid nine-character password while
expecting validation failure; correcting it to five characters made the intended
negative case valid. Earlier local database startup and media fixture-label
errors were corrected and retained separately from product findings.

Tests use only fictional local accounts, bounded request streams and local
delivery/storage. Stream checks invoke the real request-boundary functions;
this acceptance does not claim a new browser or hosted multi-instance run.
No live load, production test account, outbound provider delivery or production
operator grant is part of this audit.

The targeted scenarios cover contention at the final available quota slot,
denied transaction rollback, canonical replay and changed-payload conflict,
normalized account subjects, shared network/global admission, explicit expiry,
neutral reset responses, and streamed payload rejection before canonical writes.

## Operational and release limits

The secured aggregate health owner already reports invalid community activity
configuration. Its current snapshot is not proof of continuous alerting or human
response coverage. Actual operator provisioning, private authenticator enrollment,
normal-duty acceptance, essential notices and response coverage remain their
existing operational prerequisites. This audit does not grant those capabilities
or certify their completion.

The release owner must reconcile the tested change with the concurrent calendar
release, complete the combined regression and record deployment, canonical-domain
assignment, serving identity and live acceptance. Local limiter tests do not
certify hosted capacity or physical-device behavior.

Related implementation: [account limits](../../lib/platform/account-limits.ts),
[image boundary](../../lib/platform/media-boundary.ts),
[community activity limits](COMMUNITY_ACTIVITY_LIMITS.md) and
[operational health](OPERATIONAL_HEALTH.md).
