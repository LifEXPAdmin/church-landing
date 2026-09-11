# Medium refinement acceptance

## Production release and query-return correction — 11 September 2026

The Medium bundle was pushed to main as `6b1d814e55607662c70be50efd1147faae70d571`.
Production deployment `dpl_2GzD3eLJHvHHJ6oeDXEu9MnZLwNb` reached READY at
14:26:09 UTC, and the canonical `godschurches.com` alias independently matched.
The remote build passed compilation, lint/types and runtime tracing (95 traces,
7,427 entries, 233 server JavaScript files). All 25 migrations were present with
none pending; this release adds no schema or provider changes.

Seventeen live read-only HTTP checks passed, including guest title/heading pairs,
private/noindex headers, redirects, Explore scope and byte-for-byte matches for
nine brand assets. The initial live browser check exposed a narrower missed case:
typing a new Explore query, opening church search and pressing Back lost the
unsubmitted query. Submitted-query Back had passed the earlier acceptance.

This follow-up preserves the bounded Explore query in its source history entry
before ordinary document navigation to church search. Modified/new-tab clicks
retain their normal behavior. It uses the supported
[Next.js native history API](https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api).
The isolated browser regression now covers this previously missing journey.
Fresh build/runtime, lint and all ten browser groups passed after the correction,
with no browser page errors. The earlier 374-pass/two-skip full sweep remains the
service evidence. An unnecessary repeat sweep was stopped to focus on this
navigation-only change; it is not claimed as a completed fresh sweep.

The initial deployment error-log scan returned no errors. Final follow-up serving
identity and live-check results are recorded in the private release handoff.
Live verification uses read-only navigation; fictional mutations remain confined
to the isolated fixture database. Physical Samsung acceptance, the separately
observed intermittent hydration issue and existing foundation gates remain open.
The local-only statements below preserve the earlier pre-release checkpoint.

## Earlier local acceptance

11 September 2026. Local branch `codex/medium-workflow`, based on main `7a5a9ab`
and the reported integrated application `c7067ae8`. Prior worktrees were preserved.
Application/UI commit `70bd3bc`; brand commit `db70799`; taxonomy/metadata inventory
commit `1011cf0`. These changes are committed locally, unpushed and unpublished.

## Implemented behavior

- Guest profile and account-settings entry gates announce the same sign-in reason
  as their heading. Signed-in owners retain the editor title; metadata adds no
  private profile fields. Existing account return validation and permissions remain.
- Explore labels its actual people/post search, and a separate church action
  transfers the current typed query through the existing 100-character church
  parser. Form navigation, Unicode/literal encoding, empty input and Back work.
- Guest Home has a compact welcome with primary Join and secondary Explore.
  Empty-state links have real destinations without repeating church discovery.
  Ordinary Home scrolling and the deliberate focused reader are preserved.
- Menu and the guest account gate are full pages, not missing overlays. The
  profile editor uses native `dialog.showModal()`. Its background could scroll
  while open (observed movement from 1140 to 1740 px). Shared native-modal CSS now
  locks document/body scrolling and releases it on close, Escape or unmount.
  The browser regression verifies focus, keyboard containment, keep/discard and
  scroll restoration at 320/390 px.
- The existing Church mark and palette now generate editable normal/maskable SVGs,
  favicon 16/32/48 entries and PNG icon sizes. Root metadata links tab/search/Apple
  assets. The reusable static share-card renderer handles generic, long, Unicode
  and missing input without loading records or remote images.
- [Composer taxonomy](COMPOSER_TAXONOMY.md) documents the existing types, exact
  topic dictionary/limits, validation, projections and future filter compatibility
  question. [Route metadata inventory](PUBLIC_ROUTE_METADATA_INVENTORY.md) records
  all 67 actual page routes, inherited/dynamic values, existing noindex headers and
  proposed copy for the owning SEO foundation. Neither inventory changes policy.

## Verification

The repository's isolated `preview:support` sweep completed **376 checks: 374
passed, two expected disabled-email skips, zero failures**, including additive/
fresh migrations, backup/restore, services, development and production HTTPS,
restart persistence and the added guest-title assertions. All data was fictional
in loopback PostgreSQL. No production record was modified.

After the native-dialog CSS fix, the production build and runtime audit passed
again (95 traces / 7,518 entries / 233 server JavaScript files; no private fixture,
environment or Prisma configuration-loader paths). Final TypeScript, lint and
whitespace checks passed. The ten final browser acceptance groups passed with
no page errors on the diagnostic run. The first browser fixture setup attempted
to withdraw a pinned post without clearing its pin; the database rejected it.
The fixture was corrected to preserve/restore pins; no application constraint was
weakened.

A preceding browser pass reported one React hydration error 418 without its route.
All functional assertions passed, and the diagnostic rerun with path capture did
not reproduce it. Its cause remains unresolved and is handed to the existing
navigation/integration investigation. A clean rerun does not prove it impossible.

Additional asset checks verified five served PNG dimensions/MIME types, the ICO
directory and HTML icon links over locally verified HTTPS. Visual inspection
covered the smallest favicon, central maskable crop and four share-card fixtures
with square crops. New document links resolve.

Reproduce browser acceptance after starting the repository's isolated preview:
`node --import ./tests/register.mjs scripts/qa-medium-browser.mjs <artifact-dir>`.
Use the documented Node 24 runtime and the preview's certificate in
`NODE_EXTRA_CA_CERTS`. The script guards the disposable database and restores
preexisting fixture post/pin/church fields after empty-state checks. It creates
only fictional actors/content there and writes private evidence in the ignored
artifact directory. See [brand reproduction](BRAND_ASSETS.md) for asset commands.

## Remaining gates

Private task/knowledge records retain the real device and provider limits.
Physical Samsung review and shortcut refresh/re-add behavior remain unverified.
Manifest start URL/scope, service worker, push, resource share-preview eligibility,
SEO policy and integrated acceptance remain with their existing foundation owners.
The workflow adoption documentation is local; subsequent fresh-session discovery
and automatic instruction loading remain unverified. No new schedule or owner
notification was created. Final batch review remains last and open.
