# Website writing acceptance

## Published and verified, 16 September 2026 UTC

**2026.09.16.3 / clear-website-writing** is READY as
`a33e8d5c28b901cba2651b00f252a578ca0d6bc4` in
`dpl_DBmmzzCkBLPG2gubtT2vYR6gPjBa`. Independent canonical assignment and the
serving SHA/product build match. READY time is **05:02:55.204 UTC**; canonical
identity was verified at **05:03:41 UTC**. Runtime candidate `de9f665` is unchanged
by the later QA/report commit. This editorial release changes no schema,
account policy or provider configuration.

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

## Actual release acceptance

- **23 public live checks pass** at 320/390/1280px, covering actual public copy,
  accessibility, metadata, wrapping, release notes, mission/brand and the exact
  provider-verified hydration renderer. Browser errors and mutation requests are
  zero. Provider trace verification passes 189 traces, 59,758 entries and 474
  server JavaScript files, excluding private fixture/environment paths.
- **Four secured health checks pass.** Existing storage, notification, welcome,
  retention and scheduling configuration remains available with empty current
  queues. No maintenance run or notification probe was initiated for this change.
- **Three actual signed-in observations pass:** the exact version/header, revised
  unavailable-email wording and unchanged existing choices/two-unread count.
  No preference, read-state, device or browser-permission action was performed.
  Future welcome creation/replies remain isolated-fixture evidence; no real
  welcome or message was sent to test the editorial change.
- All **89 production migration checksums match**, with none pending. The earlier
  protected upgrade remains fresh; the installed recovery registry is unchanged.
  Across 121 production-table fingerprints, **120 are unchanged**. The existing
  daily 05:00 UTC retention worker removed exactly **five expired FeedSnapshot
  rows**, confirmed by its HTTP 200 completion log on the preceding deployment.
  That job removed no accounts, messages or reports and reported no failures.
  Release verification performed **zero user-data/test writes and zero sends**.
- Exact-deployment runtime logs from 05:02:55 to 05:05:35 UTC contain **zero error
  or fatal rows**, queried with a limit of 100 per severity.

The engineering feature is verified live. Reconcile private task/workflow
receipts and continue the unified queue; physical/operational prerequisites and
final review remain separate.
