# Godschurches

The existing account and community application, with public information pages and private church tools.
The app entrance and account session controls are published. See
[ENTRANCE_REPORT.md](docs/godschurches/ENTRANCE_REPORT.md) and
[SESSION_CONTROLS_REPORT.md](docs/godschurches/SESSION_CONTROLS_REPORT.md) for
tested releases, actual verification and remaining account work.
The transactional recovery adapter is tested; actual email delivery remains
disabled pending sender setup and receipt verification. See
[ACCOUNT_DELIVERY_REPORT.md](docs/godschurches/ACCOUNT_DELIVERY_REPORT.md).
Private account downloads are verified in
[ACCOUNT_DATA_REPORT.md](docs/godschurches/ACCOUNT_DATA_REPORT.md).
Account deactivation and reactivation are tracked in
[ACCOUNT_LIFECYCLE_REPORT.md](docs/godschurches/ACCOUNT_LIFECYCLE_REPORT.md).

## Continue with ChatGPT or Codex

Start with [AGENTS.md](AGENTS.md) and the
[workflow guide](docs/godschurches/WORKFLOW_GUIDE.md). They explain how to locate
the private second-brain context, read current evidence, and leave a useful handoff.
For implementation status, use the newest applicable sections of
[CURRENT_STATE.md](docs/godschurches/CURRENT_STATE.md) and its linked reports;
older checkpoints in this README may be superseded.

## Stack

- Next.js App Router + TypeScript
- TailwindCSS + shadcn/ui-style setup
- Prisma ORM + PostgreSQL
- Basic auth-protected admin routes
- Historical waitlist and analytics administration (new collection retired)

## Routes

- `/` GET redirects to `/platform`; other submission methods are not accepted
- `/about` Project purpose and current capabilities
- `/help` Public account and church guidance
- `/manifesto` Manifesto
- `/for-users` For Believers
- `/for-churches`
- `/for-creators`
- `/for-businesses`
- `/join` GET redirects to account signup; POST returns 410 without inserting data
- `/thanks` GET redirects to Home without claiming a submission succeeded
- `/privacy` Privacy policy
- `/terms` Terms of service
- `/admin/waitlist` Waitlist table + segment filters
- `/admin/waitlist/export` CSV export (all or by role)
- `/admin/analytics` Event analytics dashboard
- `/platform` Existing application Home with public posts, comments, reactions, search, profiles, and follows
- `/platform/login` Password-backed platform account access
- `/platform/profile/me` Editable platform profile
- `/platform/profile/[username]` Public platform profile
- `/platform/settings` Password and session settings

## Features Included

- App entrance and legacy-link handling without a second feed or account system
- Historical waitlist consent and account records preserved
- No new waitlist subscriptions, marketing sync, or first-party analytics collection
- Error handling pages (`app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`)
- SEO metadata + `robots.txt` + `sitemap.xml`
- Account and community foundation:
  - password-hashed accounts
  - database-backed session tokens
  - cloud-saved posts, comments, likes, follows, profiles
  - owner-only delete controls for posts and comments
  - password change screen for signed-in users
  - owner-only active sign-ins and password-confirmed sign-out of other sessions

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Required:

- `DATABASE_URL`
- `DIRECT_URL` (non-pooled direct DB URL for migrations)
- `ADMIN_PASSWORD`

Recommended:

- `NEXT_PUBLIC_SITE_URL` (production URL)
- `ACCOUNT_ORIGIN` (canonical HTTPS production origin)
- `AUTH_RATE_LIMIT_SECRET` (at least 32 characters)
- `ACCOUNT_DELIVERY_MODE=disabled` until authorized delivery is configured

Former MailerLite group settings and analytics salts are not used by the retired submission routes. They do not enable account recovery. Do not delete production secrets or historical subscriber records merely because the public funnel is retired.

## Setup

Use Node.js 24 for the existing test harness and current production runtime.

1. Install dependencies:

```bash
npm install
```

2. Configure `.env`.

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Apply migrations:

```bash
npm run prisma:migrate
```

5. Start dev server:

```bash
npm run dev
```

## Retired waitlist

New collection is closed. GET `/join` leads to `/platform/signup`; POST `/join` and POST `/api/track` return 410. The old server action and collection components are removed. Historical records and read/export administration remain intact. No waitlist entry becomes an account, church role, or new email subscription.

## Local Postgres (Homebrew)

```bash
brew install postgresql@16
brew services start postgresql@16
```

Default local connection used by `.env.example`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/church"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/church"
```

## Admin Access

Protected by middleware basic auth (`/admin/:path*`):

- Username: `admin`
- Password: value of `ADMIN_PASSWORD`

## Platform Preview Notes

The `/platform` area is an early working preview, not the final social product.
Data is stored in Postgres through Prisma. Accounts use password hashes and
opaque session cookies, so passwords are not stored as plain text and the browser
does not receive a raw user id as its login cookie.

Existing accounts cannot be claimed by registering their email and username again.
Older passwordless accounts require verified account recovery. Until recovery
delivery is configured and tested, that route is unavailable. Existing accounts
and their posts remain intact; do not delete them or assign passwords manually
based on public profile information.

## Dev Commands

```bash
npm run lint
npm run build
npm run start
```

## Deploy to Vercel

1. Push repo to GitHub.
2. Import project into Vercel.
3. Add environment variables in Vercel settings.
4. Use a managed Postgres DB and set:
   - `DATABASE_URL` to pooled Prisma URL (`POSTGRES_PRISMA_URL`)
   - `DIRECT_URL` to non-pooled direct URL (`POSTGRES_URL_NON_POOLING`)
5. Run migrations on deploy target:

```bash
npm run prisma:deploy
```

## Connect Custom Domain (Vercel)

1. Open project in Vercel.
2. Go to `Settings -> Domains`.
3. Add your domain.
4. Configure DNS records at your registrar.
5. Wait for SSL verification.

## Notes

- Historical waitlist records remain segmented by role in admin filters/exports.
- Old waitlist links do not subscribe or grant access. Marketing sync is no longer called.
- Legal pages are starter templates and should be reviewed by counsel for your jurisdiction and business model.
- Hero photo source is from Pexels (`public/hero-original.jpg`) and transformed into web-ready variants.

## Account security development (stage 2A)

The account-security branch is local review work, not a deployed release.
Registration never overwrites existing accounts. New registration asks the person
to sign in normally; duplicate registration has the same confirmation. Password
changes require the current password and revoke every session and outstanding
recovery/verification grant. Password resets also require a fresh normal login.

Recovery and email verification use separate, one-use, 30-minute grants. Existing
email addresses remain unverified. Production email delivery is deliberately
unavailable in this slice. The test sender writes only to a private local folder;
it never sends messages or uses MailerLite/Resend credentials.

### Safe local checks

From this project directory, `npm run test:accounts` creates its own disposable
PostgreSQL cluster bound to loopback, applies synthetic migrations/fixtures, checks
account services and HTTP routes, verifies backup/restore, and shuts it down.
It does not reuse the database URL from `.env`. Requires local PostgreSQL binaries
(default `/opt/homebrew/opt/postgresql@16/bin`, override `TEST_PG_BIN`) and Node
22.15+ with native TypeScript stripping/module hooks (tested on Node 25.9.0).

`npm run preview:accounts` runs the same checks and then keeps an isolated preview
open. The command prints a local sign-in URL. Create a fictional account there.
Request reset or verification from Account recovery. Test messages are JSON files
under the printed run directory's `sink/` folder, not a public browser mailbox.
Open a test link locally to exercise the explicit confirmation form. Ctrl+C stops
the preview and its disposable database. Do not use real member data.

### Account configuration for a later approved release

- `ACCOUNT_ORIGIN`: exact trusted website origin, HTTPS in production. No path,
  credentials or query. Falls back to `NEXT_PUBLIC_SITE_URL` for normal access.
- `AUTH_RATE_LIMIT_SECRET`: at least 32 characters of cryptographically generated
  server-only randomness. Required in production. Do not paste secrets into chat.
- `ACCOUNT_DELIVERY_MODE`: keep `disabled` for production in this stage.
- `ACCOUNT_TEST_ISOLATED`, `ACCOUNT_TEST_SINK_DIR`: managed by the disposable test
  runner only. Never configure these as a production delivery workaround.

The account migration is additive. Read `docs/godschurches/RELEASE_READINESS.md`
before any separately authorized migration or deployment. Do not return to the
old account-claim code when rolling back. Non-production fixtures and reports are
ignored under `.account-test/` and are not bundled with deployment artifacts.

## Stage 2B Local Church Portal

This slice is local review work, not a deployed private-church pilot. It adds
church discovery/connection review, opt-in member directories, scoped capabilities
and appointed contacts. No ordinary support-case system or real email is enabled.
Read the current sections at the top of `docs/godschurches/QA_REPORT.md`,
`RELEASE_READINESS.md` and `DEPENDENCY_REVIEW.md` before making release decisions.

For engineering checks, run `npm run test:portal` in this project directory. For a
review preview, use `npm run preview:portal`. The runner creates a disposable
loopback PostgreSQL cluster and fictional accounts. It never uses the project's
real database or sender configuration. It prints the preview URL and an ignored
`PREVIEW.md` containing only fictional login details. Codex can run/restart this
for you; you do not need to configure a cloud database to review this local slice.

The account regression phase uses `next dev` with the local file sink. Private
portal HTTP tests and the review preview use `next start` from a production build,
real delivery disabled, behind a loopback-only HTTPS proxy. An ephemeral local
certificate is generated for 127.0.0.1; the test child trusts that certificate via
`NODE_EXTRA_CA_CERTS`, never a global TLS-verification bypass. No system trust
settings are changed. A browser may ask you to acknowledge that local certificate.
Only do so for the exact loopback URL printed by this runner, not the public site.

This split is deliberate: the installed Next development Flight debugger can
serialize awaited cookie/DB values into developer payloads. Do not run development
servers with real private church/member data. A passing production-mode payload
test is not a claim that Next's development debug stream is private.

The preview works only on this Mac, not remotely from a phone. Its database and
certificate are temporary; stopping/restarting the runner creates a new isolated
preview. Local sink files are not an inbox and must not be exposed as one. The
production preview's recovery screen correctly reports that delivery is disabled;
the supplied verified fictional accounts are prepared by the separate guarded
test process through the actual local verification service.
