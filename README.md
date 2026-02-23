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
