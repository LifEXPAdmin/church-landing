# Release readiness: account fix only

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
