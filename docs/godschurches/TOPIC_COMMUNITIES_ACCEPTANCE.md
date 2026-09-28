# Topic communities acceptance

## Creation privacy locally verified, 28 September 2026 UTC

Topic creation source `3daddc6` is implemented and tested, **not merged or live**.
Draft fields, public-rule consent and original save requests survive concealment
and actual account-changing server refreshes. Private inputs leave DOM and are
not present in initial HTML. Late replies require current access and deliberate
continuation; lost replies replay one immutable request with one saved effect.

All 29 browser, 22 service and one HTTPS groups pass, including the existing
creation, joining, follow, management and canonical-post interfaces. Exact build
and CI pass. [Security acceptance](ACCOUNT_SECURITY_ACCEPTANCE.md) records
reproductions, fixture corrections, measured bundle cost and remaining gates.
Management and private-list privacy remain open. Production remains .40.

## Original-request recovery verified live, 28 September 2026 UTC

Version .40, source `4a540cfeea2b5e86f4c83b60272fa2360bf80879`, is implemented,
tested, merged and verified live in READY/canonical deployment
`dpl_7W9DsGLe4kJUca6atcz3We1iCmnV` at 07:31:04 UTC. The combined profile/Topic
release passed 107 browser, 63 service and five HTTPS groups with exact source
reuse recorded in [security acceptance](ACCOUNT_SECURITY_ACCEPTANCE.md).
All 165 live checks plus five release/health checks passed; all 165 production
fingerprints stayed unchanged. There were zero new migrations, application test
writes, sends or queue probes. Broader Topic DOM/SSR concealment and account
remount survival remain open for reproduction; the mounted original-request
contract is the completed scope.

## Original-request recovery update, 28 September 2026 UTC

The .40 candidate is locally verified, not merged or live. Mounted Topic forms
retain immutable original requests across uncertain replies, cooldown, account
replacement and version/permission denials. Retry rechecks current authority and
never changes versions or keys. Only an explicitly classified first dispatched
precommit rejection permits correction. Warned stop/reload clears local recovery
and does not undo saved changes. Confirmed receipts recheck the original account
before navigation; unmounted forms cannot redirect a later page.

Eight focused browser groups, 22 service groups and exact-source build/CI pass
on `c650e12`. [Security acceptance](ACCOUNT_SECURITY_ACCEPTANCE.md) records the
before-change reproduction, tests and scope. Broader Topic DOM/SSR privacy and
account-changing remount survival are not closed by this update. Earlier release
receipts below remain historical evidence for their original scope.

September 15, 2026 UTC · released and verified live

Product **2026.09.14.18**, serving **55c53f49c5aee39a0d07e48248c0d3f7e7bf8dde**,
is READY in **dpl_BsgcgZHjcEsP1v8Tmv1ah1p9F7tP**. The independently queried
`godschurches.com` alias and live release/build endpoint match. Application source
and full regression source are **0d49b43**; subsequent commits change only test
assertions and engineering evidence. This completes the topic feature cycle.

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

## Regression and browser evidence

The uninterrupted full gate on **0d49b4372b72693288e893c5503350b0a5b663bd**
passes all **136 discovered test files**: **845 executions, 843 passes, zero
failures/cancellations and two expected disabled-delivery skips**. It covers
populated upgrade, PostgreSQL restore, fresh migrations, production builds,
process restart, development and production HTTP boundaries and all discovered
service tests. The harness exits successfully after its completed preview closes.

The latest focused gate passes 38 checks: 13 topic service/boundary groups and
25 existing draft, report review and protected-control groups. Populated migration
54 preserves original values. Topic records and topic constraints survive actual
PostgreSQL dump/restore. Types, focused lint and release-content checks pass.
Final application source **0d49b43** passes all 12 topic browser groups and all
five photo recovery groups. Another 53 related browser groups passed across the
reviewed candidate chain: discussion moderation, comment reading/recovery,
composer, draft library, profile settings, scoped report review and content
moderation. The 15 discussion/comment reader/recovery groups were also rechecked
successfully on final application **0d49b43** after the shared history repair.
Topic checks cover creation, two guest-readable communities, canonical
replies, empty/error recovery, exact uncertain retries, keyboard joining,
independent following, composing, explicit role acceptance/revocation, stale
changes, current rules, restrictions and 20/1 pagination with return navigation.
Touch-width and desktop screenshots were inspected. No physical-device result is
implied.

The browser checks exposed and repaired saved-topic navigation racing with
unsaved-work history cleanup, clean forms briefly retaining an older membership
version, and intermittent client pagination returns. Shared cleanup now resolves
after all native Back-event listeners; dirty and uncertain payloads stay intact.
Topic pagination requests a fresh page. Production-mode topic HTTP checks pass
public HTML/RSC, the canonical comment JSON reader, account/consent boundaries and
restricted-content concealment. Replies remain owned by the canonical reader.

The photo harness now observes actual visible content and loaded image pixels
instead of waiting for global network silence. Its withdrawal assertions follow
the whole-post privacy guard, verify removed image elements and direct-image 404,
then exercise explicit reload recovery. Older failed logs are preserved, including
obsolete draft selectors and missing isolated photo flags; they are not counted
as passing checks.

The first clean full gate stopped because its older comment fingerprint had not
excluded the newly added nullable topic column. The second passed service checks
but found a CHECK-expression representation difference after restore. Inspection
of 788 schema objects found only the new topic length check's parentheses differed;
the unreleased migration now uses stable explicit comparisons. The focused restore
gate includes that constraint and passes. The third gate passed its service and
restore stages before stopping at the older topic-list comment HTML assertion;
the corrected canonical JSON assertion passes independently and in the fourth
clean full gate on exact **0d49b43**. The failed attempts remain preserved.

## Runtime measurements

Isolated Node24/PostgreSQL17 measurements used 21 topics, 22 members in the selected
topic, 21 posts and 21 history entries. Guest discovery returns 20 topics using two
SELECTs and 3,038 JSON bytes. A member topic view uses 14 SELECTs and 550 bytes;
21 canonical posts use 20 SELECTs and 20,645 bytes. The 20-member/20-history owner
view initially repeated account and permission reads across three transactions.
Combining those related reads in one protected transaction reduces 43 SELECTs to
19 with the same 8,908-byte response size. Functional checks pass after that change.
These are local bounded workload observations, not production latency or a hosting
SLA. Removing unused topic-link prefetching changed a three-variant navigation
probe from 29 automatic topic-destination requests to zero. One before-change
variant failed; this is a request observation, not a controlled latency result.
Final route JavaScript including shared chunks is 170,658 gzip bytes for discovery,
184,325 for a topic, 183,296 for management and 170,144 for followed topics, measured
with Node's default gzip. The local build has 157 clean runtime traces and 396
server JavaScript files. The actual provider build passes its runtime inspection:
157 traces, 16,436 entries and 395 server JavaScript files, with no private fixture,
environment or Prisma configuration-loader path. The canonical deployment queued
for 93.467 seconds and built in 93.127 seconds. Another existing project linked
to this repository also built the commit; its intended configuration is preserved.
These build observations do not establish a change to application latency.

## Recovery and live verification

The final encrypted production-copy rehearsal completed at 01:30:13 UTC and
verified 53→54 with the stable CHECK expression, preserved original columns across
97 tables and completed protected replay without production changes. All 54 live
migrations and their checksums match. The installed registry preserves its 53
prior checksums and matches the retained backup module. Its ordinary encrypted
54→54 restore passes across 100 tables and removes the plaintext restore.
The nightly wrapper verifies 39 sets with zero issues, zero removals and the
existing 28-day expiry / 30-day policy ceiling. The execution host must be awake.

Twenty public live groups, four secured health groups and seven actual signed-in
observations pass. They cover the genuine public empty state; current verified
creation entry without submission; private choices, ownership and followed-topic
views; Menu links; safe guest returns and denials; current release notes; the four
existing feed modes; and existing prayer/discussion/author controls. Creation,
role changes, posting and moderation mutations were exercised in isolated
fixtures, not through fabricated production communities. Guest eligibility
truthfully returns only a null account and false eligibility; private choices
return 401 and management returns a generic 403, all without caching.

The first public browser attempt matched a transient extra text node outside the
accessible main content; the final assertion targets that main. A second attempt
expected 401 for every guest endpoint; it now verifies the actual minimal
eligibility response and distinct management denial. All failed logs are retained.
The final public browser reports zero page errors and zero mutation requests.
Scoped provider error/fatal rows after READY through authenticated checks are zero;
the connected Chrome observations do not constitute a separate console capture.

Fourteen original-column production fingerprints match the pre-release baseline.
Topic communities, memberships, audit rows and topic post/comment destinations
remain zero. There are no new ranking snapshots, test user-data changes or sends.
No operator grant, suspension or account-access decision was created; eligible
account-manager coverage remains zero and retains its existing owner prerequisite.

Restored topics remain quarantined until a legitimate current source verifies
ownership, restrictions and rules. Physical devices and real operator acceptance
are separate from isolated browser and recovery evidence. Final batch review stays
after all eligible feature work. Reconcile the existing feature/subtasks and credit
the topic integration in its moderation/feed owners before selecting the next
eligible feature; broader operator, discovery and device criteria remain distinct.
