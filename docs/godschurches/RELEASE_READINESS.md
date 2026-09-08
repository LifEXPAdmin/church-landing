# Godschurches release readiness

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

### Release and recovery constraints

Keep real intake off until an actual adult verified responder, separate explicit
RESPOND grant, restricted provisioning record and approved ordinary-support-v1 notice
are established. Confirm controller/contact/jurisdiction, actual processing purpose,
retention/backup expiry, processor/rights information and independent concern routing.
SUPPORT_POLICY_REVIEW.md contains prepared notice substance, not legal approval.

Backup encryption SHA256: a589432185987bb7c9a350a6b00f8555e82292613befb85381e03f5a936e2d09. Encryption key is separately held under
owner-only Godschurches application support storage, not Git or reports. The protected
restored cluster is stopped. No plaintext dump was retained after encrypted-restore
verification. One support-only additive migration, 20260909010000_ordinary_support,
adds tables, constraints and generation/immutability triggers; no old SQL was rewritten.

Use a forward fix whenever possible. Never blindly deploy old main without scrypt-v2,
credentialVersion and current grant/share revocation semantics. Disable new intake
first for a support incident. A database restore must reconcile current credential
revocations, membership/appointments, shares, receipts and approved redactions before
reopening private access. Redaction affects active content, not all older backups or
past views. Existing Stage2B code does not maintain the new support revocation hooks;
an unreviewed downgrade followed by re-upgrade is not a safe access-control rollback.
No real-data deletion, restore-over-production or mass credential reset was performed.

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


## Current release gate (September 7, 2026 local)

**Not authorized for deployment or a real private-church pilot.** The current
branch `codex/church-portal` builds on `9b6a5a0`, retaining `f027758` and `e8b370c`.
Local implementation commit: `9e927f6`. All 42 automated checks and migration,
restore/build checks pass; browser/mobile/keyboard review remains blocked.
Stage 2B adds church connections, optional private directory, named contacts and
scoped authority in isolated fictional data. Nothing was pushed/merged/deployed;
no production data/settings were read or changed. Actual production SHA and the
live account security state are unverified. See QA_REPORT.md for final test results
and outstanding browser checks, rather than interpreting this as launch approval.

### Local implementation and migration

The additive `20260908032000_church_portal` migration adds eligibility/suspension
fields and church/connection/preferences/capability/contact/audit tables. It does
not rewrite original or scrypt-v2 passwords, retroactively verify/age-acknowledge
accounts, infer affiliation from categories/follows, delete public content, or
appoint real people. The SQL includes the combined PENDING/APPROVED partial unique
index and contact/version checks; do not replace it with separate state indexes
or regenerate away the custom constraints. Earlier migrations are unchanged.

`npm run test:portal` exercises real services and HTTP boundaries in a newly
created loopback PostgreSQL cluster, with prior-schema fixtures, actual Stage 2A
upgrade, fresh migrations and synthetic dump/restore of rows plus constraints.
`npm run preview:portal` leaves that environment running after successful checks.
These results are not a production backup/restore rehearsal. Test output and
fictional credentials stay under ignored `.account-test/` and are never exported.

Private portal pages fail closed outside the production renderer: the installed
Next development Flight debugging stream was observed serializing awaited cookie
values. The runner separately checks that guard, then serves the real portal from
`next start` over loopback HTTPS with an ephemeral certificate and disabled sender.
Its separate test process verifies fictional identities through the guarded local
sink; the production server itself cannot deliver those messages. No global TLS
bypass, system trust change, production delivery exception or filtered privacy
assertion is used. Other development pages have not been certified private; use
only fictional data in all development renderers.

### Unresolved release requirements

1. Decide the immediate account-release path. The small claim correction
   `f027758` remains independently reviewable and requires no new schema/env.
   It fixes only the old unverified claim path. A compatible full account/church
   rollout is a separate, larger decision; do not silently postpone the account
   defect while adding features, or publish either option without authorization.
2. Review the remaining dependency advisory **GHSA-ggr8-5vv4-36mx /
   CVE-2026-40345**, `deepmerge-ts@7.1.5` via Prisma 6 config. Full and production
   audits show three affected package entries for this one advisory. Fixed major 8
   is outside Prisma 6's exact dependency pin; no unsupported override was used.
   Recommend a maintainer-compatible patch or a separately scoped, tested Prisma
   config/toolchain migration before accepting a production exception. Build-time
   reachability limits are not proof of safety. See DEPENDENCY_REVIEW.md.
3. Keep real delivery disabled. No sender, domain, API key or MailerLite group
   enables recovery. A reviewed transactional adapter, queue/timing/abuse handling,
   safe notifications and actual inbox end-to-end checks remain outstanding.
4. Verify real operator identity/authority, actual church authorization and named
   appointment/audience consent. The fixture bootstrap is loopback-only and must
   never be used with real data. CHURCH/BUILDER, marketing Basic Auth and contact
   cards are not provisioning mechanisms. Review privileged reauthentication and
   second-factor requirements before real operator appointments.
5. Establish a genuine independent concern route and coverage. Published direct
   email to Andrew remains available but is not independent escalation. No real
   backup, staff, availability, appointment or response promise was invented.
6. Complete independent qualified security/privacy review, browser/device/keyboard
   and screen-reader/accessibility checks, actual policy/operator/entity/jurisdiction
   facts, consent/retention/deletion decisions and adult-pilot conditions. Adult
   acknowledgment is not proof of age. Existing public policies remain drafts for
   this expanded private scope; no legal adequacy is claimed.
7. Verify the intended runtime (Sharp requires Node>=20.9), exact target database,
   deployed SHA, safe secrets, backups and restoration access, platform response
   headers and excluded analytics. Load/pagination review is needed beyond the
   small pilot: portal transactions use a global advisory gate and lists cap at 100.

### Rollback limitations

Old main cannot verify new scrypt-v2 passwords or enforce credentialVersion.
Do not blindly roll back there, downgrade hashes, revive sessions or restore old
grants. Prefer a reviewed forward fix. A UI-only rollback must retain compatible
Stage 2A account code/schema and the new revocation behavior where applicable.
Do not drop portal tables or restore a stale backup to undo a page change: that
could lose consent withdrawals, transitions and permission revocations. Any real
restore needs a new recovery/credential and privacy reconciliation plan.

For any separately approved release, first verify the target and protected backup,
then apply compatible additive migrations with the existing wrapper and deploy
the reviewed commit; verify the actual deployment and auth/private responses.
No command or checklist here authorizes execution against production.

### Next stage

Andrew reviews this local portal and outstanding QA first. A separately authorized
ordinary support-case slice can follow. Its private participants, owner/state
history and concern routing must not borrow authority from a contact title.
Calendar, broad social/search-category changes and final policy publishing are
deferred. Production deployment remains a separate instruction.

## Historical Stage 2A release evidence

September 7, 2026 local. Stage 2A local implementation; no deployment authorization.
Branch: codex/account-security, baseline main 68b4190. Production commit still
unverified. Do not say these changes protect godschurches.com yet.
Implementation commits: f027758 (standalone claim correction) and e8b370c
(full account foundation). Both remain local and unpushed.

## Reviewable release choices

1. Immediate legacy-claim correction: local commit f027758 changes the previous
   registration action, login guidance and README. No new environment variable or
   migration is needed for that standalone patch. It closes the unauthenticated
   email/username claim path only, not the other account gaps. It has not been
   deployed; deployment would require Andrew's separate approval and verification.
2. Full stage 2A account foundation: new services/API/forms/migration and tests.
   Production email recovery remains explicitly unavailable. This can be reviewed
   as code with that limitation, but is not a completed real recovery rollout.

## Actual changed modules

- `lib/platform/accounts.ts`: insert-only registration, login credential snapshot,
  locked session issuance, password changes, purpose-bound grants and revocation.
- `lib/platform/auth.ts`, `session.ts`, `public-profile.ts`: compatible scrypt,
  explicit session verification/projection, public field selection.
- `lib/platform/account-boundary.ts`, `account-config.ts`, `account-limits.ts`,
  `account-delivery.ts`: trusted-origin POST handling, safe results, persistent
  budgets, disabled real sender/local-only file sink.
- `app/api/platform/account/route.ts`; existing auth code removed from
  `app/platform/actions.ts`. Existing logout/social actions retained.
- `components/platform/account-form.tsx`, `recovery-form.tsx`;
  `app/platform/login/page.tsx`, `settings/page.tsx`, `account/recover/page.tsx`.
- Existing feed/profile/search reads and post-card types: public projection only;
  no search expansion or social visibility change.
- `next.config.ts`, analytics tracker/API: no-store/no-referrer recovery responses,
  no recovery tracking. `lib/prisma.ts`: SQL error logging disabled to avoid
  automatic credential/contact parameter disclosure.
- `prisma/schema.prisma` and
  `prisma/migrations/20260907180000_account_security/migration.sql`.
- `tests/*`, `scripts/test-account-security.mjs`, package scripts/lock, README,
  ignored `.account-test/` fixtures; handoff documents.

## Safe configuration

Existing DATABASE_URL and DIRECT_URL must reference the deliberately selected
release database; do not copy local fixture settings into Vercel. This stage did
not read or modify live data, production environment settings or real account rows.

ACCOUNT_ORIGIN is an exact trusted origin, HTTPS in production, without path,
credentials or query. NEXT_PUBLIC_SITE_URL is the fallback for normal access.
AUTH_RATE_LIMIT_SECRET is a server-only cryptographically generated secret of at
least 32 characters, not the literal words "random string". Do not paste it into
chat or commit it. A later authorized configuration step should generate and set
it directly through a secure environment mechanism.

Keep ACCOUNT_DELIVERY_MODE=disabled in production. Only disabled and test-sink are
implemented. ACCOUNT_TEST_ISOLATED and ACCOUNT_TEST_SINK_DIR are local test-runner
settings, never a production email solution. The sink rejects production NODE_ENV,
VERCEL deployments, non-loopback origins/databases and non-test database names.
No Resend or MailerLite credential enables account recovery in this code.

Outside Vercel the request limiter deliberately uses a shared network bucket
rather than trusting arbitrary forwarded headers. Supporting another production
proxy requires a reviewed trusted client-IP adapter. The current initial budgets
are global 120/minute, network 30/15 minutes, subject 10/15 minutes and recovery
request subject 3/15 minutes. A real sender needs queueing, timing and volume review.

## Synthetic review

Run `npm run test:accounts` in the project directory. The runner creates a new
loopback PostgreSQL cluster on a free port, not a connection copied from .env.
It applies prior migrations, creates only synthetic identities/content, applies
the additive account migration, executes real Prisma service and Next HTTP checks,
restores a pg_dump into a separate synthetic database, compares row-content hashes,
and checks a completely fresh `npm run prisma:deploy` plus production compilation.
The cluster and Next server stop afterward. The isolated Next runtime uses
NODE_ENV=development so local sink tests are possible; production-mode compilation
and sink-rejection configuration tests are separate evidence.

`npm run preview:accounts` runs the same checks and leaves a loopback preview running
until Ctrl+C. Use the printed local `/platform/login` URL and fictional details.
Register, sign in, open Settings, and change password; all devices should need login.
Use Account recovery to request a test link. The generated JSON delivery records
are in `.account-test/run-*/sink/`, not an HTTP-accessible mailbox. A copied test
link opens a confirmation form; merely opening it changes no account. Raw grants
are not printed in reports. Never put real member records in this environment.

Final run passed 18 checks (12 service, 6 HTTP), lint, production compilation,
synthetic prior-schema upgrade, fresh migration and synthetic backup/restore.
Limited desktop/390x844 account-page visual and recovery-link spot-checks also
passed; this is not a full browser accessibility or device-matrix review.

Node 25.9.0 and local Homebrew PostgreSQL 16 were used. Test runner requires native
TypeScript stripping/module hooks (Node 22.15+; older 22 releases may need the
experimental-strip-types flag). No new test framework was installed.

## Migration and recovery

The migration adds credentialVersion default 0 to users/sessions, nullable
emailVerifiedAt, PlatformAccountGrant and PlatformAuthLimit. It does not mark any
address verified, delete users, alter IDs/content, or replace old password hashes.
Old sessions start at version 0 and remain subject to expiry until password reset,
change or logout. No mass real-user/session update was performed.

For a separately approved release: first verify the actual target and rollback
plan, verify a current protected backup and restore access, apply this additive
migration with the existing Prisma deployment wrapper, then deploy compatible code
and verify the real deployed SHA and auth routes. No commands here authorize that
operation. Do not run migrate reset or destructive down migrations.

Full rollback caveat: old code cannot verify new scrypt-v2 hashes and does not
check credentialVersion. Once new hashes/sessions have been written, rolling back
to f027758 or main would break login or weaken session boundaries. Prefer a forward
fix, or prepare a compatibility backport that retains scrypt-v2 and version checks.
Do not undo password resets by restoring old credentials. A real restore that can
resurrect credentials/sessions/grants requires an explicitly approved invalidation
and recovery procedure before reopening access. Synthetic restore verified row
integrity, not an authorized production recovery procedure.

## Remaining release limits

- No real sender, real receipt, delivery timing/queue, post-reset notification,
  provider logs/redaction or external recovery verification was tested. Recovery
  must stay disabled until these are implemented and independently checked.
- No production SHA/configuration, deployment, real-account migration or production
  backup retention/restore was inspected or changed.
- Only a limited account-page desktop/mobile visual spot-check was performed.
  Full browser lifecycle, keyboard and screen-reader testing remain outstanding.
  Existing broad navigation/search/policy problems remain out of this slice.
- All tests use fictional records, not a live exploit or affected-account census.
- A dependency audit still reports high transitive advisories in build/Prisma and
  image/CSS dependencies. Next's direct Server Action advisory was patched; a clean
  overall audit is not claimed. Review actual reachability and compatible updates
  before release rather than running a blanket force upgrade.
- Independent security/privacy review and the larger brief's real-data/operator
  conditions remain required. Church/directory/support/age features remain deferred.

## Guidance consulted

- [OWASP recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): one-use expiring grants, uniform responses, no implicit session after reset.
- [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): reauthentication and session revocation considerations.
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): scrypt resource settings and compatible upgrades.
- [Node crypto](https://nodejs.org/api/crypto.html): built-in scrypt, secure randomness and constant-time comparison primitives.
- [Next data security](https://nextjs.org/docs/app/guides/data-security): authorize server boundaries and minimize returned data; installed action-handler was also inspected for Origin/Host checks.
- [Next official advisory](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj): installed App Router/Server Actions affected below 15.5.21; supported patch applied with matching ESLint config.

Prisma transaction web documentation and the versioned Next 15 URL were unavailable
through the web tool; transaction behavior was exercised on the installed Prisma
6.19.2 against disposable PostgreSQL instead of inferred from that unavailable page.
