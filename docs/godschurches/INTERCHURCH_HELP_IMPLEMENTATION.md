# Interchurch help implementation

## Credential privacy and ministry help verified live, 27 September 2026 UTC

Credential privacy .30 and interchurch ministry help .31 are **implemented,
tested, merged and verified live** in one **2026.09.27.31** deployment.
Source `43839c4ba2ae2fdb814d126196cfb465ccb6b19c` is READY and independently
canonical as `dpl_59inZ5mK3kHTNcfm1RJTEuUJVLDo`, confirmed at **22:19:14 UTC**.
This supersedes the local-only credential and interchurch entries below.

The combined application passed 39 browser groups, 222 checks across 18 focused
test files including a ready-server HTTPS export retry, a ministry HTTPS flow,
and 14 enforced-MFA HTTPS assertions. The production build used `704a865`;
the only later source change is the test query typing correction in `43839c4`.
Full TypeScript, targeted lint and exact-source CI passed. Production passed
94 guest/page/browser/API checks and six health checks, with no page errors,
blocked mutation attempts, test writes or real-recipient sends. All 149 original
table fingerprints remained unchanged at **22:20:46 UTC**; scoped runtime error
and fatal logs were empty. Private account writes were tested only in isolated
fictional fixtures.

Both additive ministry-help migrations are applied and match all 117 source
checksums. There are 153 application tables; the four new help tables, typed
listing markers and new delegation grants were empty after migration. Fresh
115-to-117 encrypted restoration preserved the original table/column fingerprints
and completed protected replay against stable frozen journal snapshots. Provider
mutations were denied at fetch and Undici transport boundaries with zero attempts.
The installed 117 migration registry is updated; ordinary installed restore and
scheduled-job closeout are recorded in the backup operations report.

Password and email drafts remain only in mounted memory while private fields
leave concealed DOM. Expected-account checks precede credential use; delayed
success cannot clear a newer account or Google confirmation cookie. The actual
Account, Connected sign-in methods route and explicit recovery links passed.
Ministry requests, scoped personal or organization offers, agreed terms and
outcomes use current delegated authority, explicit pair consent and privileged
session assurance. Background signals cannot reveal concealed help data.

Retain the complete corrected, enum-aware application and 117 migrations for
recovery. Revoking a grant does not make older Prisma clients safe; do not
blindly roll back to .29 or remove the new schema. Broader security review,
legitimate appointments, child-duty policy, real-provider/device acceptance and
operator/pilot readiness remain open. This release is not a certification or an
authorization to reopen restored traffic.

This implements the accepted Interchurch Help Contract as a usable request,
private offer and explicit outcome flow. The isolated feature includes its storage,
services, interface, existing access/retention owners and focused verification.
Broad regression is still running at this checkpoint. This is not integrated,
deployed or activated for real church delegates.

## Canonical ownership and consent

A marked church-owned Exchange listing retains title, place, audience, publication
and moderation. Its request extension owns category, duties, duty classification,
standalone proposed window, explicit compensation and reimbursement, named
coordinator consent, terms versions and request outcome. Storage prevents mixing
quantity needs, ordinary inquiries and typed help. Ordinary editors reject typed
requests; storage also rejects material writes by the reviewed older writer.

Personal and organization offers have immutable named pairs and representation.
Organization offers require the explicit COMMIT_INTERCHURCH_HELP capability,
current approved church connection and current grant/appointment epochs. Exchange
management, membership and position titles never confer it. No migration grants
this capability. Existing reviewed claim and dual-capability delegation owners
remain authoritative; self-grants remain unavailable.

Selection acknowledges a proposal without confirming delivery. Confirmation
requires both named adults to acknowledge the same current terms. Material changes
invalidate acknowledgments and selected contact values. Contact sharing is optional,
exact-pair consent; withdrawal does not claim an obligation completed. Completion
requires the current requesting coordinator's explicit receipt. A Closed label or
date passage never establishes fulfillment. Child-facing work under any category,
physical equipment loans and signing up another adult remain unavailable.

## Privacy and recovery

Current-source checks cover both eligible adults, church audience, coordinator,
blocks, optional contact permissions and explicit organization authority. Reissued
grants, restored membership and unblocking do not revive old consent. An owner can
withdraw contact or cancel remaining responsibility after source loss. Coordinator
withdrawal also remains possible after a grant is revoked. Completed receipts are
preserved when unfinished responsibility is revoked.

Private reports select one pair; evidence excludes chosen contact fields and other
offers. Account export includes authored offers, own contact settings and currently
permitted receipts. Erasure removes the actor's private values while retaining the
other participant's necessary anonymous receipt. Restrictive recovery quarantines
older restored records with opaque monotonic controls. Existing retention maintenance
clears aged contact values in bounded batches; no new scheduler or provider exists.
Activity previews are generic; optional push consent is dated and separate from
participation. This slice sends no email. Private projections and dispatch resolve
authority in bounded batches instead of one authorization query tree per offer.

## Migration and rollback gate

Migration `20260927195000_interchurch_help` is additive: two enum values, one nullable
listing marker and four typed tables with constraints, indexes and restrictive
triggers. It changes no existing account data and grants no permissions. It has
only been applied to isolated fictional databases.

The actual Prisma client generated from reviewed source
`28aafcdf9c6136a8081c3b16ec79941dad11e512` cannot read unfiltered direct or assignment
grants containing the new capability, even when the grant is revoked. Revoking a
grant does not make that old build a safe rollback. The current enum-aware client
reads both states. Older generic writers cannot edit typed help records.

Migration `20260927210000_interchurch_help_terminal_offers` follows the first
migration. It releases the current-offer uniqueness slot when a selected agreement
is explicitly completed, preserving the completed receipt and allowing a fresh,
deliberate proposal. Cancellation similarly ends the active offer without erasing
its receipt. Canceled request outcomes are terminal for new acceptance, and canceling
an entire request clears unfinished agreement acknowledgment/contact consent.
Fulfillment requires a current-scope completion receipt and no unfinished selected
commitments; canceled history is retained without becoming required replacement work.
Neither migration creates a real appointment or inferred consent.

The complete tested feature source and enum-aware generated client are the proposed
minimum compatible rollback baseline. The earlier backend checkpoint is superseded
by subsequent consent/revocation corrections and must not be treated as sufficient.
The release owner must accept an integration-compatible artifact before any real
new grant. Rebuild with the locked dependencies and regenerate Prisma after merging
both migrations; the preserved local built artifact is isolated verification evidence,
not a production deployment. Do not drop enum values or typed tables to force a
rollback. Production migration, compatible artifact acceptance, canonical-domain
verification and real appointments remain with the release owner and reviewed operators.

## Interface and focused verification

The Exchange links lead to category/place/date discovery, church request drafts,
publication, private personal or explicitly delegated organization offers, bilateral
terms, independent optional contact sharing, cancellation and explicit completion.
Public requests display proposed duties, window/time zone, compensation and chosen
coordinator information. Private cards identify only the authorized named pair and
represented church. There is no inferred signup, loan reservation or checkout.

The client keeps private fields out of HTML/RSC and conceals them on blur, offline
or account changes. Current-account checks precede redisplay. An uncertain mutation
retains its exact original body/key; stale drafts stay guarded. Pristine editors
adopt updated fields and versions together, preventing silent concurrent overwrites.
Agreement acknowledgment, proposed amendments, contact consent and optional push
notices are distinct deliberate choices.

Twenty-two focused service/compatibility groups pass, including the actual old-client
enum failure, preservation of all original columns in 149 existing tables through
both migrations, no inferred permissions, concurrent selection, private pair/role
revocation, erasure/export, selected reporting, protected restore, completed history,
contact/push consent and exact retries. Public request versions follow published
terms, so private offer, selection and contact activity cannot change the public
projection; only authorized management reads receive the mutation version.
Two-pair current authority resolution uses
13 queries. Pages are bounded at 20 records; private identity names use two batched
lookups after authorization. There is no polling, new dependency or new scheduler.
The help routes report 2.62 kB route JavaScript and 166 kB first-load JavaScript in
the production build; these are measurements, not a claimed baseline improvement.

Final application source `7d6eeb4423eab8bb36e628b99ee8f7e720dddc84`, built as
`2JP0_vJb1lf7iA3myW76N`, passes 14 actual browser groups and an HTTPS
boundary group. Coverage includes request creation/publication, private and paid
organization offers, explicit church delegation, loss of a committed response,
account switching, HTML/RSC concealment, independent contact consent/withdrawal,
concurrent pristine-editor refresh, explicit fulfillment, and a 320-pixel enlarged
dark layout. No uncaught browser errors were observed. TypeScript, lint during
build, authored-copy and source-security checks pass. Hydration verification,
235 runtime traces and built public-file secret checks pass. The source-copy build
has no Git index, so source-security verification was also run in the real worktree.

Browser fixture corrections preserved real guards: startup certificate trust was
set before Node began, accessible form labels were separated from control values,
and navigation waits for existing unsaved-history cleanup. Private failure evidence
is retained. No other worker's files, processes or fixtures were changed.

The broad account/portal/support harness passed all 213 discovered test files,
synthetic upgrade, backup/restore, fresh migration, development and production
HTTPS checks. Its repeated phases recorded 1,359 passing assertions, two expected
skips and zero failures. Its original production artifact predates final focused
corrections, so this is layered acceptance, not a claim that the entire harness ran
against the final artifact. The final 22-group service/compatibility run and separate
built browser and HTTPS checks above cover the final feature source. Its raw
migration fixture received the terminal-offer migration transactionally before the
new help tests; separate focused rehearsal verifies fresh additive upgrades.

Real appointment, safeguarding/policy, provider, physical-device and pilot acceptance
remain open. Later event/shift associations, equipment catalogs and church
partnerships are separate features; no duplicated calendar or volunteer capacity
was added. Tested commits are ready for integration with the two additive migrations
and the final compatible source. Integration rebuild, release-owner review and live
acceptance remain required; no production migration, deployment or real grant was
performed by this feature builder.

## Integration review corrections

Integration review reproduced two additional privacy defects on the handed-off
application source above, before corrective edits. A background relationship signal
after blur or pagehide could resume private reads and redisplay retained drafts.
Private coordinator and organization-offer reads also omitted the canonical
session-bound authenticator requirement when privileged enforcement was enabled.
Both findings were reproduced against the earlier built HTTPS application; its
acceptance is superseded for these boundaries.

Background refresh now requires an already active page. Concealment clears queued
refreshes, and late primary reads cannot start a follow-up context read or restore
fields. Current church-duty private projections require current privileged session
assurance before disclosing names, terms or contacts. Expiry denies only access;
it does not revoke pair consent. A renewed real authenticator challenge restores
access. Personal offers retain personal access despite unrelated assigned duties.

Corrected build `DfkFVW0cCseK0wY7bVOvI` passes 17 browser groups, 37 focused
service/compatibility/HTTPS assertions including nested assurance cases, and a
separate 14-assertion enforced-MFA HTTPS run. Those tests cover absent, expired,
wrong-session and changed-authority proof, canonical proof renewal with unchanged
agreement/contact consent, concealed contact and draft fields, delayed responses,
queued background work and focus recovery. Application source digests match the
built snapshot. Type/lint/build, copy, hydration, trace and source-security checks
pass. The earlier 213-file broad harness remains separate valid baseline evidence;
it was not rerun or represented as a run of this corrective source. No schema,
migration, production setting or real grant changed in this correction. The
corrective source is mandatory for integration and a compatible rollback baseline.
