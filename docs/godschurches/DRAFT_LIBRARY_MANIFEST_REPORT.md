# Private draft library and app manifest

## Saved-draft privacy verified live, 26 September 2026 UTC

Version **2026.09.26.6**, source `70cb24e2d594b30cb40c16ac300c954a71f75321`, is READY in
`dpl_9PS9VaUAYTG1QY99XeiED4UetmbB`. Independent canonical-domain and serving identity
checks passed at 07:50 UTC; final runtime acceptance passed at 07:51 UTC.
[Published notes](https://godschurches.com/platform/releases/private-draft-refresh).

Saved draft rows conceal before current-access reads and clear after failed
identity/list checks, offline or pagehide. Delayed responses cannot restore them
after concealment. The exact unconfirmed discard request survives failed reads
and manual refresh; retry confirms the original result without another deletion
or version change. Pagination and the independently mounted composer are retained.
See the [draft library receipt](DRAFT_LIBRARY_MANIFEST_REPORT.md).

The exact production build and CI pass with 32 browser/header groups and 18
service/HTTP checks. Browser checks cover held reads, account replacement, exact
mutation recovery, comment/post composition and light/dark narrow/enlarged layouts.
The unchanged backend retains its attributed 210-file broad baseline: 1,339 passes,
two expected skips, no failures. Drafts startup JavaScript grows by 60 gzip bytes;
Home and CSS are unchanged. No dependency, timer, worker or schema change is added.

All 21 live checks and six health checks pass. All 149 production table fingerprints
are unchanged; all 115 source, production and installed migration checksums match.
No migration is pending or applied. Unchanged recovery reuses the actual 06:15
installed restore and nightly job receipt. Scoped runtime errors and fatals,
production test writes, recipient sends and queue probes are zero.

The normal main push did not create a production deployment during the observed
wait. Explicitly rebuilding the same verified commit in the production environment
succeeded; no alternate source or configuration change was introduced. Broader
retained forms, CSP, cookie/session/password policy and real owner/provider/device
acceptance remain open. This scoped repair is not complete ASVS acceptance.

### Reproduction and focused acceptance

On the preceding .5 build, a loaded private draft paragraph remained after either
an identity 503 or list 503. The repair uses the existing read owner and authorized
API. A temporary pagination accumulator remains concealed only until a successful
current-owner read; failures and concealment events clear it. No browser storage,
server model or endpoint is added.

Fifteen final draft-library groups prove actual DOM removal, delayed-response
rejection, exactly one fresh list read after a pending focus invalidation,
account replacement, offline recovery, twenty-row paging and exact uncertain
Discard replay. The canonical deletion timestamp, version and tombstone payload
are unchanged by replay. Seven current composer groups preserve save/publish
retries, newer unsaved text, conflicts, reply permissions, revoked church checks,
comment targets and narrow/enlarged layout. Ten header groups also pass.

The old draft-controller harness stopped at a retired opener selector before
application assertions. Its attempt is preserved; the current composer-shell
suite supplies the relevant acceptance. The HTTP runner initially lacked the
built server's release SHA, so its public metadata comparison expected null.
Matching that test-process identity made all four HTTP checks pass. Earlier
pagination-count and status-selector corrections affected tests only. None of
these harness repairs changed the product runtime or production environment.
Authenticated writes and recovery tests used isolated fictional accounts. Live
checks were read-only guest/browser/health observations, not real member changes.

## Original library and manifest release

September 11, 2026. Medium interface batch on `codex/medium-private-library`,
based on published `777c594`. Application `a230b36104507f6918217fc753218c7924b440a0`
is published in READY deployment `dpl_EfZ2CynF7cxXmr9jZmyB8uUZmZ9z`.
Separate canonical-domain inspection and the live release endpoint match.
The report-only follow-up keeps the same application; its serving identity is
recorded in the private release handoff after verification.

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

## Live verification

At 18:39 UTC, all 17 existing live API checks and ten draft/manifest browser/HTTP
checks passed. The new guest route retains no-store/noindex behavior and safe
sign-in return at 320/390px. Manifest metadata is present once across Home, Menu
and Drafts; live icon MIME/dimensions match and the browser parses the manifest.
The browser reported no errors and sent no application mutation requests. The
specific production deployment error-log scan returned no entries. Authenticated
discard/retry acceptance used isolated local accounts, not production fixtures.

## Remaining scope and next action

Draft creation/autosave and resume are separate Medium slices. Code inspection
found that the composer's `replyAudience` is absent from private draft snapshots;
publication would use the post service's `VIEWERS` default. The private queue
now assigns preservation/backward compatibility of reply permissions to a P2
Extra High contract repair. Do not start dependent autosave/resume work until
that contract is verified. Existing completed foundations remain complete.

Manifest completion and live verification unlock the existing Medium
installation-help task. Saved collections, post Save/Remove, search and comment
interfaces remain ready independent work. Physical Samsung/iOS installation,
provider activation, broader parent integration and the final expanded-batch
review remain open. This slice covers the private-library subset of the post
workspace requirement and manifest subset of installation; it does not close
parent features or legacy source acceptance.
