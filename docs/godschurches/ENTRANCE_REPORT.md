# App entrance and waitlist retirement

## Published — September 9, 2026

The tested entrance was explicitly authorized for immediate publication. Commit
`b0b7aab404b3d947267844e7ec73537dc81e1989` was pushed to `main`; production deployment
`dpl_J4D1fjzPS8zMSxgzazWStF3EVvQr` became READY at 2026-09-09T21:48:50.752Z.
The Vercel API returned that exact Git SHA and the `godschurches.com` alias.
The domain now opens the real app. Remaining account/Google and broader release
acceptance are follow-up work, superseding the earlier entrance publication hold.

Thirty live HTTP checks passed at 2026-09-09T21:51:32Z: root/join/thanks GET and
HEAD behavior, rejected retired POSTs, nine public pages and their canonical
metadata, app/login/signup/recovery/demo/search/health, protected settings/profile
redirects, sitemap contents and account-origin rejection. No real account or
external email was created. Live browser Home/About/Help navigation and 390px
About/Help reflow passed; phone-width Help was visually inspected, with no browser
warning/error logs. A deployment-scoped error-log query returned no matching
entries. Physical-device and new real-account journeys were not performed.

The local implementation and verification checkpoint below is preserved as
historical evidence; its local-only release status is superseded by this section.

## Original local checkpoint — September 9, 2026

Implemented and verified locally on `codex/app-front-door`, based on workstation
onboarding commit `bd422ea` and repository main `41b6cce`. This is a release
candidate, not a production deployment. The existing checkout and production data
were preserved. Account controls, Google integration and applicable mobile/support
acceptance remain prerequisites for the official entrance release.

## Result

- `GET /` and `GET /thanks` return one 307 redirect to `/platform`.
- `GET /join` redirects to the existing `/platform/signup`. Historical role,
  source and return parameters do not create identities or grant permissions.
- `POST /join` returns 410 `WAITLIST_RETIRED`, including stale Server Action and
  multipart requests. POST to `/` and `/thanks` returns 405. Submission bodies
  are never redirected into account creation.
- Former analytics collection returns 410 `COLLECTION_RETIRED`. Waitlist forms,
  their action, the marketing funnel and collection hooks were removed.
- About and Help explain current features and account/church boundaries. The
  audience pages and manifesto distinguish working features from the future
  vision. Privacy and Terms describe the current service without converting
  historical consent into account ownership or promotional subscriptions.
- Public headers/footers, titles, share metadata and canonicals use Godschurches.
  The sitemap contains nine canonical public information pages; app routes retain
  the existing noindex boundary. Deep links and the existing app shell are reused.

No schema, migration, dependency, password, account authority or historical-record
change was made. Existing administrator read/export paths remain. Archival email
helpers have no active public call site. Optional reading analytics are not enabled.

## Verification performed

Node 24 `npm run test:support` passed all **78 service/HTTP tests**: the existing
74 plus four entrance regression groups in `tests/entrance-http.test.ts`. The
harness also passed synthetic upgrade, full restore, fresh migrations, development
privacy guards, production build and actual new-server-process persistence checks.
It used disposable loopback PostgreSQL and a locally verified HTTPS endpoint;
production data and external email were not used.

The new groups verify root/old-link behavior, signed-out and authenticated entry,
stale form rejection, public page metadata and private HTML/RSC boundaries. Full
record fingerprints for historical waitlist/events, users, sessions, connections
and role grants match before and after read/retired-submission checks. A historical
waitlist identity never acquires an account. Existing two-church privacy and
support regressions continue to pass.

A final `npm run lint` and `npm run build` passed after formatting. Build includes
TypeScript validation and runtime trace verification: 51 traces, 3,684 entries,
116 server JavaScript files and no Prisma configuration-loader path.

Codex in-app browser inspection of the production build checked Home, About,
Help, signup and sign-in at **320, 390 and 1440 px**. All 15 route/width combinations
had matching document/viewport widths, expected headings and titles. Screenshots
were inspected for desktop Home, small-phone About/Help and phone Home. Actual
navigation from Home to About, Help and signup worked. Old join/thanks links
reached signup/Home; the keyboard skip link moved focus to the public main region.
The browser reported no warning/error logs during this review.

Browser inspection used loopback HTTP and fictional data for anonymous navigation
and layout only. Authenticated operations were verified by the HTTPS integration
harness, not by this browser review. No actual password-manager vault, physical
phone, Safari, fresh real-account journey or production redirect is claimed.

## Workstation and serving identity

The original Mac checkout is on clean `codex/mac-workstation-setup` at `bd422ea`.
The entrance work is in a separate Git worktree. Remote main was independently
read as `41b6cce71452e25ecc13eee4d86dcd0f72a362c6`.

Read-only Vercel inspection of `https://godschurches.com` returned production
deployment `dpl_BydNL6jHx5A7j7DbWGusDtPCc1MF`, READY, created
2026-09-09T02:10:08.423Z. This is later than the deployment recorded by the existing
design report. The inspection did not return a Git SHA; the historical tested
application SHA must not be relabeled as a freshly verified serving SHA.
No alias, deployment, environment or production database was changed this session.

## Changed areas and next action

Routes and public copy are under `app/`; shared public chrome is under
`components/layout/`; the app footer is in `components/platform/platform-shell.tsx`.
`lib/site-metadata.ts` centralizes public metadata. The entrance tests are included
in the existing support harness; its tracking rejection assertion was updated.

Continue the account/security foundation in the canonical build queue. A bounded
next slice is an owner-only session list and explicit revocation of other sessions,
with fictional two-session and cross-account assertions. Full account acceptance
still requires real verification/recovery delivery and the other specified
ownership/data controls, followed by Google integration and navigation work.
Keep the entrance parent task open until deployment and its full acceptance pass.
