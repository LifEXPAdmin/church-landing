# Godschurches current state

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
