# Scoped admin requests and access

September 15, 2026 UTC. Candidate product **2026.09.15.6** is not yet released.
Production remains **2026.09.15.5 / f292d8058deb52320cecb01d4ffd06edacf7b835**.
The initial implementation is checkpointed at `f0792ac`; finishing changes below
remain part of this same feature. Exact deployment, canonical assignment and live
acceptance are still required. No production grant or requester message was made.

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

The candidate uses PostgreSQL 17 on loopback with fictional accounts, local media,
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
  errors. It covers ordinary-member/API denial; private filters and saved views;
  320/390/1440 layouts; a conflicting note draft saved exactly once; requester
  exclusion of the note; native resolve/reopen; retained selection and keyboard
  return focus; mixed successful/stale bulk rows; authenticator setup and QR;
  invalid-code edit recovery; one isolated health grant; confirmation focus;
  revoked-manager concealment; and a health-only account's restricted navigation.
- Thirteen actual HTTPS/account-export/release checks pass, including private
  admin noindex behavior, own saved-view export and private-note exclusion.
  Types pass. The final production preview passes compile, lint/type validation,
  renderer verification and runtime trace inspection.
- The full established service/recovery gate passed its early services, synthetic
  backup/restore and fresh migrations but exhausted the configured 6 GB build heap
  in the accumulated main checkout. Its failure remains preserved. A clean current
  source snapshot is running the complete gate; this is pending, not a pass.

Browser testing found and repaired three integration defects within this feature:
disabled Google configuration blocked password confirmation; embedded native
support forms retained an old source version after admin refresh; and Tailwind's
grid display overrode the hidden attribute on retained private content. Explicit
concealment now survives revoked access. Confirmation focus waits for the refreshed
form to become visible. Prior failing artifacts remain private.

## Recovery and production boundary

At **16:09:02 UTC**, a read-only, verified-TLS encrypted production copy upgraded
from 57 to 63 migrations in a separate local PostgreSQL cluster. All **102 original
tables' original-column fingerprints matched**, and protected replay completed.
The plaintext restore and temporary cluster were removed; production was unchanged.
The six additive migrations remain unapplied to production. Before publication,
revalidate this receipt's four-hour age limit and migration checksums. After the
upgrade, verify preserved original columns and install the matching 63-entry
recovery registry through the established guarded procedure.

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
loader entered runtime traces. The verified renderer is 173,096 bytes, SHA-256
`647e9e5fbb96baa9ebe3cf0aa8d816f57e0e46354f2b8ad0fb9db18029e29f15`.

The authenticated Vercel usage view at about 16:15 UTC reports 40,451 of one million
function invocations, 2.3 of 360 GB-hours fluid memory, 35m46s of four hours active
CPU, 1.01 of 10 GB deployment storage, and **10.31 of 10 GB function storage**.
Blob has 7,044 of 10,000 simple and 1,566 of 2,000 advanced operations. This is a
displayed usage observation; an actual publication block has not been observed.
No purchase or deployment-history removal was performed.

## Remaining acceptance

Complete the full gate, exact canonical release, current migration/data checks,
actual provider packaging and read-only authenticated live acceptance. Keep real
admin provisioning, account-management ownership, provider delivery and physical
phone observations separate. Then continue the specified metrics and feedback
features and finish their shared overview/integration acceptance. Final review
remains last; this candidate document is not a feature-completion receipt.
