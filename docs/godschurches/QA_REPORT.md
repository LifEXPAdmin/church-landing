# Stage 2B QA report

<!-- RELEASE_STATUS_BEGIN -->
## Authorized release in progress (September 8, 2026)

The current user explicitly authorized publishing the completed account and church portal
update to the existing https://godschurches.com project. This supersedes the earlier
local-only boundary below, not production access controls or real-member pilot gates.
Routine publication is included in future authorized build stages unless Andrew says
otherwise; stop before the next feature stage. No purchases, imports, invitations,
real email, destructive data changes or real church appointments are authorized.

Release scope includes the Stage 2A account foundation and Stage 2B portal together,
a static fixture-only /platform/demo tour, mobile keyboard scroll spacing, a
no-reviewer setup guard, runtime trace checks, and secure production configuration.
Current preflight: GitHub main and existing canonical production both use 68b4190.
The correct Vercel project is church-landing, prj_dvPQhou6hzYuJoOfy5Fbdhff7HjE,
on andrew-mccuens-projects, Node24/Fluid/2048MiB. The five applied migration
checksums match. An encrypted production backup and isolated PostgreSQL17 restore
and upgrade rehearsal passed with all prior field fingerprints preserved.
Final release checks: 44 account/portal tests, five demo fixture checks, type check,
ESLint, production build and runtime trace guard passed. Headless Chromium passed
13 browser groups, including actual desktop, 390px and 320px journeys. The two
reviewed additive migrations were applied to production on September 8, 2026;
seven are now complete. No church fixtures, appointments or verification backfill
were introduced. No live deployment is claimed by this preparation section. Final source SHA,
migration and provider status, URLs, evidence and limitations belong in DEPLOYMENT_REPORT.md.

Real recovery/verification remains disabled. No operator or church is appointed
by this release. The demo grants no permission and accesses no real account or DB.
Independent qualified review, real delivery, actual church authorization, operator
provisioning, policy/retention and independent concern routing remain pilot gates.

<!-- RELEASE_STATUS_END -->


## Current result (September 7, 2026 local)

**Local implementation and automated verification passed; browser/device review
remains blocked. Not a production or pilot-readiness approval.** Branch
`codex/church-portal`, implementation commit `9e927f6`, continues the actual
completed Stage 2A account foundation.
No push, production read/write/migration, real email, invitation or paid service.

Final command: `npm run preview:portal`. Evidence:
`.account-test/stage2b-final-6.log`, `.account-test/run-MSq1n6/RESULT.txt`.
All **42 tests passed**: 12 original account service, 6 original account HTTP,
16 portal service and 8 portal HTTP. Original account test files remain unchanged.
Additional harness assertions passed for upgrade preservation, fresh schema,
synthetic restore and constraints, development privacy guards and verified local
HTTPS readiness. No skipped/cancelled tests in those four suites.

| Check | Final evidence and limits |
|---|---|
| Prisma generate | Passed with client 6.19.3; no production connection |
| ESLint / TypeScript / diff check | Passed. Generated `.account-test/` and nested test-build output are excluded, not source/test files. |
| Account regressions | All 18 passed, including original/new scrypt, old-credential race, grant purpose/single use, revocation and production rejection of the sink. |
| Portal service | All16 passed against actual PostgreSQL, not mocked policy functions. |
| Portal HTTP | All8 passed against actual production Next 15.5.25 over loopback HTTPS. Cookies/hidden fields absent from entire raw HTML/RSC responses. |
| Production compilation | Passed both the initial build and post-development rebuild for HTTPS. |
| Actual Stage 2A upgrade | Raw prior schema contains original and scrypt-v2 accounts, sessions, grants and content. Stage 2B adds schema without modifying prior field/content fingerprints or inventing verification/adult consent. |
| Fresh schema | Existing Prisma deployment wrapper applies all preserved migrations plus Stage 2B to a new empty synthetic database. All expected tables/indexes/checks present and no fixture rows silently created. |
| Synthetic backup/restore | pg_dump/pg_restore compare account/church row-content fingerprints, constraints and indexes in a separate local DB. NOT verified production recovery. |
| Development guard | New portal pages return a static notice before private reads outside production. Actual HTML and text/x-component RSC contain no supplied synthetic cookie. |
| Dependency audit | Three high package entries for one remaining advisory, GHSA-ggr8-5vv4-36mx; not a clean audit. Full inventory/sources in DEPENDENCY_REVIEW.md. |
| Browser/mobile/keyboard | Blocked: CUA reported the Mac locked and automatic unlock unavailable. User was asked to unlock it. No Stage 2B screenshot, narrow/desktop interaction, keyboard journey, zoom or physical-device check is claimed. |
| Screen reader / independent review | Not run. HTTP landmark checks are not a browser accessibility audit or qualified independent security/privacy review. |

Environment: Node 25.9.0, PostgreSQL 16.12, Prisma 6.19.3, Next 15.5.25. Account HTTP
uses a development server with the isolated file sink. That server is stopped;
the production build is regenerated, then a production server runs with real
delivery disabled behind a fixed-loopback HTTPS proxy. Only the test subprocess
trusts the ephemeral local certificate via NODE_EXTRA_CA_CERTS. No system trust
change, global TLS bypass, production sink exception or external mail was used.
The separate fixture process verifies synthetic identities through the actual
guarded local sink and grant-consumption service. The production preview's email
recovery remains truthfully unavailable.

### What the new tests exercise

- Two fictional churches and distinct operators/reviewers/members/coordinators.
  Forged category/grant/identity cannot establish a church or elevate authority.
  Explicit operator DTOs reveal only information needed for each capability.
- Eligibility, suspension, cross-church and guessed identifiers, self-review even
  with a valid scoped grant, first-request preservation of independent reviewer
  authority, invalid shapes, invalid/stale state/version and concurrent requests.
- Both service races and all four DB uniqueness combinations of PENDING/APPROVED.
  Concurrent review has one winner and a conflict, not contradictory success.
  Deterministic decline, withdrawal, leave and removal each require fresh approval
  on re-request. Following/categories never create a church connection.
- Optional name/email/phone sharing and owner-only preview; eligible same-church
  viewing without listing; no private login-email copying. Invalid array audiences
  and stale consent cannot mutate preferences or restore revoked access.
- Contact titles provide no approval/directory power; scoped reviewers cannot see
  directories without membership. Primary and relationship owner are actual
  fictional assignments, backup absent. Leaving/suspension/revocation invalidate
  related privileges/appointments in old sessions; rejoin does not restore them.
- Entire raw API, public HTML and actual RSC payload privacy, including own-page
  credential exclusion and public-profile isolation. Cross-church directory/review
  HTML/RSC show denied states without private names or contacts. Unsupported query
  text does not act as a hidden-contact search/count oracle.
- Subsequent API/HTML/RSC responses stop exposing withdrawn directory fields;
  sharing/removal races and active-session grant revocation preserve denial.
  Required cache/referrer directives are checked on actual responses.
- My church, sharing and reviewer pages render with expected title/heading/action
  labels, one balanced main/skip target and labeled platform/utility navigation.
  No rendered marketing waitlist/nav on those pages. Only structural assertions
  omit inline scripts; privacy assertions examine the unfiltered response.

### Defects and intermediate failures

1. Internal static review found an array-shaped APPROVE action could be coerced
   through a state map without its eligibility branch; strict string validation
   and suspended-target regression now pass. Array sharing audiences are likewise
   rejected without mutation. This review was internal, not independent approval.
2. An operator possessing only church-creation capability initially received an
   overbroad candidate/appointment projection. Per-capability projections now pass
   dedicated least-privilege tests; title alone never gives access.
3. A first church request revoked an independently appointed reviewer capability.
   Cleanup now applies to terminal/re-request transitions, not first creation.
   The self-review test uses a dedicated valid reviewer, proves that grant remains
   active and can review another person, then tests explicit self-review denial.
   A contact test also needed the correct403 expectation for explicit other-church
   help; generic direct help remains available without contacts.
4. Next's global header configuration replaced the route's fuller cache directive.
   Configuration and API now agree on private/no-store/max-age=0.
5. Next development Flight I/O debug metadata serialized the synthetic request
   cookie. A cached server helper alone did not fix it. New portal pages now fail
   closed before private reads outside production; tests/preview use actual
   production HTTPS with sender disabled. Production raw payload absence and
   development guard absence checks both pass. Other dev routes are not certified
   private; development must use only fictional data.
6. Streaming loading fallback rendered another complete application shell/main.
   It now renders a neutral busy state without duplicate nav or signed-out controls.
   The final structural checks pass. Generated dependency-smoke output also exposed
   a missing lint ignore; only disposable generated artifacts are now excluded.

Earlier unsuccessful runs are retained locally in stage2b-final*.log. Failures
were corrected and the complete final suite rerun. No privacy assertion was
weakened or response filtered to declare a pass. Native TypeScript module-type
warnings remain nonfatal; no package-module rewrite was made just to hide them.

### AC-01 through AC-24

| ID | Stage 2B status | Evidence / remaining scope |
|---|---|---|
| AC-01 | Passed, bounded | Existing account/feed/profile/text-search/public render regressions and build. Not all historical social mutations or live deployment. |
| AC-02 | Passed | Two-fictional-church fixtures exercise the same services and isolation. |
| AC-03 | Passed | Category/forged identity/operator/capability escalation denied through real service/API. |
| AC-04 | Passed, automated | One pending request, explicit state/withdraw UI, no directory access. Human usability check pending. |
| AC-05 | Passed | Scoped reviewer approval and same-transaction audit/state checks. |
| AC-06 | Passed | Self, ordinary, unprivileged contact and Church B reviewer denied for Church A. |
| AC-07 | Passed, bounded | Combined index, concurrent requests/review/removal/sharing and stale versions. Not production load testing. |
| AC-08 | Passed | Combined Home Church limit; follows/account category independent; explicit leave-first. |
| AC-09 | Passed, automated | Separate opt-in, no implicit/public affiliation; owner settings/projection. Browser comprehension untested. |
| AC-10 | Passed, production portal | Hidden contact/login/session fields absent from authorized projections and unauthorized API/HTML/RSC; no address field introduced. Development guard is separately verified. |
| AC-11 | Passed | Same-church selected fields only; unrelated/anonymous/reviewer-without-membership denial. |
| AC-12 | Passed | Subsequent raw API/HTML/RSC omit withdrawn information; no-store and stale-write protection. Previously viewed data cannot be recalled. |
| AC-13 | Passed | Leave/remove/revoke/suspension affect old sessions; consent/assignments do not revive on rejoin. Public accounts/content preserved. |
| AC-14 | Blocked for real delivery | All 18 local account checks preserved; actual external email and operational recovery remain unavailable. |
| AC-15 | Passed, synthetic | Primary/backup/relationship-owner semantics and permissions tested. Real appointments not authorized. |
| AC-16 | Not run, deferred | Ordinary support cases/participants are not implemented in 2B. |
| AC-17 | Blocked operationally | Ordinary direct email exists beyond church contacts; no genuine independent concern responder established. No allegation intake. |
| AC-18 | Not run, deferred | Support-case receipt/progress/resolution/reopening are later work. |
| AC-19 | Not run for category fix | Existing text-search regression exercised; broader Testimony category correction explicitly deferred. |
| AC-20 | Blocked for browser QA | Labels, landmarks and page structure checked over HTTP; Mac lock prevents narrow/desktop/keyboard checks. No screen-reader claim. |
| AC-21 | Passed, synthetic | Actual2A upgrade plus fresh migrations preserve data and enforce new constraints. |
| AC-22 | Passed, synthetic only | Restore fingerprints/constraints and rollback limitations recorded. Actual production backup/recovery unverified. |
| AC-23 | Blocked for release | New UI explains verified behavior; policy/operator/entity/retention/adult-pilot facts and legal review remain unresolved. Policies not newly published. |
| AC-24 | Passed | No deployment, real data/email/appointments, ordinary cases, calendar, paid services or unrelated-file changes. |

### Local two-church walkthrough for review

Preview: `https://127.0.0.1:52881/platform/login` on this Mac only. It uses a local
self-signed certificate; see README and the fictional-only
`.account-test/run-MSq1n6/PREVIEW.md`. That ignored file holds the actual generated
login emails/passwords and exact church names. No credentials are copied here.
Several test runs may create similarly named fictional churches; select the exact
pair/suffix in that file. Use Log out between actors so permissions stay clear.

1. Sign in as `Fictional unack ...`. Open My church, confirm the adult acknowledgment,
   then Find a church and select the exact Fictional Lantern Test Church (Church A).
   Request a connection. Verify Pending and no private directory access.
2. Sign out and sign in as `Fictional review_a ...`. Open My church, then the scoped
   Review link. Approve the `unack` request, not another fixture's similarly named row.
3. Sign in as `unack` again. My church now shows approval. Open Manage sharing,
   choose a display name, opt into the directory, add a fictional email ending
   `@example.test`, select approved church members for email and keep phone Only me.
   Save. The preview shows only your own saved, audience-filtered listing.
4. Sign in as `Fictional member_a ...`. Open My church > Member directory. Your new
   listing/email should be visible; private phone/login email should not be.
5. Return as `unack`, turn off Include me and save. Reload the directory as member_a;
   the withdrawn listing should be absent. Then as unack deliberately Leave this
   church. My church shows the ended connection; a saved directory link is denied.
6. As member_a, open Help. See the configured fictional primary coordinator and
   relationship owner, honest backup setup-pending state and ordinary direct email.
   Do not send a real email during this review.
7. As `Fictional member_b ...`, open Church A's saved directory URL. It must deny
   access. As `Fictional review_b ...`, Church A's saved Review URL must also deny.
   Church A reviewer can approve Church A requests but has no directory membership
   merely because of that capability.

This walkthrough is provided for review; its browser clicks have NOT been performed
while the Mac is locked. Equivalent service/HTTP transitions and denials passed.
The preview remains disposable; stopping the runner ends it. Do not invite real
members or expose it on the Internet. No ordinary support-case work has begun.

## Historical Stage 1 and Stage 2A evidence

September 7, 2026; source main 68b4190. These are evidence statuses, not completion claims for the proposed product. Lint/build passed; no fixture/runtime/restore suite was run. No production test writes occurred.

| ID | Status | Evidence / remaining check |
|---|---|---|
| AC-01 | Not run | Lint/build passed; full feed/profile/login regression needs isolated runtime |
| AC-02 | Not run | Church model/fixtures missing |
| AC-03 | Not run | Source enum grants no privilege; forged request tests pending |
| AC-04 | Not run | Connection lifecycle missing |
| AC-05 | Not run | Reviewer service missing |
| AC-06 | Not run | Scoped deny-path service/tests missing |
| AC-07 | Not run | Transition concurrency missing; existing reaction race identified |
| AC-08 | Not run | Home Church absent; follow model independent |
| AC-09 | Not run | Directory participation missing |
| AC-10 | Not run | Broad server queries identified; unauthorized response tests required |
| AC-11 | Not run | Directory sharing missing |
| AC-12 | Not run | Withdrawal service/cache tests missing |
| AC-13 | Not run | Church revocation missing; password change retains sessions |
| AC-14 | Not run | Account lifecycle tests absent; recovery absent; ownership defect found by source inspection |
| AC-15 | Not run | Contact assignments missing |
| AC-16 | Not run | Private support cases missing |
| AC-17 | Blocked | Independent concern route not established; ordinary direct contact not a substitute |
| AC-18 | Not run | Support states/intake absent |
| AC-19 | Not run | Category mismatch confirmed in query; live reproduction blocked by web tool |
| AC-20 | Not run | Placeholder-only inputs/count-only reaction/nested main source findings; browser checks pending |
| AC-21 | Not run | Five migrations inspected; no isolated DB migrations executed |
| AC-22 | Blocked | No verified isolated backup/restore environment or exercise |
| AC-23 | Not run | Policy mismatch documented; drafts/operator facts deferred to implementation/review |
| AC-24 | Passed | Stage 1 documentation-only scope preserved; no new runtime systems or publication |

Executed checks and their exact environment limits are in CURRENT_STATE.md. No failures were fixed in product code during this stage. RELEASE_READINESS.md should be created with actual configuration/deployment and restore evidence during later implementation/verification; production readiness is not established here.

## Stage 2A evidence (September 7, 2026 local)

These results supersede only the account portions of the historical stage 1 table.
They do not mark all AC-01..AC-24 complete. Branch codex/account-security;
independent claim fix f027758, full implementation e8b370c is local review work.

Executed `npm run prisma:generate`, `npm run lint`, `git diff --check`, and
`npm run test:accounts`. Final repeat: `npm run preview:accounts` passed all 18
checks (12 service, 6 HTTP), fresh migration, upgrade/restore and production build;
synthetic artifacts are in ignored `.account-test/run-2LQDUe/`. The preview remains
on loopback only for review. The account runner uses Node 25.9.0, local PostgreSQL 16,
Prisma 6.19.2 and patched Next 15.5.21. It starts a new loopback-only cluster with
new synthetic databases and overrides database/sender environment settings. No
production fixture, public signup, real email, or live migration was used.

Service evidence (12 passing tests): legacy-passwordless duplicate denial with
unchanged rows/sessions; password-bearing duplicate denial; original scrypt and
Unicode login compatibility; malformed/oversized inputs; wrong-current-password
nonmutation; full session/grant revocation; deterministic stale validated credential
snapshot after password change; actual overlapping login/change operations;
invalid/expired/wrong-purpose grants; one winner among concurrent reset consumers;
recovery request preserving active sessions; purpose-bound verification; real
legacy recovery preserving content; persistent limiter concurrency across Prisma
clients; production rejection of test sink and fragment-only links.

HTTP evidence uses the actual Next API boundary, not a mock service: generic
registration/login results, no duplicate session creation, forged origin/category
denial, oversized-body/password denial, public HTML and RSC exclusion of fixture
private email/hash/tokenHash, feed/profile/text-search/account/public-page rendering,
unauthenticated Settings redirect, wrong/valid password change, cookie invalidation,
recovery request/fragment GET inertness, wrong-purpose denial, one-use reset and
new-password login, disabled-sender responses. The separate logout regression
passed through the retained Next Server Action: cross-origin submission preserved
the session, while same-origin multipart submission signed out only that device.

Migration evidence: synthetic previous schema and records upgraded without loss;
verification remains NULL. Fresh Prisma migration deployment passed separately.
Backup/restore compared ordered row-content hashes for users, sessions, grants,
posts, comments, likes and follows. No real backup/restore capability is established.
Production compilation passed; HTTP sink testing uses development mode, not a
production sender. A limited browser spot-check viewed sign-in/registration at
desktop and a 390x844 viewport, scrolled the forms, and followed recovery/back links.
Labels and buttons were readable without visible clipping; recovery document width
matched its 375px client width (390px viewport minus scrollbar). No complete mobile,
screen-reader, keyboard, or browser account-lifecycle pass is claimed.

Initial harness failures were fixed: PostgreSQL socket options did not handle a
workspace path with spaces; using loopback TCP solved it. A concurrent limiter test
found premature record cleanup when raw SQL and Prisma dates used different time
zones; explicit UTC SQL timestamps fixed it. These were new local defects caught
and corrected, not hidden pre-existing production-test results. The new logout
harness initially used an unsupported URL-encoded Server Action form and assumed
a 4xx rejection. Correcting it to the actual multipart form encoding and asserting
session preservation plus the successful same-origin control produced the passing
result above; no logout implementation workaround was added to satisfy the test.

Nonfatal Node native-TS module-type warnings and existing Browserslist age warning
were observed. `npm audit --omit=dev --json` identified a concrete Next vulnerability,
then verified no remaining direct Next advisory after the 15.5.21 patch. It still
reports nine high package-level findings including transitive Prisma configuration,
CSS/image tooling and Next's inherited dependencies. Full dependency remediation
is not claimed; release triage is recorded in RELEASE_READINESS.md.

| Acceptance | Stage 2A status | Scope / remaining evidence |
|---|---|---|
| AC-01 | Passed | Relevant synthetic public/account HTTP regressions and build; not live deployment |
| AC-03 | Not run | Forged category rejected; full church-capability deny paths deferred |
| AC-10 | Not run | Existing public HTML/RSC projections tested; private directory not implemented |
| AC-13 | Not run | Account revocation/races verified; church-role/session revocation deferred |
| AC-14 | Blocked | Local account/sink lifecycle verified; external recovery delivery unavailable |
| AC-20 | Not run | Account labels improved; browser/mobile/a11y checks still required |
| AC-21 | Passed | Fresh and synthetic upgrade for account migration only |
| AC-22 | Passed | Synthetic restore and forward-recovery caveats documented; production recovery remains unverified |
| AC-24 | Passed | Bounded account code only; no publication, real appointments/data or church systems |

AC-02, AC-04..09, AC-11..12, AC-15..16, AC-18..19, AC-23 remain Not run for the
future slice; AC-17 remains Blocked on real independent escalation. No legal/operator
facts or directory defaults were approved by these test results.
