# Topic communities acceptance

September 15, 2026 UTC · local candidate, release acceptance pending

Candidate product version is **2026.09.14.18**. Canonical production remains the
verified prayer release **2026.09.14.17**. No topic task is declared complete.

## Implemented scope

Public discovery, immutable topic addresses, descriptions and rules, creation,
explicit rule acceptance, separate private following, a followed-topic stream,
public sharing, canonical posts/comments/drafts and scoped management are present.
Owners offer responsibilities; the named member must accept before gaining them.
Owner transfer removes former-owner management. Current restrictions, blocking,
account eligibility and topic visibility apply at the shared service boundaries.
The existing report review and author decisions handle content moderation.

Private member/history pages, stale snapshot concealment, exact-request recovery,
conflicts, safe account returns and account export/erasure remain in this feature.
No church/platform grants, phone opt-ins, background queues or new dependencies
are introduced. Topic activity does not send messages to other people as part of
this verification run.

## Local evidence so far

The latest focused gate passes 38 checks: 13 topic service/boundary groups and
25 existing draft, report review and protected-control groups. Populated migration
54 preserves original values. Topic records and topic constraints survive actual
PostgreSQL dump/restore. Types, focused lint and release-content checks pass.
The first ten built browser groups passed after correcting a saved-topic redirect
race with unsaved-work history cleanup. Expanded checks exposed a clean form that
could briefly submit the membership version from before joining; clean forms now
use current props, and uncertain requests retain their original payload. The
expanded browser and production HTTP suites remain in progress. Replies use the
existing canonical comment reader; its JSON and built browser checks are separate
from the post's HTML/RSC assertions.

The first clean full gate stopped because its older comment fingerprint had not
excluded the newly added nullable topic column. The second passed service checks
but found a CHECK-expression representation difference after restore. Inspection
of 788 schema objects found only the new topic length check's parentheses differed;
the unreleased migration now uses stable explicit comparisons. The focused restore
gate includes that constraint and passes. Failed artifacts are preserved. A fresh
full gate remains required for this final candidate.

## Runtime measurements

Isolated Node24/PostgreSQL17 measurements used 21 topics, 22 members in the selected
topic, 21 posts and 21 history entries. Guest discovery returns 20 topics using two
SELECTs and 3,038 JSON bytes. A member topic view uses 14 SELECTs and 550 bytes;
21 canonical posts use 20 SELECTs and 20,645 bytes. The 20-member/20-history owner
view initially repeated account and permission reads across three transactions.
Combining those related reads in one protected transaction reduces 43 SELECTs to
19 with the same 8,908-byte response size. Functional checks pass after that change.
These are local bounded workload observations, not production latency or a hosting
SLA. Browser request and final bundle/trace measurements remain pending.

## Recovery and release work remaining

The final encrypted production-copy rehearsal completed at 01:30:13 UTC and
verified 53→54 with the stable CHECK expression, preserved original columns across
97 tables and completed protected replay without production changes. Confirm the final full gate and browser
flows, runtime traces, protected recovery, exact READY/canonical deployment and
live behavior. Then synchronize the installed registry, run its ordinary restore,
compare live write fingerprints and reconcile the existing private feature/subtasks.

Restored topics remain quarantined until a legitimate current source verifies
ownership, restrictions and rules. Physical devices and real operator acceptance
are separate from isolated browser and recovery evidence. Final batch review stays
after all eligible feature work.
