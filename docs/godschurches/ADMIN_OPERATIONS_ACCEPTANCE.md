# Scoped admin requests and access

## Original retry preservation candidate, 26 September 2026 UTC

A rate limit can occur before an accepted action's receipt is read. Admin forms
now preserve their exact pending command and frozen fields through that cooldown,
matching their existing uncertain-response recovery. No backend, authority,
version, schema or configuration change is made. The unchanged release reproduced
the lost retry control after a saved note's response was lost and its retry was
rate limited. Final browser and release acceptance remain pending.

## Shared feedback integration — September 16, 2026 UTC

**2026.09.16.1 / 799549d** is exact READY/canonical in
**dpl_9wyYfbSuGveYmYHtG4DzDPYdPhDG**. The admin Feedback queue, source-permitted
weekly review and separately authorized actual Growth reports now integrate the
native feedback owner. Private working notes, grouped themes and source links
retain current scope checks. Isolated A1/A2/A3 engineering, the staged 163-file gate
and 35 browser groups pass; [the release receipt](FEEDBACK_WEEKLY_ACCEPTANCE.md)
records canonical/live/recovery evidence and its limits. Shared source contracts
are supplied. Actual first-operator/authenticator setup and physical/assistive-
technology acceptance remain open; no production authority was manufactured.

## Original core release receipt

September 15, 2026 UTC. Product **2026.09.15.6**, application commit
**7384afdbce5a1b0cafbb56f99c41345d298b6b4f**, is **READY** in
**dpl_HVdiV3cpLz4L98FvhVNiDbhsJobg** as of **17:00:20 UTC**. An independent
alias read assigns `godschurches.com` to that deployment; the canonical release
endpoint returns the exact application SHA and product build. Core request/admin
engineering is verified live. Real operator provisioning and the specified
metrics/feedback integration remain open. No production grant or requester message
was made for acceptance. Implementation checkpoints are `f0792ac`, `cff8b2e` and
`7384afd`; later receipt-only commits do not change this serving identity.

## Behavior and authority

The [implementation contract](ADMIN_OPERATIONS_CONTRACT.md) describes the source
owners, grant generations, privacy controls and bounded reads. Nine private admin
pages and one private API reuse native support, moderation and claim services.
An ordinary member gets no Admin entry. Current scoped reviewers receive only the
sections and records their existing authority permits. Access management, audit,
operational health, account lookup and future aggregate metrics have distinct
capabilities. Assignment grants no new source access.

Internal notes stay separate from replies, including account exports and grouped
requests. Saved views belong to the account that created them. Duplicate groups
preserve original receipts; departures redact shared text and remove empty groups.
Bulk actions return each row's result and cannot approve claims, suspend accounts
or permanently delete content. Drafts survive stale writes, explicit refresh and
version adoption. Native support resolve/reopen uses the refreshed source version.

Only the new access-grant action requires the new authenticator. Fresh password
or purpose-bound Google confirmation, an unused code, current manager and target
versions, an explicit capability and a reason are all required. Recovery retires
the old factor and codes and requires confirming its replacement. Restore revokes
old factors, grants and sessions. This does not establish MFA for every legacy
privileged action. Real first-operator provisioning remains subject to the
authenticated identity, authority and narrow approval procedure in
[Support operations](SUPPORT_OPERATIONS.md#provisioning-and-restricted-data-requests).

## Isolated verification

The isolated acceptance uses PostgreSQL 17 on loopback with fictional accounts, local media,
disabled production transport and verified local HTTPS. No fixture grant is a
production assignment, and no setup key or recovery code appears in screenshots.

- The latest focused admin/topic/Google suite passes 43/43. It covers scoped
  overview and queue parity, topic report appeals, private receipts, group cleanup,
  generation-bound assignments and one-use confirmation purpose/session checks.
- The permission-read optimization passes 54 of 55 checks; the remaining topic
  search assumed that accumulated fixtures always fit the first page. Its search
  now uses a unique fixture prefix, and the complete 13-test topic file passes.
  No product permission failure occurred in that run.
- Actual production-mode browser acceptance passes five groups with zero runtime
  errors. It covers ordinary-member/API denial with the signed-in shell preserved;
  private filters and saved views;
  320/390/1440 layouts; a conflicting note draft saved exactly once; requester
  exclusion of the note; native resolve/reopen; retained selection and keyboard
  return focus; mixed successful/stale bulk rows; authenticator setup and QR;
  invalid-code edit recovery; one isolated health grant; confirmation focus;
  revoked-manager concealment; and a health-only account's restricted navigation.
- Thirteen actual HTTPS/account-export/release checks pass, including private
  admin noindex behavior, own saved-view export and private-note exclusion.
  Types pass. The final production preview passes compile, lint/type validation,
  renderer verification and runtime trace inspection.
- The full established gate in a clean current source snapshot discovers 152 test
  files and passes **931 of 933 tests, two expected skips, zero failures**. It includes
  synthetic upgrades, full restore, fresh migrations, both production builds,
  development privacy checks, verified HTTPS and server restart. The original run
  exhausted its configured 6 GB build heap in the accumulated main checkout; that
  failure is preserved. The clean run retains the same heap limit.
- The later signed-in denial-shell change passes the final production build,
  types/lint, all five browser groups and 22 anonymous preview probes. A manifest
  confirms all 969 application/schema/data/configuration files in the deployed
  candidate match this tested preview. The full baseline and this later delta are
  recorded separately; a receipt-only file is not treated as tested application code.

Browser testing and final route review repaired four integration defects within this feature:
disabled Google configuration blocked password confirmation; embedded native
support forms retained an old source version after admin refresh; and Tailwind's
grid display overrode the hidden attribute on retained private content; and a denied
admin route incorrectly presented a current signed-in account as a guest. Explicit
concealment now survives revoked access. Confirmation focus waits for the refreshed
form to become visible. The final denied-route shell delta passes its production
build, types/lint and all five actual browser groups. Prior failing artifacts remain private.

## Recovery and production boundary

At **16:09:02 UTC**, a read-only, verified-TLS encrypted production copy upgraded
from 57 to 63 migrations in a separate local PostgreSQL cluster. All **102 original
tables' original-column fingerprints matched**, and protected replay completed.
The plaintext restore and temporary cluster were removed; production was unchanged.
The six additive migrations were subsequently applied by the configured provider
build. At **17:11:00 UTC**, all **63 production migration checksums match**, with
none pending. At **17:11:38 UTC**, all **42 tracked original-column production
fingerprints match** the pre-release baseline. New groups, notes, views, operations,
authenticators and source metadata remain zero; no new admin grant exists, account
managers remain zero, and support intake remains disabled.

The guarded installed recovery registry now contains all 63 matching checksums.
Its independent encrypted daily **63-to-63** restore completed at **17:01:07 UTC**,
covering 107 restored tables. That daily mode does not run the upgrade fingerprint
comparison or protected activation replay; its false upgrade flag is not a failed
comparison. The separate 57-to-63 receipt above establishes those upgrade checks.
The installed retention implementation hash is unchanged. No production test data
was written and no outbound message was sent.

## Actual live acceptance

- **22 public checks** pass at 17:07:48 UTC: exact release/build, one application
  shell and brand at 320/390/1280 widths, exact renderer bytes, guest Menu, all nine
  private page denials/noindex behavior, six private GET API denials, release notes
  and conditional feature guidance. Runtime errors and attempted test writes: zero.
- **Four health checks** pass at 17:07:43 UTC. Current database inspection succeeds
  in 126 ms, configured uploads/push/retention/welcome/scheduling remain enabled,
  all observed pending/due backlogs and alerts are empty, private endpoints reject
  anonymous access, and an unknown maintenance mode rejects before cleanup.
  The health endpoint reports worker-last-success as unavailable and directs the
  operator to scoped completion logs; it does not invent a success timestamp.
- **Six actual authenticated Chrome observations** pass: Menu and exact version;
  Overview limited to existing authorized sections and current zero counts; an
  applied Content report filter with a truthful empty queue; denied health and
  access pages preserving Settings/Log out; and the retained native review link,
  authorized empty review queue and noindex metadata. Browser warnings/errors are
  zero. Populated mutations and MFA enrollment remain isolated-fixture evidence.
  No actual case, note, view, grant, account or message was created for this check.

## Measured costs and limits

Seven serial warm-pool reads per path compared old and updated services against
the same fictional records and authority. These are Mac loopback measurements,
not hosting latency, concurrent capacity or a response-time promise.

| Read | Database commands before / after | Local median before / after |
| --- | --- | --- |
| Scoped support counts | 21 / 12–14 | 5.75 / 2.93 ms |
| Support queue | 22 / 14 | 6.34 / 3.19 ms |
| Support detail and internal history | 92 / 62 | 22.42 / 14.13 ms |
| Global reviewer queue, identical fixture | 105–107 / 97–99 | 24.60 / 21.05 ms |

Command counts include transaction and permission-lock commands. The queue reuses
review authority established under the same shared gate. Detail removes a redundant
earlier admin read; the native service still authorizes its own result and the final
admin gate checks current source scope and matching native version before returning
data. Queries are scoped before filtering and pagination. More than 100 distinct
assigned reviewers returns an explicit unavailable result pending a measured review.

The production preview has 172 runtime traces, 39,011 trace entries and 436 server
JavaScript files. No private fixtures, environment files or Prisma configuration
loader entered runtime traces. The local preview renderer is 173,096 bytes, SHA-256
`647e9e5fbb96baa9ebe3cf0aa8d816f57e0e46354f2b8ad0fb9db18029e29f15`.
The actual provider build renderer, also fetched and verified from the canonical
page, is 173,096 bytes, SHA-256
`2b7c5f99a8710e52520e7d0dc25c9fb65fd7c06e0a1d6cfee97276e0a452a3b7`.

Actual provider build output has **355 lambda route entries**, up from 335, while
remaining at **12 distinct function packages**, including middleware. Distinct
package sizes sum to 148,581,136 bytes; this sum is not billed storage. Functions
use Node.js 24, configured 2,048 MB memory, regional execution in `iad1` with the
existing multiregion middleware. These are provisioned settings, not measured
resident memory. No new worker, runtime dependency or external service is added.

The authenticated Vercel usage view at about 16:15 UTC reports 40,451 of one million
function invocations, 2.3 of 360 GB-hours fluid memory, 35m46s of four hours active
CPU, 1.01 of 10 GB deployment storage, and **10.31 of 10 GB function storage**.
Blob has 7,044 of 10,000 simple and 1,566 of 2,000 advanced operations. This is a
displayed usage observation; this subsequent deployment reached READY successfully,
so no actual publication block occurred in this feature.
No purchase or deployment-history removal was performed.

## Remaining acceptance

The core queue, case actions and their immediately required interface children
are complete with the evidence above. First real operator provisioning and personal
authenticator enrollment remain in the existing access subtask. The separate
account-management owner prerequisite remains unassigned. Real provider delivery,
church-representative/host coverage and physical-phone observations are unperformed.

Continue metrics and feedback in their specified order, then finish their shared
summary cards and integrated acceptance in the existing admin integration subtask.
This is an explicit cross-feature dependency, not deferred lightweight finishing
work. The admin parent stays open for those requirements. Final review stays last.
Private detailed test artifacts, failed attempts, identities, fingerprints, provider
logs and encrypted recovery receipts remain in the existing local evidence folder.
