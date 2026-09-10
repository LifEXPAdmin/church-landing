# Godschurches current state

## Verified email-change release — September 9, 2026

Current-password-confirmed sign-in email changes are implemented and locally
verified on `codex/account-email-change`. Confirmation requires the same account,
a one-use link delivered to the new address and the current password; it revokes
every session while preserving profile, church and directory records. All 116
applicable isolated checks, lint/types, migration/restore/restart, browser flows
and the final production build/runtime trace passed. Two enabled-delivery cases
are intentionally skipped in the disabled production-mode pass. Application
`0b885a7abfd736f45ee6f863ee22c9905c8c4ec5` is live on READY deployment
`dpl_BccPQgGhXJD98qd6wXXHRN8HwJKG`; exact SHA/canonical serving identity and
17 live checks passed. Delivery stays disabled until sender setup is ready.
See [ACCOUNT_EMAIL_CHANGE_REPORT.md](ACCOUNT_EMAIL_CHANGE_REPORT.md).

Next product work is guest browsing: public posts/comments and church pages are
readable without an account; participation, settings and member-profile views
require contextual account access. Topic communities are captured in the private
canonical roadmap for implementation with discussion/moderation foundations.

## Account lifecycle published — September 9, 2026

Password-confirmed deactivation and explicit reactivation are implemented on
`codex/account-lifecycle`. Duty handoff is enforced before deactivation; sessions
and sharing end while stored records remain. Inactive community content is hidden
and all community writes recheck session status under the shared access gate.
All 105 isolated service/HTTP tests, lint, TypeScript, migration/restore/restart
checks, actual fictional browser flows and the final production build/runtime
traces passed. Application `c08226efba67dcc2aabe1f4c97030aafdfe922bc` is live
on READY deployment `dpl_2iwfAMNWTszoV6Nfx1KxmjEK5L5T`; exact SHA/canonical
alias and 17 live checks passed. See [ACCOUNT_LIFECYCLE_REPORT.md](ACCOUNT_LIFECYCLE_REPORT.md).
Remaining account work includes actual email delivery, verified ownership changes,
permanent deletion and Google linking; full parent acceptance remains open.

## Private account download published — September 9, 2026

Account settings now offers a password-confirmed private JSON download, bound to
the current active session through a one-minute authorization. Explicit fields
exclude credentials and unrelated private church/support data; oversized exports
fail without returning a partial file. Suspended sessions also cannot change
passwords. All 96 isolated service/HTTP checks, lint and final production
build/type/runtime traces passed. Actual local browser preparation/save, inspected
file content, wrong-password/expiry feedback and 320/390/1440px reflow passed.

See [ACCOUNT_DATA_REPORT.md](ACCOUNT_DATA_REPORT.md) for scope, bounds and evidence.
Application `19c5850b931fd75ce4ea365206c654fc79c3ddff` is published on READY
deployment `dpl_ChL5CKaPNJSvz3jxJpMhk7XgzsLy`; the exact SHA/canonical alias and
11 live route/anonymous export checks passed. The broader list remains active, with
email activation, account lifecycle/ownership and remaining product work open.

## Account delivery integration published — September 9, 2026

The Resend adapter and post-response account delivery are implemented on
`codex/account-delivery`. All 91 isolated service/HTTP checks, lint, production
build/type/runtime traces and migration/restart checks passed. Requests remain
neutral; failed sends invalidate only the new grant; suspended accounts cannot
request or consume grants. No schema or dependency change was needed.

**Actual recovery email remains disabled:** production has no configured
transactional sender/key. Real sender verification and authorized inbox receipt
are still required. See [ACCOUNT_DELIVERY_REPORT.md](ACCOUNT_DELIVERY_REPORT.md)
for exact behavior, activation steps and the distinction between provider mocks,
local sink evidence and real delivery. Full account/Google acceptance remains
open. Application `5fc6d3fea4975655067687ee4bdf832edd178445` is published on READY
deployment `dpl_J11qS8MCY126MTQc7DGoX1zc9o5C`; exact SHA/canonical alias and
15 live route/anonymous API checks passed. No actual email was sent.

## Account session controls published — September 9, 2026

The owner-only active sign-in list and password-confirmed revocation of other
sessions are published from `codex/account-sessions`, application commit
`b792f500f4b0f6c9984e1526b4ccab2abd206288`, on READY production deployment
`dpl_Dow1e3xE9fhRV1eQk6d77vZDAjHM`. The exact Git SHA and canonical domain alias
were verified. Ten live route/anonymous API checks passed; the deployment-scoped
error query returned no matching entries. The 85-test isolated harness
and an actual two-browser fictional-session flow passed, including next-request
rejection for the revoked browser and continued access for the retained session.
See [SESSION_CONTROLS_REPORT.md](SESSION_CONTROLS_REPORT.md) for scope and limits.
This bounded slice does not complete the broader account recovery/Google work.

## App entrance published — September 9, 2026

The tested entrance was authorized for immediate publication and is now live at
https://godschurches.com. Commit `b0b7aab404b3d947267844e7ec73537dc81e1989` is on
main and deployment `dpl_J4D1fjzPS8zMSxgzazWStF3EVvQr` is READY. The exact Git SHA
and canonical alias were verified, followed by 30 passing live HTTP checks and
browser navigation/phone-width public-page checks. Remaining account/Google and
broader acceptance work continues separately. See the publication section of
[ENTRANCE_REPORT.md](ENTRANCE_REPORT.md). The local checkpoint below predates this
explicit release instruction.

### Local entrance verification checkpoint

The app entrance and waitlist retirement are implemented and verified locally on
`codex/app-front-door`. Root and old confirmation links lead to Home; old join
links lead to account signup; retired submissions and tracking return 410 without
writes. Public About/Help, navigation, metadata and service information match the
current application. Accounts and historical records are preserved.

All 78 isolated service/HTTP checks, final lint/build/type/runtime-trace checks,
and browser reflow checks for five routes at 320/390/1440 px passed. Browser scope
was anonymous local navigation; authenticated checks used the HTTPS harness.
The live site was not changed. Account/Google and applicable mobile/support gates
remain open. See [ENTRANCE_REPORT.md](ENTRANCE_REPORT.md) for actual evidence,
serving identity, limitations and the next account-foundation slice. The published
design and account reports below remain historical release evidence.

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


## Current: Stage 2B local portal (September 7, 2026 local)

This section supersedes the historical inventory below. Branch
`codex/church-portal` continues `9b6a5a0` and preserves account commits `f027758`
and `e8b370c`. Stage 2B implementation commit: `9e927f6`, local only. All 42
automated tests plus migration/restore/build checks pass; browser/device checks
remain blocked by the locked Mac. The user explicitly authorized Stage 2B,
not publication, production reads/migrations, real email, or ordinary support cases.
Production SHA remains unverified. Nothing in this report describes the live site
as patched or ready for private church use.

Implemented locally:

- Reusable Church records; explicitly provisioned operator capabilities;
  church-scoped reviewer and coordinator-appointment grants; minimal audit events.
  Account categories, following, Basic Auth, and contact titles confer no authority.
- Verified contact plus `adult-preview-v1` acknowledgment for private participation.
  Existing accounts are not backfilled as verified/adult. No birth dates or IDs.
  Suspension checks are integrated into login, locked session creation, and every
  session read. Account security from Stage 2A remains intact.
- Discovery, requests, My church, withdrawal, scoped approval/decline, leave/remove,
  and explicit re-request. A combined partial unique index permits only one row
  per person in either PENDING or APPROVED, not one of each. Following is independent.
- Version checks, transaction-scoped authorization and audit writes; self-review
  and cross-church decisions denied. Revocation is evaluated against current DB
  state in old sessions. Leaving preserves accounts and public content.
- Separate opt-in directory name; optional contact email and phone default ONLY_ME.
  Login email is never copied. Same-church approved eligible people may view without
  listing themselves. Fields are projected on the server, not hidden in the browser.
  Leaving/removal clears preferences and related grants/appointments. Rejoin needs
  new approval and consent; old appointments are not restored.
- Primary/backup Church Connection Coordinators and a distinct Godschurches
  relationship owner. Titles do not grant approval or directory access. Unassigned
  slots say setup pending. Direct published email remains available; no internal
  phone, invented staff, response promise, or independent responder is published.
- One application shell with Godschurches branding, mobile bottom navigation,
  labeled forms, pending/conflict/error/denied states and scoped review links.
  Marketing layout remains separate. Signed-in feed introduction remains hidden.
- All platform routes/API responses are private/no-store/no-referrer/noindex;
  platform tracking is disabled. Marketing analytics accepts only known paths and
  no arbitrary label/referrer. No directory search, export or public affiliation.

New routes: `/platform/churches`, `/platform/churches/[churchId]`,
`/platform/my-church`, `/platform/my-church/sharing`,
`/platform/churches/[churchId]/directory`, `/platform/churches/[churchId]/review`,
`/platform/help`, `/platform/operator/churches`, `/api/platform/portal`.
Services are `lib/platform/portal.ts`, `portal-boundary.ts`, and `portal-types.ts`.
UI modules are `components/platform/portal-*`. Additive migration:
`prisma/migrations/20260908032000_church_portal/migration.sql`.

`lib/platform/portal-session.ts` keeps credential access in a server data boundary.
Because the installed development Flight debugger serializes awaited I/O values,
new portal pages show a static notice before private reads outside production.
The local portal preview therefore uses a production build behind isolated HTTPS,
not the development renderer. Real email stays disabled in that server.

Dependencies: Next/eslint-config-next 15.5.25, Prisma/client 6.19.3, targeted
compatible transitive fixes. One remaining advisory appears as three high package
entries: GHSA-ggr8-5vv4-36mx in deepmerge-ts 7.1.5 via Prisma config. See
DEPENDENCY_REVIEW.md for named advisories, sources and reachability limits.

Evidence and exact final run status are in QA_REPORT.md and PROGRESS.md. Browser
checks are a distinct gate, not inferred from HTTP or compilation. Local generated
fixtures, sink records and credentials remain ignored under `.account-test/`.
The unrelated `docs/ai-assisted-investing-workflow.md` was not read or changed.

Release gaps: real recovery sender, independent concern route, actual church/operator
authorization, policy/retention facts, independent security/privacy review, real
backup/restore and deployed-version verification. Wider search-category correction,
ordinary support cases, policy publishing and calendar remain deferred.

## Historical inspection and Stage 2A evidence

Inspection: September 7, 2026 (local system date). Stage 1 only.

## Evidence and source

- Root: `/Users/awmccuen/Documents/New project`.
- Branch: `main`; HEAD `68b4190f83b6833251dcf1dd664804117ef4c930` (Add platform account settings).
- Remote: `https://github.com/LifEXPAdmin/church-landing.git`. Read-only `git ls-remote origin refs/heads/main` returned the same commit.
- No AGENTS.md found in the repository, searched parent project tree, or ancestor paths through filesystem root.
- Pre-existing untracked `docs/ai-assisted-investing-workflow.md` is unrelated and was not read or changed. No tracked changes existed at inspection start.
- Read all 17 sections and the final marker of the supplied build brief, release 1.0.0, plus the complete inspect-and-plan prompt. The brief dates its observations September 8, one day after the local date. Preserve those as supplied observations, not a new verified inspection date.
- The numbered prompt authorizes inspection and documentation, not product implementation or deployment. The brief's future behaviors are requirements/proposals, not evidence of existing functionality. Model-selection preparation text is not a product requirement.
- The optional living master, start-here document and stage 2/3 prompts were not supplied. No claim is made to have read them.

## Stack and deployment

Installed: Next.js 15.5.12 App Router, React 19.2.4, TypeScript 5.9.3, Prisma 6.19.2, Tailwind 3.4.19; npm/package-lock.json. Radix Slot and local UI components, not a complete installed shadcn component suite. Node crypto scrypt backs passwords; opaque database sessions back authentication. PostgreSQL is the schema provider. Historical user deployment logs identify Vercel and Neon, but current production configuration and deployed SHA were not accessed.

`package.json` has dev/build/start/lint and Prisma commands; no test script, test fixtures, CI workflow or test framework found. Five migration directories cover waitlist, analytics, platform, engagement, and password sessions. `next.config.ts` only enables strict mode. No tracked vercel.json or local .vercel linkage was found. README documents Vercel deployment. `scripts/prisma-deploy.mjs` loads Next env and supplies DIRECT_URL fallbacks before invoking migrations; `build` does not run migrations. Current Vercel dashboard command remains unverified. The wrapper omits DATABASE_URL_UNPOOLED and may fall back to a pooled address. It does not itself fill DATABASE_URL from POSTGRES_* the way `lib/prisma.ts` does.

Public URL in the brief: https://godschurches.com/platform. The web tool could not open it or the two search URLs (safe-open error). No live browser mutation or database query was performed. Matching GitHub HEAD proves source synchronization, not deployed-version identity. Runtime tests below are not implied by the earlier conversation's reports of successful posting.

## Routes and server boundaries

- Marketing: `/`, `/manifesto`, `/for-users`, `/for-churches`, `/for-creators`, `/for-businesses`, `/join`, `/thanks`, `/privacy`, `/terms`, sitemap and robots.
- Platform: `/platform`, `/platform/login`, `/platform/search`, `/platform/settings`, `/platform/profile/me`, `/platform/profile/[username]`.
- Admin: `/admin/waitlist`, `/admin/waitlist/export`, `/admin/analytics`; middleware protects these with shared Basic Auth, not platform capabilities.
- APIs: `/api/health` returns static ok (not a DB health test); `/api/track` accepts analytics writes.
- Social writes: `app/platform/actions.ts` server actions, direct Prisma calls. Identity: `lib/platform/session.ts`; hashing: `lib/platform/auth.ts`. Reads live in page modules, with shared server-rendered `components/platform/*`.
- Waitlist writes: `app/join/actions.ts`; MailerLite in `lib/mailerlite.ts`. Database success can coexist with failed email sync, which is caught/logged without a durable retry queue. `lib/email.ts` contains an unused Resend notification helper, not evidence of active delivery or password recovery.
- No jobs, uploads, church APIs, private messaging or background worker were found.

## Feature inventory and OBS mapping

Implemented below means source exists; behavioral verification is explicitly separate. No simulated social repository was found.

| Observation | Evidence in source | Status this inspection |
|---|---|---|
| OBS-01 preview/feed | app/platform/page.tsx; PlatformPost and PlatformUser | Implemented, builds; runtime untested |
| OBS-02 post/comment/reaction | components/platform/post-card.tsx; actions.ts create/delete/toggle; three relational tables | Implemented, runtime untested; no real records copied |
| OBS-03 profile | app/platform/profile/[username]/page.tsx and profile/me/page.tsx; updatePlatformProfile | Implemented, runtime untested; public bio/location/website/interests |
| OBS-04 text search | app/platform/search/page.tsx: contains on content/scripture, people name/username/bio | Implemented, runtime untested |
| OBS-05 Testimony mismatch | Same query omits PlatformPost.type; format.ts supplies display label | Source confirms mismatch; live reproduction unavailable |
| OBS-06 accounts | login/page.tsx, actions.ts, auth.ts, session.ts; PlatformUser/PlatformSession | Implemented with defects below; recovery missing |
| OBS-07 double navigation | app/layout.tsx renders SiteHeader; PlatformShell renders second nav | Confirmed in source; also nested main landmarks |
| OBS-08 large intro | app/platform/page.tsx conditional on !currentUser | Visitor intro present; already hidden for signed-in users |
| OBS-09 privacy | app/privacy/page.tsx | Waitlist-focused February policy; accounts/private church features not covered |
| OBS-10 terms | app/terms/page.tsx | Waitlist purpose and promotional consent language need review |
| OBS-11 churches | app/for-churches/page.tsx marketing route; no church model | Organization setup/review/connection functions missing, not hidden behind auth |
| OBS-12 design | platform-shell.tsx, post-card.tsx, app/globals.css; root Google fonts | Dark/gold source styling; responsive behavior not browser-tested |
| OBS-13 branding | app/layout.tsx, platform-shell.tsx, metadata, header/footer | Church display label persists; Godschurches direction requires targeted edits |

Follows use PlatformFollow unique pairs and upsert/delete actions. Signed-in feed is own posts plus followed users; logged-out feed is newest public posts. No interest ranking exists. Posts remain globally public through search/profiles. Church connection requests, scoped capabilities, directory consent/contact fields, representative assignments, ordinary support cases, moderation/reporting and account suspension are missing. The CHURCH/BUILDER enum values are presentation categories; no platform privilege branch currently checks them. Runtime forged-role denial still needs testing.

## Safeguards and concrete gaps

1. **Account ownership, high priority:** actions.ts:55-74 allows password assignment to a passwordless legacy account on matching email and username alone. Neither proves ownership. README endorses this unsafe path. The number of affected accounts is unknown; do not query/reset them during stage 1.
2. **Session recovery:** changePlatformPassword updates the hash but leaves all sessions valid. Logout deletes only the current session. Sessions expire after 30 days; reads check expiry in the DB. No reset tokens, verified email, suspension flag, logout-all or throttling. Login errors distinguish nonexistent/passwordless users, allowing enumeration. Login password input has no server maximum before scrypt.
3. **Hashing:** built-in scrypt with random salt, timing-safe comparison and hashed random session tokens is real, but no security verification is implied. Keep legacy verification compatible; review explicit resource parameters and a maintained implementation when building. Do not invent a new algorithm or force-reset stored hashes.
4. **Authorization:** writes require getCurrentPlatformUser; deletes constrain authorId and profile updates target current user. No church authority exists. Basic Auth admin must not be reused as scoped church authorization. No recovery or privileged reauthentication flow exists.
5. **Projection:** reads include whole PlatformUser rows (including passwordHash/email) into server components. These components are not client components, so this is not evidence of a proven browser leak. Explicit select/DTO boundaries and payload tests are required before adding private fields or client components.
6. **Caching/CSRF:** feed/search/profile are force-dynamic; identity uses React cache. No persistent private cache observed. No custom cross-origin override found in Next config. Server actions and SameSite=Lax are mechanisms, not an executed CSRF test. Verify Origin/Host behavior on the installed version before release. Revalidation currently mostly targets feed/profile.
7. **Search/data races:** query length unbounded; people order unspecified; post order lacks unique tie-breaker. Reaction read-then-create/delete can race despite unique index. Profile posts/likes unbounded; comment count is length of six fetched rows, with only three rendered. Website values are not restricted to http/https. Names/interests lack complete length bounds.
8. **Privacy/analytics:** global AnalyticsTracker covers platform paths; API records referrer, user agent and hashed IP. New church/case identifiers must not flow into general analytics. API input length/type bounds and default salt need tightening. No consent/recovery email delivery verified. Current policy does not implement adult-only eligibility.
9. **Accessibility:** auth/settings/search/comment inputs rely on placeholders; reaction button has only count text, no descriptive accessible label or pressed state. Layout has nested main. Mobile bottom navigation exists, but keyboard/mobile/contrast testing has not run.

## Baseline checks

| Check | Result | Limits |
|---|---|---|
| git status/log/remote and ls-remote | Passed | Remote main equals local HEAD; production SHA unknown |
| npm run lint | Passed, exit 0 | No behavior tests |
| npm run build with DATABASE_URL and DIRECT_URL overridden to dummy loopback port 1 | Passed, exit 0; compilation, types, 21 static pages | Does not exercise dynamic DB paths; existing .env loaded but DB targets overridden; no migrations run |
| Build warning | Nonfatal | caniuse-lite seven months old; no update installed |
| Public platform/search via web tool | Blocked | Safe-open errors; no live result claimed |
| Automated integration/auth/migration/restore/mobile tests | Not run | No existing harness/fixtures or verified isolated database; no framework installed |

No application code changed, dependency installation, live signup, email, migration, deployment or publication occurred.

## Stage 2A update (September 7, 2026 local)

The attached 06_Prompt_2A_Account_Security.txt authorizes bounded local account
implementation and tests. It does not authorize publication, production reads,
real email, or church features. The full source baseline above remains historical.
Implementation branch: codex/account-security, based on 68b4190. Local commit
f027758 independently closes legacy claiming and corrects its README/UI guidance.
Full account foundation is committed locally as e8b370c, with no push/deployment.

Implemented account foundation:

- Registration is insert-only. Duplicate registration has a consistent response
  and cannot change name, category, hash or sessions. New registrations require
  normal login; there is no implicit claim or auto-login path.
- New `/api/platform/account` POST boundary delegates to actual Prisma services
  in `lib/platform/accounts.ts`. It validates trusted origin and JSON/body/input
  bounds, applies persistent global/IP/subject limits, and returns no raw grants,
  password hashes or authentication contacts. Session token is issued only in an
  HttpOnly SameSite cookie.
- Existing scrypt hashes remain usable. New hashes use Node scrypt N=131072,
  r=8,p=1 with explicit 160MiB maxmem. Existing 8..128 UTF-16 character limits
  remain, including Unicode. Login input is bounded before expensive work.
- Credential version and user row locks serialize session issuance, password
  changes and grant consumption. Successful change/reset increments version,
  invalidates all prior sessions and outstanding grants, and requires login.
  Wrong passwords and merely requesting recovery do not revoke access.
- Separate RESET_PASSWORD and VERIFY_EMAIL grants: 256-bit random token, SHA-256
  stored representation, 30-minute expiry, atomic single consumption. Reset does
  not silently count as email verification. Existing emailVerifiedAt is NULL.
- Local-only file delivery sink is verified; production mode rejects that sink.
  Real delivery has no enabled adapter yet and remains blocked. This is distinct
  from working waitlist marketing integration.
- Recovery links use URL fragments, which are not sent in HTTP requests. The
  client clears the fragment; only explicit POST consumes it. Recovery responses
  are no-store/no-referrer/noindex, and recovery paths are excluded from general
  analytics. No public debug mailbox or token-returning endpoint exists.
- Feed/search/public-profile queries now explicitly select public profile fields;
  the session read projection excludes login email/passwordHash. Existing public
  content and signed-in introduction behavior are preserved.
- Account forms have persistent labels and useful errors. Broader navigation,
  search-category, policy and church changes remain deferred.

A concrete Next Server Action denial-of-service advisory prompted a patch from
15.5.12 to 15.5.21 and matching eslint-config-next. No Prisma major upgrade or
framework replacement. See release documentation for primary sources and remaining
dependency audit limitations.

Final local evidence: 18 service/HTTP checks passed on patched Next, along with
lint, production compilation, fresh migrations, synthetic upgrade and synthetic
backup/restore. Account pages received a limited desktop/mobile visual spot-check;
complete device/accessibility testing and external email remain unverified.
See QA_REPORT.md for exact scope and RELEASE_READINESS.md before any release.
