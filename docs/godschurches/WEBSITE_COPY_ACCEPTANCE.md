# Website writing acceptance

## Candidate, 16 September 2026 UTC

Application candidate `de9f665` prepares **2026.09.16.3 / clear-website-writing**.
Publication and exact canonical live verification are pending. This is an
editorial release with no schema, account-policy or provider-configuration change.

Authored Home/About text, form limits, calendar ranges, notification options,
relationship accessibility, message notices, report placeholders, role labels,
public help/features, release notes and social-image descriptions now use natural
sentences, colons, commas, parentheses or the word "to". Unavailable report
percentages have an explicit explanation. Future automatic welcomes put
"Andrew" on its own line; existing stored conversations
and member-authored posts/comments/messages are not rewritten. No verbatim
third-party quotation required an exception in the affected sources.

The standing rule lives in `AGENTS.md` and the existing workflow guide. The
build runs `check:copy` over application/shared/static sources. It handles
literals, TypeScript escapes/templates, HTML entities, generated character codes,
static metadata/accessibility and CSS-generated text, while preserving ordinary
hyphens, technical CSS/URL syntax and dynamic member content. This build tooling
adds no runtime dependency or client requests.

## Verification completed

- The source check passes **706 files / 45,941 authored fragments**.
- Types, scoped lint and diff checks pass. Eight focused test files contribute
  **60 passing checks**: the source/release contract, drafts, calendars, feedback
  aggregates, automatic welcomes and safe sharing images. The first service run
  caught the welcome template's old frozen checksum. Its authorized signature
  change updates that expected checksum; all seven welcome checks pass on rerun.
  The earlier failed receipt is retained rather than counted as acceptance.
- The clean production build passes the hydration and runtime-trace checks:
  **189 traces, 43,670 entries, 475 server JavaScript files**, with private fixture,
  environment and Prisma configuration-loader paths excluded.
- **39 isolated production-browser groups pass:** 21 rendered-copy/member-text
  checks, four mission/navigation groups, nine aggregate-report groups and five
  canonical-welcome/reply groups. Public pages fit 320/390/1280px; mission and
  conversation coverage also includes enlarged text, desktop and theme changes.
  Reviewed narrow About and report screenshots show readable wrapping.
- The report harness temporarily excludes only existing fictional actors and
  restores their prior inclusion flags, so reused fixtures cannot invalidate
  empty/cohort assertions. Mission assertions use the current composer button and
  Feed choices navigation. Earlier harness failures and their corrections remain
  in the private receipt. Final browser runs report no page errors.
- A fictional member post containing em/en dashes and double hyphens remains
  byte-for-byte identical in the database and the actual reader. All browser
  writes and welcome replies above use the guarded local database with external
  delivery disabled. No real accounts, messages or preferences were changed.

The previous complete notification regression remains the full-suite baseline;
this copy-only change uses focused verification. No new capacity or physical
device claim is made. Preserve existing operational/provider/device prerequisites.

## Release acceptance still required

Verify the exact READY deployment, independent `godschurches.com` assignment,
serving SHA/version and actual public/signed-in copy. Confirm the unchanged 89
migrations and preserved production-data fingerprints. Record zero live test
writes/sends, reconcile private task/workflow receipts and continue the unified
queue. Keep final review last.
