# Stage 2 build plan

## Official platform design, September 2026

The owner approved the attached direction for the real platform, superseding the
preview-only proposal. See [DESIGN_IMPLEMENTATION_REPORT.md](DESIGN_IMPLEMENTATION_REPORT.md)
for scope, behavior, verification, publication, and remaining limitations. Account
security and private church/support boundaries from the preceding release remain
in force. The official interface is published at https://godschurches.com/platform.
The marketing landing page and production data were preserved. Local checks passed
(74 service/HTTP, 16 account browser, 15 design browser, 3 preference/contrast),
plus the production build and 39 HTTP/48 browser live smoke checks. The linked
report identifies the exact tested application commit and serving deployment.


<!-- ACCOUNT_REPAIR_CURRENT_BEGIN -->
## Account repair, September 8, 2026

**Published and verified on https://godschurches.com.** Application/tested commit:
`f3b2fe11ceaa1092bafc43f733e5e512c21fb027`. Vercel deployment: `dpl_6mY9kQiTvcp17hjxppr8H6JigQ3G`, READY at
2026-09-08T23:40:36.380Z. The canonical alias matched this exact deployment when checked at
2026-09-08T23:45:11.049Z. See ACCOUNT_TEST_GUIDE.md for the distinct signup/sign-in pages.
A report-only follow-up commit may redeploy the same application code; the IDs here
identify the release on which the controlled real-account test was performed.
This account repair supersedes the account status in the historical reports below;
Stage 2C support features are preserved, not expanded.

Confirmed defect: all registration P2002 conflicts were swallowed. Reproduced over
isolated production HTTPS: unique signup 200 with insertion and login 200; taken
public username plus fresh email 200 without insertion, then login 400. The live
inventory contained one legacy passwordless account. It is preserved. Protected
recent runtime logs did not establish Andrew's exact attempt; browser validity and
other failures cannot be retroactively inferred from a generic error screenshot.

Public handles now get explicit invalid/taken guidance (409 for taken), including
race and ambiguous unique-target rechecks independent of private email linkage.
Duplicate private emails remain neutral, insert-only, without overwrite, a created
flag or a session. After submission a distinct sign-in view retains only email in
short-lived page state. Existing accounts never receive a password through signup.
No email verification, church appointment, or sender is needed for ordinary new
signup/login. Recovery/verification delivery remains disabled and is stated plainly.

Forms have stable distinct IDs, POST methods, labels, email autocomplete=username,
public-handle separation, current/new-password hints, show/hide and FormData autofill.
No reset before successful navigation, no automatic retries and no credential app
storage. Profile edits are session-owned, explicitly validated, reject forged IDs,
and give visible failures. Optional new profile fields start empty. Privacy and
existing credentialVersion/password-change/logout protections remain intact.

74 automated service/HTTP checks passed: the previous 67 account/portal/support
regressions plus six focused production-HTTPS checks and one actual new-server-
process persistence check. Fresh/upgrade migrations, synthetic full restore,
production builds and runtime trace guards passed with unchanged schema/lockfile.
The browser flow passed 16 checks with the full Chromium binary: 320/390/1440px,
validity without request, event-free autofill, profile reload/new tab, browser-process
restart, private HTML/RSC, logout and fresh sign-in. Actual password-manager vaults,
physical devices, Safari, Samsung Pass, biometric and sync behavior are not verified.

Current encrypted PG17 production backup was decrypted and restored locally with
account/content fingerprints matching production; the restore server is stopped.
Exact-ID cleanup removed only the May 10 Test post, its comment reading Test, and
one same-owner reaction. Before/after account fingerprints match; one existing
account remains. No account, contact, church, support record, privilege or password
was changed. Private backup/manifest evidence is ignored under .account-test/account-repair;
no IDs, emails, hashes, cookie values, credentials or connection strings are in reports.

Session policy is unchanged: 30-day finite DB session and host-scoped persistent
Secure/HttpOnly/SameSite=Lax cookie. The browser must retain cookies. No Remember-me
checkbox, second session store, authentication bypass or new dependency was added.
Production origin remains https://godschurches.com, Node24/2048MB account API/60s,
8 existing migrations, SUPPORT_INTAKE_ENABLED=false, ACCOUNT_DELIVERY_MODE=disabled.
No blind rollback to pre-credentialVersion code is safe.


### Production outcome

One controlled disposable, unprivileged account was created through the real browser
form. PostgreSQL insertion and a non-null compatible password hash were confirmed
privately. Email stayed unverified and optional profile fields started empty.
Signup 200, sign-in 200, profile save 200 and fresh sign-in 200 were observed through
the actual production boundary. The same profile survived full reload, new tab,
actual Chromium process close/reopen and logout/fresh sign-in. HTML/RSC and application
storage checks did not expose its email, password or raw session token. A simulated
DOM autofill without input/change events successfully submitted through FormData.
The test completed at 2026-09-08T23:41:32.154Z; no external email or public post was sent.

Exact-ID cleanup then removed that repair-owned account and its one remaining
session after checking row state and all foreign-key dependencies. The existing
account fingerprint still matched the pre-test value. Final real data: one preserved
legacy account, zero posts/comments/reactions and eight migrations. Four post-cleanup
feed/search/profile checks passed, including zero public profile posts and no search
result for the removed verification account. The read-only fixture demo remains.

The separate live smoke run passed 39 public HTTP checks and
36 Chromium route/width checks for existing demo, portal, support,
login/recovery, guards and privacy. The controlled live account journey passed 16
browser checks. No browser JavaScript errors. Production diagnostics returned safe
ACCOUNT_VALIDATION/400 and ACCOUNT_ORIGIN/403 with random reference IDs. Local tests
also cover durable 429 and safe configuration/database 503 behavior. Recent protected
log retrieval alone did not identify Andrew's historical failure; successful live
creation is not proof that a preserved passwordless account can now sign in.

Canonical HTTP-to-HTTPS redirects return 308. Only the apex godschurches.com is
attached to this project; www is not a configured alternate origin. Exact-origin
checks were not relaxed. The existing Neon production target has eight completed
migrations; deployment reported no pending migrations. Runtime outputs confirm
Node24, 2048 MB and 60s for the account API and RSC counterpart. Actual Linux trace
checks passed: 49 traces, 3544 entries, 114 server JS files, no Prisma config loader.
No database, dependency, provider or schema migration was needed for this repair.

### Limits and next secure step

Existing passwordless accounts still require verified ownership recovery or a
separately reviewed owner-specific process. No unauthenticated claiming, silent
password overwrite, verification shortcut or account deletion was added. Recovery
emails remain disabled; do not promise them or repeatedly register the same email.
For a new-account check, use an unused public username and an unused email you control.
Andrew's old account is preserved unchanged. Actual password-manager Save/Update/Fill,
Apple/Safari, Samsung, biometric and sync behavior require the manual guide; this is
not a security certification or approval to open real church/support intake.

### Reproducibility

Run the existing Node24 `npm run test:support` harness for all 74 service/HTTP
checks, actual production-server restart, fresh/upgrade and restore checks. It uses
isolated loopback PostgreSQL and a verified local TLS certificate. No production
account or email sender is involved. `scripts/check-account-browser.mjs` exports
`checkAccountBrowser` for the isolated fixture preview, requires Playwright and a
full Chromium binary, and accepts a private output directory and fixture identity.
PLAYWRIGHT_MODULE and CHROMIUM_PATH can point to a local test installation; the bundled
runtime is the default here. Its certificate pin is local-only. Headless Shell was
not used to claim persistent browser-cookie behavior. Private helper scripts and
credentials are not committed. No actual password vault is accessed by this helper.

Browser implementation guidance checked against primary documentation:
[Sign-in form best practices](https://web.dev/articles/sign-in-form-best-practices)
and [HTML autocomplete](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete).

<!-- ACCOUNT_REPAIR_CURRENT_END -->


<!-- STAGE_2C_CURRENT_BEGIN -->
## Stage 2C current status (September 8, 2026)

**Published:** ordinary private support code and a fictional, read-only demonstration at the existing godschurches.com project.

Application SHA: 9177e86d8fde78db8ff5a50c7e8633b46900dc32. Vercel deployment: dpl_26z5tg2wEr8K6gAdS2xTJ4U6hY2e, READY at 2026-09-08T22:45:25.238Z. The canonical godschurches.com alias independently resolves to this deployment. Live verification finished 2026-09-08T22:46:45.832Z.

**Real new-case intake remains unavailable.** Production SUPPORT_INTAKE_ENABLED=false;
no real eligible RESPOND grant or approved SupportIntakeSetting has been created.
Andrew is the only confirmed operator, but a display name or founding role does not
appoint an account. ACCOUNT_DELIVERY_MODE=disabled remains unchanged. No real email,
fixtures, church appointments, member imports, case redactions or purchases occurred.
Code publication and a public demo are not approval for a real-member church pilot.

Verified candidate: Node 24.20.0, Next 15.5.25, Prisma/Client 6.19.3; unchanged lockfile.
67 real-service/HTTP checks pass (18 account, 26 portal, 23 support), plus fresh
migrations, actual Stage2B-to-2C upgrade, synthetic full restore, production builds,
dev-renderer guards, lint and TypeScript. Chromium: eight support journey groups
and 13 existing account/portal/demo groups; 1440px, 390px and 320px checks, keyboard,
no horizontal overflow or page errors. These are emulated browser widths, not physical
iOS/Android or screen-reader certification. Authenticated mutations use isolated
fictional actors, not production accounts. Live: 39 HTTP checks and 36 browser groups passed, no demo mutations or page errors.

Fresh protected real backup release-2026-09-08T22-39-07-914Z was restored from the encrypted artifact
using PostgreSQL17. Its exact candidate migration rehearsal preserved all 17 existing
tables' full-field fingerprints. One additive production migration completed at 2026-09-08T22:44:02.032Z; eight migrations are now complete, without verification backfill, support fixtures or grants.

See SUPPORT_OPERATIONS.md for the authorization/transition/provisioning and redaction
contract, SUPPORT_POLICY_REVIEW.md for concrete unapproved notice facts, and the current
QA/deployment sections here for limitations. Earlier dated sections below are historical
and do not override this explicit build-and-publish instruction or the current result.
Stop after 2C. Recommended next bounded stage: real verification/recovery delivery,
verified operator/church provisioning and operational/policy approval, not more demos.

### Completed sequence and next boundary

Reviewed actual history and source; implemented the small model and private projections; added lifecycle, explicit routing/sharing and minimal redaction; built member/owner/mobile views and fixture-only demo; ran the expanded existing harness and browsers; restored and migrated a fresh encrypted production backup in isolation. Publication follows the existing protected release workflow. No next feature system is started.

### Implemented support slice

Eight new support models: Case, Message, CoordinatorShare, Read, Operation, AuditEvent,
CapabilityGrant and IntakeSetting. Four ordinary categories and five case states;
feature decisions remain separate from support resolution. No general messaging,
attachments, pastoral records, allegations, AI triage, anonymous intake or notifications.

Private service projections and HTTP/HTML/RSC enforce requester, one current assigned
RESPOND owner and at most one deliberately shared eligible coordinator. ASSIGN alone
gets only opaque unassigned routing metadata; REDACT additionally requires ownership.
Role/category, public contact title and church membership never imply case authority.
Versioned grants and shares, revocation hooks, case versions, transactions and actor-bound
HMAC retry receipts prevent stale writes or renewed grants from reviving old access.
An unassigned reopen stays unassigned even if the intake default changes; assignment
requires its own explicit audited handoff. Requester history survives leaving its fixed
church context. The global pilot transaction gate is not a load-tested large queue.

Real platform copy says Create an account and that early-preview account/post data is
saved. Landing design and deferred search correction are unchanged. New private routes:
/platform/help/new, /requests, /inbox, /routing and /cases/[caseId] beneath /platform/help;
API /api/platform/support. Public fixture-only routes are /platform/demo/support-requests,
/platform/demo/support-case and /platform/demo/support-inbox; no login or live state.

<!-- STAGE_2C_CURRENT_END -->

## Earlier dated records (historical)

<!-- RELEASE_STATUS_BEGIN -->
## Published release (September 8, 2026, America/Chicago)

The actual account foundation and Stage 2B church portal are published together at
https://godschurches.com/platform. A persistent, signed-out, fixture-only tour is
available at https://godschurches.com/platform/demo. The original landing/feed remain.

Application SHA: 7679e034b93e3a905a7bee92ac6f5c377c2ce42d.
Vercel deployment: dpl_GnAHFqqiDBzheEh6j6ohL4G1P21R, READY; canonical alias confirmed.
Published September 8, 2026 at 16:10:07 CDT (21:10:07 UTC).
This current section supersedes the historical local-only/no-deployment statements
below; it does not retroactively change their results or remove real-member gates.

The user explicitly included routine publication in this and future authorized
build stages unless they say otherwise. Stop before the next feature stage.
No purchases, member imports, email/invitations, real church appointments, auth
bypass or destructive production data changes were performed.

Verification: 44 isolated account/portal tests, five demo fixture tests, lint,
types, fresh/upgrade migrations, production builds, encrypted real backup restore
and upgrade rehearsal passed. Actual local Chromium: 13 journey groups including
320px keyboard/mobile. Live: 28 HTTP checks and 27 browser checks, no page errors
or demo mutation attempts. Two additive production migrations applied; seven
complete. Linux build traces exclude the Prisma configuration-loader request path.
Account/portal functions: Node24, 2048MiB, 60 seconds; hashing was not weakened.

Published is not pilot approval. Real recovery/verification delivery is disabled;
operator identity/provisioning, real church/reviewer appointments, independent
security/privacy review, policy/retention and independent concern routing remain.
No email was silently verified and no demo data was inserted into production.
An actual owner-authenticated production journey was not exercised. Comprehensive
mutation/concurrency tests used isolated fictional records, not live accounts.
See DEPLOYMENT_REPORT.md for exact URLs, evidence, availability and recovery limits.

The application remains the SHA above. Post-verification report changes are a
local documentation-only successor, not a different published application release.

<!-- RELEASE_STATUS_END -->


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
