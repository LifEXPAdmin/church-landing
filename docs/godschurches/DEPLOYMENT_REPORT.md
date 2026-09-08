# Godschurches deployment report

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

### Target, migration and live links

Same GitHub LifEXPAdmin/church-landing, main; same Vercel church-landing project
prj_dvPQhou6hzYuJoOfy5Fbdhff7HjE, team andrew-mccuens-projects, Node24.x. Preserve
existing normal Git deployment integration, branch rules, domain and secure settings.
No new project, wildcard origin, credential exposure or paid service. The unrelated
pre-existing church-landing-81hk project is not the canonical target and was not edited.

Normal non-forced fast-forward publication retains both 7679e03 and 044e27a. Canonical alias and source verified using provider deployment/alias APIs and normal HTTPS. 39 live HTTP checks and 36 browser groups passed, no support/demo writes or real-user session. Source SHA 9177e86d8fde78db8ff5a50c7e8633b46900dc32. Later local report-only successor records this result without changing that published application SHA.

| URL | Availability |
| --- | --- |
| https://godschurches.com/ | Existing landing/waitlist preserved; no live signup/email test. |
| https://godschurches.com/platform | Real platform/feed, early-preview data is saved; not a fictional demo account. |
| https://godschurches.com/platform/help | Public help/direct contact and links to private requests. |
| https://godschurches.com/platform/help/new | Sign-in/adult eligibility; new intake remains unavailable with direct contact. |
| https://godschurches.com/platform/help/requests | Sign-in, only own authorized requests/history. |
| https://godschurches.com/platform/help/inbox | Current explicit RESPOND and assigned work; no real owner provisioned. |
| https://godschurches.com/platform/help/routing | Explicit ASSIGN, unassigned minimal metadata only. |
| https://godschurches.com/platform/demo | Public fixture-only read-only tour; 11 total views including overview. |
| https://godschurches.com/platform/demo/support-requests | Fictional statuses, next steps and unavailable example. |
| https://godschurches.com/platform/demo/support-case | Fictional private conversation, resolution/reopen and audience. |
| https://godschurches.com/platform/demo/support-inbox | Fictional assigned inbox, feature decision and minimal routing example. |

No real support-case identifier, church membership or authorized owner login was
invented for live verification. Signed-out private HTML/RSC goes to sign-in; direct
support API requires session; foreign-origin writes are denied. Demo browser checks
make no API calls/mutations or session and stay out of sitemap with noindex. Live
verification does not replace the isolated authenticated/concurrency suite. Normal
TLS is verified; www remains unconfigured, and no www redirect is claimed.
### Release and recovery constraints

Provider runtime-error query for this deployment from 2026-09-08T22:45:25Z through
the 22:47 UTC live-check window returned zero rows (limit100). This is a bounded
post-deployment check, not continuous monitoring or proof of future error-free use.

Current report files in this workspace:

- /Users/awmccuen/Documents/New project/docs/godschurches/CURRENT_STATE.md
- /Users/awmccuen/Documents/New project/docs/godschurches/BUILD_PLAN.md
- /Users/awmccuen/Documents/New project/docs/godschurches/DECISIONS.md
- /Users/awmccuen/Documents/New project/docs/godschurches/PROGRESS.md
- /Users/awmccuen/Documents/New project/docs/godschurches/QA_REPORT.md
- /Users/awmccuen/Documents/New project/docs/godschurches/RELEASE_READINESS.md
- /Users/awmccuen/Documents/New project/docs/godschurches/DEPENDENCY_REVIEW.md
- /Users/awmccuen/Documents/New project/docs/godschurches/DEPLOYMENT_REPORT.md
- /Users/awmccuen/Documents/New project/docs/godschurches/SUPPORT_OPERATIONS.md
- /Users/awmccuen/Documents/New project/docs/godschurches/SUPPORT_POLICY_REVIEW.md

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
### Stage 2C dependency disposition

The graph and lockfile are unchanged: Next15.5.25, Prisma/Client6.19.3 and Node24.
Fresh npm audit --json: three high package entries, zero critical; the same one distinct
GHSA-ggr8-5vv4-36mx via prisma -> @prisma/config -> deepmerge-ts7.1.5. Carry the dated
bounded tooling exception below; this is not a patched/universally-safe dependency claim.
No forced deepmerge-ts8 override, Prisma major upgrade or historical advisory reinvestigation.

Final local support candidate build: 48 .nft.json traces, 3605 entries, 112 server JS
files. Committed guard passes, requires the new support API trace and rejects Prisma
CLI, @prisma/config, c12/deepmerge-ts request imports and config-loader call markers.
Actual Vercel Linux trace result: 48 traces, 3478 entries, 112 server JS files; no Prisma configuration-loader path.. Provider account/portal/support resource checks: Node24, 2048MiB; account/portal/support APIs 60 seconds, support page renderers 300 seconds (provider default)..
Tooling importing untrusted executable config remains affected. Do not expose config
loading from an HTTP route. A graph/config/import change reopens the disposition;
independent qualified review remains a real-pilot dependency.

<!-- STAGE_2C_CURRENT_END -->

## Earlier dated records (historical)

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

## Target and publication

- Existing GitHub repository: LifEXPAdmin/church-landing; production branch main.
- Existing Vercel team: andrew-mccuens-projects. Correct project: church-landing,
  prj_dvPQhou6hzYuJoOfy5Fbdhff7HjE. No new site, domain move or paid upgrade.
- Previous main and canonical production SHA: 68b4190f83b6833251dcf1dd664804117ef4c930.
- Normal, non-forced fast-forward push of account+portal ancestry and release fixes.
  No branch protection/rules were changed. Existing Git integration triggered production.
- Application commit: 7679e034b93e3a905a7bee92ac6f5c377c2ce42d.
- Provider deployment: dpl_GnAHFqqiDBzheEh6j6ohL4G1P21R; READY at 2026-09-08T21:10:07.386Z.
- Canonical godschurches.com alias assigned at 2026-09-08T21:10:07.630Z and
  independently resolved through the provider alias API to that same deployment.
- Canonical HTTPS passed normal TLS validation. HTTP redirects to HTTPS.
  www.godschurches.com is not configured and resolves NXDOMAIN; no www redirect is
  claimed. Account origin stays exactly https://godschurches.com, not wildcard hosts.
- A separate pre-existing church-landing-81hk project also tracks the repository.
  It was not used as the release target or modified. Its deployments do not establish
  what godschurches.com serves.
- Public demo and the real application are hosted on Vercel, independent of the Mac.

## Live routes and prerequisites

| URL | Actual availability |
| --- | --- |
| https://godschurches.com/ | Existing landing/waitlist site preserved. No live waitlist submission/email test performed. |
| https://godschurches.com/platform | Actual public platform/feed plus restrained demo link. |
| https://godschurches.com/platform/demo | Static fictional overview, no login; eight views, no database/session/API writes. |
| https://godschurches.com/platform/demo/member | Fictional approved member home. |
| https://godschurches.com/platform/demo/pending | Fictional pending request. |
| https://godschurches.com/platform/demo/approved | Fictional approved connection. |
| https://godschurches.com/platform/demo/review | Fictional reviewer queue; action controls disabled. |
| https://godschurches.com/platform/demo/sharing | Fictional optional directory/contact choices. |
| https://godschurches.com/platform/demo/directory | Fictional consent-based member directory. |
| https://godschurches.com/platform/demo/contacts | Fictional named contacts; example.com text, no sending controls. |
| https://godschurches.com/platform/login | Real sign-in and registration; older passwordless accounts cannot be claimed by registering again. |
| https://godschurches.com/platform/settings | Real account/password settings; sign-in required. |
| https://godschurches.com/platform/account/recover | Truthful unavailable message, no recovery/verification submission form. |
| https://godschurches.com/platform/churches | Real church discovery. No real churches provisioned by this release. |
| https://godschurches.com/platform/my-church | Sign-in; real eligibility/connection status and approved directory entry point. |
| https://godschurches.com/platform/my-church/sharing | Sign-in and applicable approved eligibility; optional consent, private-by-default contact fields. |
| https://godschurches.com/platform/help | Public help contact; church-only contacts require approved eligible membership. |
| https://godschurches.com/platform/operator/churches | Explicit assigned operator/coordinator capability; no role inferred from a name or marketing category. |

The genuine church-specific directory route is
`/platform/churches/{actualChurchId}/directory`, linked from My church after approval.
The genuine review route is `/platform/churches/{actualChurchId}/review`, requiring
that church's assigned reviewer capability. No real church exists yet, so there is
no legitimate concrete directory/reviewer URL to invent. Demo paths are not those
private routes and grant no authority. Private route and API denial were verified.

## Production configuration and data

- Existing Neon PostgreSQL17 database retained. No localhost, fixture database,
  dev seed or alternate convenience database was substituted.
- Reviewed production history: five completed migration checksums matched repository
  SQL; no failed/rolled-back entries. Two additive migrations applied using the
  committed prisma:deploy wrapper at 2026-09-08T21:06:25.061Z; seven now complete.
- Added account security first, then portal. Existing credential/version defaults
  remain compatible during migration ordering. No previous migration SQL rewritten.
- New Church/PlatformOperatorGrant tables have no fixture/appointment records;
  emailVerifiedAt was not backfilled. Combined pending-or-approved unique index exists.
- Canonical ACCOUNT_ORIGIN and NEXT_PUBLIC_SITE_URL verified. Server-only rate-limit
  secret generated directly into sensitive production config; never published.
- ACCOUNT_DELIVERY_MODE=disabled; no production test-sink flags. Session cookie source
  retains Secure, HttpOnly, SameSite=Lax and scoped lifetime for this HTTPS origin.
  No live successful login or owner cookie was fabricated to demonstrate cookie flags.
- DIRECT_URL securely uses the existing verified unpooled production connection.
  The deployment wrapper also recognizes DATABASE_URL_UNPOOLED. Provider build ran
  migrations idempotently with no pending migrations, then built and ran trace guards.
- Known placeholder waitlist Basic Auth password was replaced securely. A mode600
  local owner copy is outside the repository; no password is in this report. This is
  separate from platform login, which was not reset or changed. Unauthenticated admin
  access returned401. MailerLite/marketing settings were not used to send email.

## Protected backup and recovery

Backup ID: release-2026-09-08T20-41-58-457Z.
Completed: 2026-09-08T20:42:03.850Z (15:42:03 CDT).
Encrypted artifact SHA256: 7e2adb8d3c65bea1d00c54e32c0c67f05238a134cb348ad6e5779c99c086a249.

The real pg_dump custom-format backup is encrypted with AES256/PBKDF2 and kept in
owner-only storage outside Git, with its key stored separately. Raw temporary dumps
were removed. Restore was actually decrypted, integrity-checked and pg_restored into
a private, loopback-only PostgreSQL17 instance; it was never served as an application.
The five migration records and original tables were verified. Both new migrations
then ran against that restored copy, preserving original-field fingerprints for all
eight prior tables. Rehearsal instances were stopped. Production TLS client validation
used verify-full; Neon proxy's internal pg_stat_ssl observation is not the client link.

Recovery procedure is stored privately beside the encrypted artifact: locate by the
ID above, decrypt with the separately held key into owner-only storage, restore first
into an isolated database and verify migration/account/consent state before any cutover.
A backup restore is not routine code rollback. Old main cannot verify scrypt-v2 or
honor credentialVersion. Prefer a compatible forward fix retaining account and portal
security. Do not restore old credentials, revoked sessions, withdrawn consent or stale
grants to recover a page deployment, and do not drop the additive schema automatically.
Recovery requires reconciliation with any changes after the snapshot. This one local
protected artifact is not an offsite backup/retention service or durability SLA.

## Verification performed

- Node24.20.0 final isolated runner: account service12, account HTTP6, portal service17,
  portal HTTP9, all44 passed. Includes origin, atomic grants, legacy/new hashes,
  credential invalidation, eligibility, cross-church denial, revocation, consent,
  concurrent transitions, missing-reviewer setup guard, and demo HTML/RSC privacy.
- Five demo fixture/static contract checks passed. No sessions, live DB imports, mutation
  calls or real member data in demo. Disabled controls are illustrations, not successes.
- ESLint, TypeScript, production build, fresh and upgrade migrations, synthetic backup
  restore and real encrypted backup/upgrade rehearsal passed after meaningful changes.
- Headless Chromium141 local HTTPS:13groups passed. Actual request/withdraw/approve/
  leave/re-request, optional contact consent, directory/contact/reviewer navigation,
  cross-church denial and password change/relogin were exercised with fictional actors.
  Desktop plus390px/320px, labels, overflow and18keyboard stops checked. The320px
  bottom-nav obstruction was repaired and retested against compiled CSS.
- Local final build:42NFT traces/3184entries/97serverJSfiles. Actual Linux Vercel build:
  42traces/3063entries/97serverJSfiles; committed trace guard passed at21:09:55UTC.
- Actual provider account/portal function outputs:nodejs24.x/2048MiB/60seconds. Scrypt-v2
  strength unchanged; local four-way benchmark used587MiB peak RSS and313ms, not a
  production load test. Runtime thread pool configured to4.
- Live smoke completed 2026-09-08T21:13:32.768Z:28HTTP checks and27browser checks at1440px,
  390px,320px, normal HTTPS validation and fresh signed-out contexts. All eight demo
  URLs, login/recovery/help and private-page login redirects checked. Zero page errors,
  demo API/mutation attempts or created session cookies. Demo excluded from sitemap.
- Private API denied signed-out access401; forged-origin account/portal requests403;
  nonexistent-login handling returned generic400 credential mismatch without a session.
  Two such attempts were made; the first probe used the wrong expected status, then
  the assertion was corrected to the application's existing400 contract.
- Next streamed private-page redirects returned200with exact login refresh metadata
  (settings307); real browser navigation reached login with no private content. An
  initial smoke assertion expecting only307 was corrected, not treated as an auth bug.
- Minimal login probes affected only expiring limiter state, not accounts/posts/church
  records. No registration, real password change, posting, invitation or email sent live.
- Provider error-level runtime log query for this exact deployment over the smoke window
  returned zero rows. This is a bounded log check, not permanent monitoring.
- Captured live demo320overview and1440contacts screenshots were visually inspected.

Private evidence remains ignored under .account-test/release and the isolated runner
folders. No real roster, raw errors with credentials, full env file, cookies or backup
contents are committed. Unrelated docs/ai-assisted-investing-workflow.md was untouched.

## Limits and prerequisites

Independent qualified security/privacy review remains outstanding. This agent's
review, subagent review and tests are not independent approval. Safari/physical phones,
screen readers, exhaustive WCAG testing and production load/concurrency were not tested.
The actual owner-authenticated live workflow was not checked; no authorized owner
session was available to this release process, and none was impersonated or extracted.
Comprehensive mutation tests used only isolated fixtures.

The deepmerge-ts tooling advisory remains installed:three high package entries/one
GHSA-ggr8-5vv4-36mx. Actual source and local/Linux trace evidence substantiate the bounded
HTTP non-reachability disposition; no package-wide safety or clean audit is claimed.
Untrusted executable Prisma config/CLI must remain unavailable. A supported toolchain
update and independent review remain necessary; see DEPENDENCY_REVIEW.md.

Real email verification/recovery is deliberately unavailable until a reviewed delivery
adapter and actual inbox tests exist. A MailerLite key/group does not enable account
recovery. Existing password accounts can sign in; older passwordless accounts cannot
be reclaimed through unverified registration. No fabricated verification was used.

For one-time owner setup: Andrew should sign in through /platform/login with his
existing password, never send it in chat. If the account is passwordless, wait for
verified recovery; do not claim it by re-registering. Before privilege provisioning,
confirm the server-side account ID through authenticated ownership evidence and an
independent identity/authority check, then use an audited narrowly scoped operator
appointment. No established production bootstrap for a real owner exists in this
slice; the synthetic fixture bootstrap is not a substitute. Do not grant by matching
public name/email or marketing Basic Auth. Verified address/adult eligibility, actual
church authorization and scoped reviewer/contact appointments must precede a pilot.

Policy/entity/retention/deletion, directory consent, genuine independent concern routing,
privileged reauthentication/second-factor review and real contacts/coverage remain pilot
gates. Demo names and roles are fictional, not staff claims. Missing prerequisites
produce setup/denial messages rather than false requests, empty success or a crash.

## Next stage, not started

Recommend the ordinary private support-case slice after review of this release, while
keeping delivery/operator/pilot prerequisites separately tracked. No case system,
member onboarding or other feature stage was begun by this release task.
