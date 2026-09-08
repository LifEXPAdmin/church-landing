# Current progress

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
