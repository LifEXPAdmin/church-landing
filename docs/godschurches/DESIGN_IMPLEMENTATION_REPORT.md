# Official platform design

## Decision and scope

Andrew authorized the attached Paper, Olive, and Ink direction as the official
platform design, rather than an isolated proposed preview. This is the real
`/platform` interface and its existing account, profile, Explore, church, and
private help workflows. The marketing landing page at `/` is unchanged.

The older read-only `/platform/demo` tour remains clearly fictional and keeps
its static rendering and no-write boundary. It is not the official application.
No production fixtures, account changes, invitations, assignments, mail sends,
DNS changes, schema changes, dependencies, or new services are part of this release.

## Design decisions

- Warm paper and ink with olive actions; green-black dark appearance. Bronze is
  used for readable emphasis. Decorative light gold is not used for body text.
- Existing Source Sans 3 and Cormorant Garamond fonts and Church icon are retained.
  No extra font download, stock imagery, ornate framing, or animation dependency.
- Scoped semantic Tailwind colors and platform CSS replace hard-coded brown styles
  across existing platform components. Marketing tokens are not overridden.
- Home, My church, Explore, Profile, Help. Explore keeps `/platform/search`.
  Desktop has a left navigation rail; mobile has labeled bottom navigation.
  At 320px a compact in-flow menu replaces the crowded five-column bar.
  Assigned church tools remain controlled by the existing server permissions.
- The visitor welcome is short and points to real account creation. Signed-in
  Home opens on the feed, without a marketing hero, invented member activity,
  or fictional testimonials. Public posts have an explicit Public audience label.
- Settings groups real account/security, privacy/sharing, appearance/reading,
  and help/update information. There are no fake notification controls, provider
  sign-in buttons, contacts, or response-time promises.

## Reading behavior

List remains the default for existing members; Pages is an optional real-data
view, not a forced behavioral change. Both use the same server-rendered posts,
ordering, audience, and server actions. Pages renders only the current article.

Previous/Next are native labeled buttons. Boundary buttons remain focusable with
`aria-disabled` and have guarded handlers. There is no wrap or automatic advance.
A short polite status announces position and author, not the entire post body.
Navigation is repeated below posts; using the bottom controls returns focus to
the corresponding top control and moves the reading region into view.

Long posts flow through the document with adjustable body size and approximately
1.6 line height. They do not shrink, clip, or create a nested vertical scroll area.
Transitions are restrained horizontal cues. OS reduced motion always disables
motion, and a local additional reduction is available.

Supplementary touch handling accepts short clear horizontal gestures away from
browser edges. Vertical motion, multi-touch, text selection, controls, open
comment sections, and open native dialogs do not trigger a page turn. No wheel,
document-wide arrow, default browser touch, or pinch-zoom interception is installed.
Visible buttons are the supported alternative to gestures.

Public post ID and view mode in the current URL preserve reading position through
reload, Back from a profile, and comment/like redirects. Discussion expands inside
the current article. A missing selected post falls back to the first available
post with a notice. Unsubmitted comment drafts are not a durable draft feature.

The home feed retains the existing self/followed author filter for signed-in
members and public posts for visitors. A bounded 30-post batch has deterministic
createdAt/id ordering, an explicit older-post cursor link only when another row
exists, and a finite end message. Refresh posts is explicit; no polling or feed
injection reshuffles the reader. Older batches are separate requests, not an
infinite-scroll implementation. A failed navigation uses the platform error
boundary and retry link; offline reading is not implemented.

## Appearance and privacy

Appearance defaults to the device setting. Light/Dark overrides are available
without signing in from the platform footer; signed-in Settings adds four reading
sizes, default feed mode, and reduced motion. Choices are saved only in the browser
in `godschurches_reading`, a validated presentation cookie scoped to `/platform`
with a one-year maximum age and SameSite=Lax (Secure on HTTPS). It contains no
account identifier, password, session, post text, or email. Clearing browser
storage removes these preferences. Blocked persistence is not reported as saved.

The production shell reads only validated appearance choices for first paint.
Client reconciliation handles Back/prefetched screens. The development Flight
privacy guard is preserved: the shell does not await a cookie jar in development.
The static demo does not read cookies or live data.

Auth and private-service code, schema, credentials, session rules, migrations,
role/permission rules, and account form IDs/autocomplete/submission behavior are
unchanged. Signup is still insert-only, not an ownership recovery path. Production
recovery/verification email and support intake remain disabled until their
separate operational requirements are met. The legacy passwordless account is
not modified by this design update.

## Verification and publication

Local release verification passed on September 8, 2026:

- ESLint and TypeScript passed. Three reading-preference and contrast tests passed.
- All 74 existing account, church, and support service/HTTP checks passed on
  isolated PostgreSQL and production-mode HTTPS. Fresh and upgrade migrations,
  synthetic backup/restore, development HTML/RSC privacy checks, production build,
  and process-restart persistence checks passed. No production fixture was used.
- Runtime tracing passed: 49 traces, 3,659 entries, and 113 server JavaScript files,
  with no Prisma configuration-loader dependency in HTTP runtime bundles.
- The existing account browser regression passed all 16 checks, including real
  registration, sign-in, event-free autofill, profile persistence, browser restart,
  logout, private-data boundaries, and 320/390/1440px account layouts.
- Fifteen additional reading/design browser checks passed. These cover keyboard
  focus, Pages/List/reload/profile Back, real comment and reaction writes on the
  selected post, desktop composer focus and mobile post submission, natural long
  text, gesture-event logic, appearance persistence, OS preferences, four viewport
  widths, 200% base text at 320px, older-batch boundaries, forced-colors focus,
  and absence of browser runtime exceptions.

Visual inspection covered the real synthetic-account home on mobile and desktop,
light and dark, plus the account forms. Reading URLs use Next's supported native
history integration so client router state stays synchronized after page turns.
Comment tests wait for committed UI state rather than closure of a streaming
Flight response. These are actual existing server-action submissions to the
disposable local database, not mocked success screens.

Evidence is ignored under `.account-test/design/`: `regression-final.log`,
`browser-final.log`, `browser-final-reader.log`, and `browser/` screenshots and
results. Local database run: `.account-test/run-EgTr0a`. Screenshots include
`home-light-320.png`, `home-light-390.png`, `home-light-768.png`,
`home-light-1440.png`, `mobile-pages-dark.png`, and `account-regression/`.
All accounts and posts visible in those screenshots are fictional local tests.

No physical-phone, screen-reader, actual password-vault, comprehensive visual
conformance, or WCAG certification claim is made. Touch tests dispatch synthetic
events; they do not establish physical iOS/Android gesture behavior. The text
enlargement check changes the root font size, not a physical mobile zoom gesture.

### Published release

**Live at https://godschurches.com/platform.** Application commit:
`56be28a2ae1ad6f14b01481251546387325383e2`. Vercel production deployment:
`dpl_EjWJoq3Xs6z2dbjha4DSMPkEw35T`, READY at 2026-09-09T02:07:51.112Z.
The canonical godschurches.com alias matched that exact deployment at
2026-09-09T02:07:54.400Z. Live verification finished at 2026-09-09T02:09:09.046Z.

The actual Linux build passed, with no pending database migrations. Its runtime
trace check covered 49 traces, 3,531 entries, and 113 server JavaScript files,
with no Prisma configuration-loader path. Existing Node 24 configuration and the
account API's 60-second limit were retained; no provider resource settings changed.

Live smoke tests passed 39 HTTP checks and 48 browser route/appearance checks
at 320, 390, and 1440px, with zero browser exceptions and zero demo mutation
attempts. Anonymous dark appearance persisted after reload without creating an
account session. Protected account/church/support pages still required sign-in,
cross-origin write requests were rejected, and the fictional tour remained read-only.
No real account registration, member post, church appointment, support request,
email send, or production database mutation was performed during this design release.
Those functional write tests ran only in the disposable local database.

The landing page, waitlist, auth services, schema, production secrets, and stored
member information were not replaced. The test server and its local database were
stopped after verification. Evidence is in the ignored design folder's
`published.json`, `linux-build-proof.json`, `live-smoke-result.json`, and
`live-public-screenshots/`. This report-only follow-up may redeploy identical
application code; the IDs above identify the deployment used for the full live checks.

### Reproduce locally

Use Node 24 and the existing isolated PostgreSQL harness:

```sh
npm run lint
npx tsc --noEmit
npm exec --yes --package=node@24 -- node --import ./tests/register.mjs --test tests/reading-preferences.test.ts
npm exec --yes --package=node@24 -- node scripts/test-account-security.mjs --support --preview
```

Keep the last command running. It prints a generated `.account-test/run-...`
directory. In a second project terminal, run `scripts/check-platform-design.mjs`
with that run's actual `browser-env.json` path as the next argument using Node 24.
The browser script rejects production/external databases and creates only local
fictional records. It requires the existing full Chromium/Playwright runtime used
by `scripts/check-account-browser.mjs`; environment overrides are documented in
those scripts. `--reader-only` is a local debugging continuation after its own
fictional account has already been created, not a substitute for the full check.

### Sources and limits

The supplied brief and tokens guide the visual direction. Native controls and
non-rotating navigation follow the [WAI carousel interaction guidance](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/).
Touch handling preserves browser defaults described in [MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).
Palette tests calculate opaque sRGB contrast pairs; they are not a full rendered
state, assistive-technology, or legal compliance audit. The claim that a horizontal
feed creates healthier or more spiritual use is not made.

Media upload, durable drafts, full comment-history pagination, personalized feed
ranking, notifications, verified email delivery, and broad release-readiness work
remain separate features. This release makes the design official, not the entire
product feature-complete or ready for an unrestricted public rollout.
