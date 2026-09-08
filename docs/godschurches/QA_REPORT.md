# Stage 1 acceptance baseline

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
