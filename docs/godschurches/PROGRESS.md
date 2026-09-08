# Current progress

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
