# Stage 2 build plan

## Current Stage 2B disposition (September 7, 2026 local)

The pasted Stage 2B prompt explicitly authorizes implementation and testing of
church connections, optional private directory and named contacts. That bounded
slice is implemented on `codex/church-portal`, continuing the completed account
foundation, not restarting from old main. Final evidence/gaps are recorded in
QA_REPORT.md. No deployment or ordinary case implementation is authorized.

Implemented sequence:

1. Rerun the 18-check account baseline in a new loopback PostgreSQL cluster.
2. Reconcile the actual lockfile/audit and apply supported compatible fixes.
   Remaining deepmerge-ts major-version remediation is documented, not forced.
3. Add account eligibility, Church/connection/consent/capability/contact/audit
   models and an additive migration. Keep account hashes and versions compatible.
4. Centralize portal operations and private projections in `portal.ts`, with a
   typed HTTP boundary in `portal-boundary.ts`; do not duplicate policy in pages.
5. Add member, reviewer and operator pages using existing Next and dark/gold design.
   Remove duplicate marketing/application navigation and nested main landmarks.
6. Extend the existing real-service/HTTP harness, fresh/upgrade migration rehearsal,
   and synthetic backup restore; keep a fictional two-church preview for review.

Correction to the original proposal below: **two separate unique indexes for
PENDING and APPROVED are insufficient**. The implementation has a single partial
unique index covering BOTH states. A deliberate leave-first path is required.
Optimistic versions return 409 on repeated/stale writes; they do not silently
pretend an old request is a new success. Audit and state changes share a transaction.

Small implementation choices: no generic organization or role engine; all church
policy is in one service module. A transaction-level advisory gate serializes this
bounded pilot's portal reads/writes, combined with row locks and DB uniqueness.
Views are capped at 100 records and have no bulk export. Before broader rollout,
review scoped locking, pagination, monitoring and load tests. Do not claim arbitrary
church counts or production throughput based on this local implementation.

Next: review this local slice and the QA limitations. After separate authorization,
the next feature slice is the ordinary private support case system, including
participant authorization, safe ownership/state history and independent-route
operational requirements. Do not start calendar or broad social expansion now.

Parallel release decisions must not disappear: review the independently releasable
claim correction `f027758` and security patches, or plan a compatible full account
release. Any publication still needs explicit approval, target/SHA verification,
appropriate migration/recovery planning and the gates in RELEASE_READINESS.md.

## Historical proposal and Stage 2A notes

Prepared September 7, 2026 against main 68b4190. Proposed, not approved or implemented. Read CURRENT_STATE.md and DECISIONS.md first.

## Bounded outcome

An eligible adult requests a church connection, an explicitly scoped reviewer decides it, the adult independently opts into directory sharing, and named configured contacts plus private ordinary support are available. Preserve public social content and dark/gold identity. Beacon is intended pilot context, not an authorized appointment. Build two fictional churches in isolated data first.

Keep Next/Prisma/PostgreSQL, existing accounts and URLs. No replacement site, microservices, paid service, speculative family/calendar/money/media/messaging/ranking infrastructure. Do not broadly upgrade frameworks merely because a newer major exists. Review supported security patches and official library guidance in stage 2 before changing auth or framework behavior.

## Sequence and modules

### 1. Isolate baseline and repair account boundaries

Create a codex/ branch when implementation is authorized. Verify an explicitly non-production PostgreSQL target before fixtures/migrations; never infer safety from a .env filename. Use Node's built-in test runner with focused integration fixtures because there is no existing test framework. Exercise actual extracted services against isolated PostgreSQL rather than duplicated mocks. Add only a minimal TS test execution path appropriate to installed Node. No test framework installation is needed in stage 1.

Change `app/platform/actions.ts`, `lib/platform/auth.ts`, `lib/platform/session.ts`, `app/platform/login/page.tsx`, `app/platform/settings/page.tsx`, and README. Remove unauthenticated legacy claiming. Preserve existing users and content. Add bounded validation, generic login/recovery responses, persistent abuse limits, explicit password resource settings, and transactional password change/reset plus session invalidation. Use established crypto/library primitives, not a custom algorithm. Add verified contact and one-use hashed expiring recovery tokens with atomic consumption. Add a delivery interface and a test sink; do not treat MailerLite marketing sync or unused Resend code as an operational recovery sender. External delivery can remain explicitly blocked while local tests pass. Old passwordless accounts require verified ownership recovery, never a guessed email/username combination.

Proposed fields: account status, emailVerifiedAt and versioned adult-eligibility acknowledgment on PlatformUser; AccountRecoveryToken purpose/hash/expiry/consumedAt; bounded auth-attempt storage or an existing verified equivalent. No dates of birth/ID documents. Existing rows stay unknown eligibility and unverified, not retroactively consented. Require adult acknowledgment and verified contact for the new church journey; preserve existing public content. Transactions lock account rows so recovery consumption and session creation cannot race with revocation. Evaluate fresh privileged reauthentication and second-factor requirements with independent review before real appointment.

Reuse DB-backed sessions; do not encode church permissions into long-lived tokens. Add central `lib/platform/authorization.ts` and `lib/platform/projections.ts`. Expose only explicitly selected public fields. Test session invalidation, legacy takeover denial, malformed/overlong inputs and cross-origin writes. AC-01, AC-03, AC-10, AC-13, AC-14.

### 2. Establish churches and scoped authority

New `lib/platform/churches.ts`, `app/platform/churches/page.tsx`, `app/platform/churches/[churchId]/page.tsx`, `app/platform/churches/actions.ts`, and a scoped operator route under `app/platform/operator/churches/`.

Proposed tables: Church (public approved fields, setup state), ChurchCapabilityGrant (actor, user, church, capability, granted/revoked timestamps), PlatformOperatorGrant (separate explicit operational capabilities), ChurchAuditEvent (actor, church, transition/action, target, timestamp). No catch-all isAdmin. Suggested capabilities: establish church, manage scoped grants, review connections, appoint contacts. Reviewer authority never implies private directory visibility.

A non-production-only bootstrap script provisions synthetic operators. Real operator provisioning requires a documented identity/ownership check, evidence of church authorization, and an explicit appointment by the accountable operator before a separately approved release. No email-string allowlist, first registrant, account category or contact label confers authority. Guard all server actions with current DB grant/suspension checks. Keep real high-risk ownership transfer out of self-service. AC-02, AC-03, AC-05, AC-06, AC-15.

### 3. Implement connection lifecycle and single Home Church

New `lib/platform/connections.ts`, `app/platform/my-church/page.tsx`, church review page and actions. Proposed ChurchConnection has userId/churchId unique pair, state, version, timestamps; transition history is append-only minimal audit. No pastoral note field.

States: PENDING -> APPROVED/DECLINED/WITHDRAWN; APPROVED -> LEFT/REMOVED. No connection means absent row; do not mix suspension with connection state. Re-request after withdrawn/left/declined/removal may explicitly return to PENDING with bounded rate limits, unless a separately recorded active account restriction applies. Every re-request still needs review. Proposed one open request per person and one approved primary connection; reject new requests while approved elsewhere with a deliberate leave-first explanation. Following stays independent. Transfer workflow deferred.

Use SQL partial unique indexes on userId for APPROVED and PENDING plus unique userId/churchId; Prisma migration SQL must preserve these indexes. Lock the user row during request/approve/leave/remove, then compare expected version/state. Scope reviewer to church and reject self-approval even with a grant. Audit and state mutation occur in the same transaction; identical retries return the stored outcome, conflicting transitions return clear conflict, not silent success. No auto-transfer/backfill from role or follows. AC-04 through AC-08, AC-13.

### 4. Optional directory with server-side audience projection

New `lib/platform/directory.ts`, `app/platform/churches/[churchId]/directory/page.tsx`, and sharing page/actions. Proposed ChurchDirectoryPreference relates to connection, defaults opted-out, stores optional contact email/phone distinct from login email, each with ONLY_ME or SAME_CHURCH audience. No personal address, public affiliation flag or directory export in this slice.

Approved eligible members may view only opted-in names plus individually shared fields for that church. Reviewer/operator/contact status provides no bypass. Non-opted-in approved members may browse eligible entries; explain this in copy. Projection occurs before returning any page/action DTO, using identical predicate for search/counts. Directory opt-in and contact sharing are independent; no auto-copy of auth email. Audience preview renders the owner's projected fields only.

Private responses stay dynamic/no-store and avoid shared caches. Every request rechecks active membership/grants. Withdrawal/removal updates state, disables representative eligibility/grants dependent on membership, and clears directory consent for that connection; a later rejoin requires fresh opt-in. Invalidate affected route views; describe that already delivered information cannot be recalled. Minimize analytics to allowlisted generic route labels, exclude private case/church IDs and query/referrer data. AC-09 through AC-13.

### 5. Named contacts and ordinary support

New `lib/platform/contacts.ts`, `lib/platform/support.ts`, `app/platform/help/page.tsx`, `app/platform/help/[caseId]/page.tsx`, actions and restricted assigned-case queue. Proposed ChurchContactAssignment supports PRIMARY/BACKUP/RELATIONSHIP_OWNER, approved contact method, active dates and separately linked capability; one active primary/owner per church, optional backups. Contact assignment never grants permission. Church coordinators must remain eligible; loss of connection invalidates associated access immediately. Platform relationship owner is separately authorized, not required to claim church membership.

Proposed SupportCase, SupportParticipant and SupportEvent: requester, explicit owner/participants, optional church context, category, bounded subject/description, timestamps, status and resolution. Shared external updates are separate from internal operational history. Authorize every detail/list/write by requester or explicit active scoped participation, including guessed IDs. A church grant never yields all church cases. On representative removal, revoke role-based participation; retain requester's own ordinary case rights. Route to an actual active relationship owner only; otherwise mark unassigned. A later rejoin does not restore old shares automatically.

Ordinary states Received/In progress/Waiting for requester/Resolved/Closed, with requester reopen to Received. Features have independent decision state Received/Under consideration/Planned within approved scope/Delivered/Deferred/Declined. No master lifecycle mapping invented: living master was not supplied. Persist receipt before success; do not claim delivery or human review. No uploads, prayer/pastoral logs or sensitive allegation collection.

Use existing published email for direct ordinary contact beyond a representative. Do not auto-share a concern with its subject. Sensitive concerns about Andrew require an actual independent route, currently missing; defer their in-app intake and block real-pilot readiness rather than inventing personnel. AC-15 through AC-18.

### 6. Targeted navigation, search and accessibility

Change `app/layout.tsx`, `components/layout/site-header.tsx`, `components/layout/site-footer.tsx`, `components/platform/platform-shell.tsx`, `post-card.tsx`, `post-composer.tsx`, `app/platform/page.tsx`, login/settings/search/profile pages and `lib/platform/format.ts`.

Use a pathname-aware public chrome wrapper or compatible route-layout separation; retain URLs and a landing-page link, one app navigation and one main landmark. Intro is already hidden for members: preserve that behavior, shorten visitor discovery only. New navigation: Feed, My church, Search, Profile, Help with Settings reachable on mobile. Godschurches display branding; The Revival remains movement language. Never globally replace domain word church.

Map advertised category terms through PlatformPostType in search; retain content/scripture/people results, query bounds, deterministic createdAt/id order and explicit failure vs empty states. Do not index private affiliations. Add http/https website validation, accessible persistent labels, errors, reaction name/pressed state and true comment count instead of fetched-array length. Preserve existing content and keep further social expansion deferred. Check 320/375/390px and desktop, keyboard, focus, zoom and contrast. AC-01, AC-19, AC-20.

### 7. Policy drafts, rehearsal and release handoff

Prepare internal draft privacy/terms in docs before editing published routes. Inspect actual configured processors, account/social fields, directory consent and support handling; do not publish operator or retention placeholders. Separate waitlist marketing consent from account service communications. Record adult eligibility, data requests, moderation/reporting coverage, independent escalation and review facts with Andrew. Drafts are not legal conclusions; consult current primary guidance when preparing policy language.

Migrate only isolated synthetic DB first. Run all five existing migrations, seed passwordless/password accounts and content, then proposed additive migrations; separately test fresh setup. Assert IDs/content/password hashes/follows preserved, null/new fields opt-out, constraints reject concurrent conflicts. Use two churches with distinct reviewer/member/representative/operator fixtures. Exercise direct server denial, payload filtering, existing sessions after removal, recovery token reuse, query failures and support guessed IDs. No real users or invitations. AC-01 through AC-24.

Take and restore a synthetic PostgreSQL backup into a second isolated database, verify fixture counts/relations/constraints, and rehearse forward repair and compatible app rollback. Do not run migrate reset or restore against production. Record exact commands/results in QA_REPORT.md and RELEASE_READINESS.md during implementation. Production backup availability/retention and restore authority remain unverified.

## Stage 2 handoff condition

No stage 2 prompt was supplied, so its wording cannot be approved as written. Recommended instruction: implement this reviewed bounded sequence on an isolated branch/database, beginning with account ownership/recovery, then church-scoped services and tests; no production migration, publish or real appointments. Missing delivery and operator facts block their dependent acceptance/release claims, not synthetic development. Finish with evidence, not a claim that the pilot is ready.
