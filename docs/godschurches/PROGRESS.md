# Current progress

<!-- STAGE_2C_CURRENT_BEGIN -->
## Stage 2C current status (September 8, 2026)

**Implementation and isolated verification complete; publication in progress.** This section is the current Stage 2C release candidate, not a claim that the older live deployment already contains support.

Baseline canonical application: 7679e034b93e3a905a7bee92ac6f5c377c2ce42d, READY. This branch continues its local report successor 044e27a without resetting either history. Exact candidate/provider evidence will be recorded after publication.

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
fictional actors, not production accounts. Non-destructive live verification follows the deployment; no authenticated production journey is claimed.

Fresh protected real backup release-2026-09-08T22-39-07-914Z was restored from the encrypted artifact
using PostgreSQL17. Its exact candidate migration rehearsal preserved all 17 existing
tables' full-field fingerprints. One reviewed additive support migration is ready; seven existing migrations are unchanged. Production migration has not yet been claimed complete.

See SUPPORT_OPERATIONS.md for the authorization/transition/provisioning and redaction
contract, SUPPORT_POLICY_REVIEW.md for concrete unapproved notice facts, and the current
QA/deployment sections here for limitations. Earlier dated sections below are historical
and do not override this explicit build-and-publish instruction or the current result.
Stop after 2C. Recommended next bounded stage: real verification/recovery delivery,
verified operator/church provisioning and operational/policy approval, not more demos.

### Reproducible Stage 2C evidence

Final isolated run: .account-test/run-20aOnO (ignored private fixture evidence, no public
credentials). Run npm run test:support for a fresh disposable database or npm run
preview:support for the production-mode loopback HTTPS preview. Set QA_PREVIEW_DIR to
that generated directory for scripts/qa-support-browser.mjs and qa-portal-browser.mjs.
These scripts require the existing local Playwright/Chromium installation and pin only
the generated local certificate; no global TLS bypass or system trust change.

- 12 account service + 6 account HTTP tests retained; 17 portal service + 9 portal
  production HTTPS tests retained; 17 new support service + 6 new support HTTP tests.
- Create/retry/concurrent duplicate prevention, disclosure/consent, unverified-email
  account-support exception, pending context, bounded input and durable throttles.
- Same/wrong-church, guessed ID, forged fields/grants and routing-manager content denials;
  hidden login/contact/session values absent from private HTML/RSC and generic errors.
- Lifecycle/reply/waiting/resolution/reopen, separate feature decision, per-user seen
  markers, stale updates, immutable church/category/requester and owner pair constraints.
- Explicit sharing, immediate revoke in existing coordinator session, appointment and
  membership removal/rejoin, owner handoff/capability loss, revoke/renew generation even
  without an intervening read, suspension, race winners, restricted privacy redaction.
- Intake-off and missing/changed actual recipient do not create a fake received receipt.
  Unassigned reopen cannot silently hand history to a newly configured default owner.
- Production-renderer guards remain on new private pages. Analytics rejects support
  paths; demo responses are fixture-only/no-form/noindex with no API/auth state.
- Actual seven-migration schema upgrade and fresh eight-migration setup; full synthetic
  restore includes support rows, relationships, checks and custom triggers. Earlier
  applied SQL remains unchanged. Real encrypted restore rehearsal is separate evidence.

Browser support groups: mobile create/disclosure; desktop assigned owner waiting update;
requester reply; share/revoke; resolve/reopen; narrow routing denial; 320px labeled keyboard
form; three read-only support demos. Existing 13 groups cover all 11 demo URLs at three
widths, church requests/review/sharing/contacts, account/password/session regression,
operator narrow layouts and keyboard. Initial failures led to fresh-document support
navigation and consistent demo headings; final reruns, not partial attempts, are reported.
No physical-device, full screen-reader, independent security review or live load test.

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


## Stage 2B review checkpoint (September 7, 2026, 23:04 CDT)

Implementation saved locally as **`9e927f6`** on **`codex/church-portal`**.
It continues `9b6a5a0`, preserving `f027758` (independent claim fix) and
`e8b370c` (full account foundation). No push, merge, Vercel action, production
read/migration, real email, member invitation or paid service occurred. The actual
production SHA remains unverified. The live website is unchanged by this work.

Implemented: reusable churches, scoped capabilities, eligibility/suspension,
request/review/withdraw/decline/leave/remove/re-request, one combined pending or
approved relationship, optional same-church directory and owner sharing preview,
named contact appointments, direct help, and integrated application navigation.
No ordinary support case system was started. No real Beacon people or appointments.

Final verification: **42 tests passed** (12 account service, 6 account HTTP,
16 portal service, 8 portal HTTP), plus fresh migrations, actual synthetic Stage 2A
upgrade, synthetic row/constraint/index restore, production builds, TypeScript,
ESLint and diff checks. Evidence: `.account-test/stage2b-final-6.log` and
`.account-test/run-MSq1n6/RESULT.txt`. Earlier failed iterations and fixes are
honestly recorded in QA_REPORT.md, including development debug-cookie exposure.

New portal pages refuse private reads outside production. The successful portal
tests use unfiltered raw HTML/RSC from an actual production HTTPS loopback server,
with email disabled. The separate development guard is tested in HTML and RSC;
the original account suite still tests the local sink and rejects production use.
No TLS bypass or system trust changes. The remaining audit finding is
GHSA-ggr8-5vv4-36mx / CVE-2026-40345 in deepmerge-ts 7.1.5 via Prisma 6 config,
reported through three high package entries. No unsupported major override or
clean-audit claim; see DEPENDENCY_REVIEW.md.

**Still blocked:** narrow/desktop visual and keyboard browser rehearsal, because
CUA reported the Mac locked and unable to unlock. Screen-reader/physical-device
checks were not run. HTTP labels/landmarks are verified but do not satisfy those
manual/browser gates. Independent qualified review, actual sender/inbox checks,
real church/operator provisioning, independent concern route, policy/retention
facts and production backup/SHA checks remain real-pilot release requirements.

Preview is running at **https://127.0.0.1:52881/platform/login**, on this Mac only.
Fictional credentials:
`/Users/awmccuen/Documents/New project/.account-test/run-MSq1n6/PREVIEW.md`.
That ignored private file contains no session/grant tokens; no credentials are
copied into committed/exported reports. The certificate is local/self-signed;
README/PREVIEW explain the optional local-browser warning. Frontend recovery is
disabled; supplied fictional accounts were verified through the isolated sink.
The exact two-church walkthrough is in the current QA_REPORT.md section.

Next action: unlock the Mac for the remaining browser/mobile/keyboard review and
review these changes. Stop at Stage 2B. Ordinary support cases are the recommended
next feature slice only after a separate instruction. Independently decide the
small claim-fix/security-release path; church development must not indefinitely
postpone that account decision. Old main is not a safe rollback for scrypt-v2 and
credentialVersion. No deployment is authorized by this checkpoint.

Updated report locations:

- `/Users/awmccuen/Documents/New project/docs/godschurches/CURRENT_STATE.md`
- `/Users/awmccuen/Documents/New project/docs/godschurches/BUILD_PLAN.md`
- `/Users/awmccuen/Documents/New project/docs/godschurches/DECISIONS.md`
- `/Users/awmccuen/Documents/New project/docs/godschurches/PROGRESS.md`
- `/Users/awmccuen/Documents/New project/docs/godschurches/QA_REPORT.md`
- `/Users/awmccuen/Documents/New project/docs/godschurches/RELEASE_READINESS.md`
- `/Users/awmccuen/Documents/New project/docs/godschurches/DEPENDENCY_REVIEW.md`

Code checkpoint 9e927f6 is followed by the local report checkpoint. Unrelated
pre-existing untracked `docs/ai-assisted-investing-workflow.md` remains untouched
and unstaged. Generated fixture DBs, TLS files, sink records and logs remain
ignored under `.account-test/`.

## Earlier Stage 2B implementation checkpoint

Authorized now: local church connections, optional private directory, scoped
capabilities, named contacts and isolated tests. Branch `codex/church-portal`
continues `9b6a5a0`, retaining `f027758` and `e8b370c`. No push/deployment,
production reads/migrations, real email or ordinary support cases authorized.

Baseline rerun: all 18 account checks, fresh migrations, synthetic upgrade/restore
and build passed (`.account-test/stage2b-baseline.log`, run-26tPbO). New portal
schema/services, UI, dependency review and tests are in progress. Existing unrelated
`docs/ai-assisted-investing-workflow.md` is untouched. Collaborating agents have
explicit file ownership for frontend, dependency triage and test harness; their
changes are expected. Product defaults in pasted prompt 2B are now accepted for
this development slice, not real-member consent or church appointments.

Next: finish real portal HTTP/service tests and two-church rehearsal, review
mobile/keyboard behavior, then update all seven reports and stop for review.

Validation checkpoint: portal services and account regressions, fresh/upgrade
migrations, synthetic restore and build passed in intermediate runs. HTTP checks
caught a real development Flight debug-cookie exposure. The portal page now fails
closed before private reads outside production mode; the harness is moving portal
HTML/RSC checks and review preview to a loopback-only HTTPS production build with
real delivery disabled. Do not call the full portal suite passed until that final
run succeeds. Other fixed issues: malformed array transition/audience input,
overbroad operator DTOs, first-request reviewer revocation, and cache-header
configuration. A self-review fixture and explicit-help deny expectation were also
corrected without weakening authorization. Mac locked: CUA browser/mobile/keyboard
checks are blocked, not passed. Current work remains local and uncommitted.

## Historical stage 2A checkpoint

Active authorization: Stage 2A account-security implementation and isolated testing,
from 06_Prompt_2A_Account_Security.txt. No church features, publication, push,
production data access/migration, real email or invitation authorized.
Date: September 7, 2026 local. Branch codex/account-security, based on main
68b4190f83b6833251dcf1dd664804117ef4c930.

Local commit f027758 contains the independently reviewable immediate legacy-claim
correction. Local commit e8b370c contains the full account implementation, additive
migration, dependency patch and test harness. This checkpoint and the five other
handoff files accompany those local commits. No branch was pushed. The deployed
commit remains unverified.

Completed: account claim closure; insert-only duplicate-safe registration;
versioned/locked session issuance and revocation; compatible bounded scrypt;
password changes; purpose-bound recovery and verification with local-only sink;
strict request origin/body limits and persistent abuse budgets; public DTOs;
account form wiring; recovery analytics/referrer protection; additive migration;
Next 15.5.21 supported security patch; synthetic upgrade/restore/fresh setup and
real service/HTTP tests. See QA_REPORT.md for precise evidence and limitations.

Latest verification: all 18 checks passed (12 service, 6 HTTP) on patched Next
15.5.21. Lint, production compilation, fresh migrations, synthetic schema upgrade
and synthetic backup/restore passed. Final command `npm run preview:accounts`,
artifacts `.account-test/run-2LQDUe/`. The logout harness was corrected to use an
actual multipart Server Action form rather than unsupported URL encoding; both
cross-origin session preservation and same-origin logout passed. Limited desktop
and 390x844 account-page visuals/recovery navigation were also checked.

The disposable preview was left running at
http://127.0.0.1:51111/platform/login for local review, not phone/Internet access.
It has only fictional accounts. Its process can be stopped after review; rerunning
`npm run preview:accounts` creates a new isolated cluster and prints a new URL.

Code/config/test changes are committed locally. Stage 1 documents remain with
historical evidence plus dated updates. The unrelated pre-existing untracked
`docs/ai-assisted-investing-workflow.md` remains untouched and must not be staged.
Disposable test DBs/sinks/logs are under ignored `.account-test/`; do not publish them.

Limits: external recovery delivery disabled and untested, nine high transitive
production dependency audit findings remain for release triage, no live SHA or
production restore verified, no complete browser/mobile or independent security review.
Church/directory/support/search expansion/policy and age work remain deferred.

Next exact action: Andrew reviews QA_REPORT.md and RELEASE_READINESS.md and chooses
whether to separately authorize the immediate claim fix or prepare a full account
release after its outstanding limits are addressed. Stage 2A implementation stops
here for review. Do not proceed to church implementation or trigger Vercel.
RELEASE_READINESS.md explains the independent claim-fix option and full-account
migration/rollback caveats. Product defaults for the later slice remain proposals.

Historical stage 1: inspected source and full brief, mapped OBS-01..13, passed lint
and dummy-target build, saved CURRENT_STATE/BUILD_PLAN/DECISIONS/QA_REPORT/PROGRESS.
That inspection made no product changes; it is not runtime account evidence.
