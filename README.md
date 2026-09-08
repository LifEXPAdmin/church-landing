# Church (The Revival) MVP

Production-ready landing site + segmented waitlist for Church while full platform development continues.

## Stack

- Next.js App Router + TypeScript
- TailwindCSS + shadcn/ui-style setup
- Prisma ORM + PostgreSQL
- MailerLite group-based email syncing
- Basic auth-protected admin routes
- First-party analytics event tracking

## Routes

- `/` Finalized landing page (mobile-first)
- `/manifesto` Manifesto
- `/for-users` For Believers
- `/for-churches`
- `/for-creators`
- `/for-businesses`
- `/join` Segmented waitlist form
- `/thanks` Confirmation
- `/privacy` Privacy policy
- `/terms` Terms of service
- `/admin/waitlist` Waitlist table + segment filters
- `/admin/waitlist/export` CSV export (all or by role)
- `/admin/analytics` Event analytics dashboard
- `/platform` Early platform preview with feed, posts, likes, comments, search, profiles, and follows
- `/platform/login` Password-backed platform account access
- `/platform/profile/me` Editable platform profile
- `/platform/profile/[username]` Public platform profile
- `/platform/settings` Password and session settings

## Features Included

- Hero image pipeline with separate desktop/mobile assets:
  - `public/hero-desktop.jpg`
  - `public/hero-mobile.jpg`
- CTA hierarchy (one primary, three secondary)
- Segmented waitlist roles: `BELIEVER`, `CHURCH`, `CREATOR`, `BUSINESS`, `BUILDER`
- Server-side validation and honeypot anti-spam
- Role-segmented data in PostgreSQL
- Optional MailerLite sync on each signup (role -> group)
- First-party analytics events:
  - `PAGE_VIEW`
  - `CTA_CLICK`
  - `JOIN_SUBMIT`
  - `JOIN_SUCCESS`
- Error handling pages (`app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`)
- SEO metadata + `robots.txt` + `sitemap.xml`
- Platform preview foundation:
  - password-hashed accounts
  - database-backed session tokens
  - cloud-saved posts, comments, likes, follows, profiles
  - owner-only delete controls for posts and comments
  - password change screen for signed-in users

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
- `ANALYTICS_SALT` (random string)

MailerLite:

- `MAILERLITE_API_KEY`
- Optional role group IDs (preferred):
  - `MAILERLITE_GROUP_ID_BELIEVER`
  - `MAILERLITE_GROUP_ID_CHURCH`
  - `MAILERLITE_GROUP_ID_CREATOR`
  - `MAILERLITE_GROUP_ID_BUSINESS`
  - `MAILERLITE_GROUP_ID_BUILDER`
- Optional role group names (fallback):
  - `MAILERLITE_GROUP_NAME_BELIEVER` (default `Church (User)`)
  - `MAILERLITE_GROUP_NAME_CHURCH` (default `Church (Church)`)
  - `MAILERLITE_GROUP_NAME_CREATOR` (default `Church (Creator)`)
  - `MAILERLITE_GROUP_NAME_BUSINESS` (default `Church (Business)`)
  - `MAILERLITE_GROUP_NAME_BUILDER` (default `Church (Builder)`)

## Setup

Prerequisite: Node.js 22 LTS.

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

## MailerLite Setup (Role-Based Emails)

1. Create groups in MailerLite (you already did this).
2. Create an API key in MailerLite (`Integrations` -> API).
3. Set `MAILERLITE_API_KEY` in `.env`.
4. EITHER set group IDs for each role (best), OR keep group names matching exactly.
5. In MailerLite, create one automation per group:
   - Trigger: subscriber joins group
   - Action: send role-specific welcome/confirmation email

Result: each signup goes to the correct group automatically, and each group can receive a different email sequence.

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

- Waitlist is segmented by role in database and admin filters/exports.
- If MailerLite API key is set, each signup is synced into role-specific groups.
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
