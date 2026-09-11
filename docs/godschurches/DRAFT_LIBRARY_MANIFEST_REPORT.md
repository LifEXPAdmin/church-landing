# Private draft library and app manifest

September 11, 2026. Medium interface batch on `codex/medium-private-library`,
based on published `777c594`. This report records local acceptance before release;
the verified deployment receipt is recorded separately after production checks.

## Implemented

- Signed-in Menu links to `/platform/drafts`. Its private, noindex page loads
  only the current account's draft library from the existing workspace API.
- Twenty-row pages retain incomplete text and timestamps. Discard requires an
  explicit focused confirmation, acknowledged version and stable mutation ID.
  Conflicts require review; an uncertain response retains the exact retry body.
- Backgrounding hides rows. Focus rechecks identity before restoring them;
  account changes/sign-out clear private results. No draft copies enter
  localStorage, public server-rendered HTML or a service worker.
- `app/manifest.ts` consumes the existing installation policy. Next.js emits
  one manifest link; Apple touch metadata remains. Normal 192/512 PNGs and the
  maskable 512 PNG have the declared dimensions. Start `/platform`, scope `/`,
  stable ID `/` and standalone display match the contract.

## Fresh verification

- Production build, type checks, lint and runtime trace verification passed.
  105 traces, 8,514 entries and 257 server JavaScript files exclude private
  fixtures/environment files and the Prisma configuration-loader path.
- `npm run test:post-workspace`: 20 service checks plus dump/restore acceptance.
  `tests/install-policy.test.ts`: two policy checks passed.
- Existing workspace HTTPS checks: two passed; account-export checks: six passed.
- `scripts/qa-draft-library-browser.mjs`: ten browser groups passed against
  disposable accounts in isolated local PostgreSQL and HTTPS. Covers guest
  denial/return path, owner isolation, 22-draft pagination, 320/390px layout,
  empty/error recovery, cancel/focused confirmation, stale discard, response
  loss after commit/exact retry, background account change and sign-out.
  Confirms no authored posts or localStorage copies are created by this UI.
- Browser manifest parsing has no errors. Installability diagnostics report
  `in-incognito` for the isolated browser context; no physical installation is
  claimed. No service worker or CacheStorage entries exist.
- Read-only production migration inspection: 27 complete, zero pending, all
  checksums match. No migration or production application writes in this batch.

One test initially compared global fixture post counts while a separate HTTPS
suite created its own fictional posts. The assertion now checks the draft-test
owner, and the final browser run passed. An initial test-harness certificate
path was corrected to use the isolated certificate; TLS verification stays on.

## Remaining scope and next action

Draft creation/autosave and resume are separate Medium slices. Code inspection
found that the composer's `replyAudience` is absent from private draft snapshots;
publication would use the post service's `VIEWERS` default. The private queue
now assigns preservation/backward compatibility of reply permissions to a P2
Extra High contract repair. Do not start dependent autosave/resume work until
that contract is verified. Existing completed foundations remain complete.

Manifest completion unlocks the existing Medium installation-help task after
live verification. Saved collections, post Save/Remove, search and comment
interfaces remain ready independent work. Physical Samsung/iOS installation,
provider activation, broader parent integration and the final expanded-batch
review remain open. This slice covers the private-library subset of the post
workspace requirement and manifest subset of installation; it does not close
parent features or legacy source acceptance.
