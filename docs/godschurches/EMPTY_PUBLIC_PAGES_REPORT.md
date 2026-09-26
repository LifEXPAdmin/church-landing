# Public page empty states

Updated 26 September 2026 UTC. Local verification passed against application
commit `b3c490af9f3465dce043d8376db4744f33e0e8e8`.
Integration and production acceptance remain open with the designated release owner.

## Behavior

Home, Exchange, Gather and Serve give visitors a working next step when their
current page contains no entries. Empty content remains inside the existing
current-account and current-audience read boundaries. Loading, invalid input,
expired cursors and unavailable reads retain their existing separate states.

- Gather distinguishes an empty public directory, a search with no matches and
  an empty pagination page. It offers church discovery and the appropriate
  signed-in group choices or sign-in destination. Filter resets remove only the
  current search choices; returning to the first page preserves those choices.
  A next-page suggestion appears only when a next cursor exists. Private
  invitations distinguish filtered misses from having no current invitations,
  with a reset that stays in the private invitations view.
- Serve distinguishes an empty directory, a filtered miss and an empty
  pagination page. Visitors can explore church pages, clear actual filters or
  return to the first page while keeping their search. Guest text no longer
  refers to an account they have not signed into. Existing next-page links
  continue to depend on a returned cursor. Guests can sign in and return to
  their private applications; signed-in users can open those applications
  directly. Current source and eligibility checks remain inside the existing
  application reader, including its minimal history and withdrawal behavior.
- Exchange uses validated search criteria to distinguish real filters from
  default choices and sorting. Empty initial pages, filtered results, saved
  listings and pagination pages receive the appropriate explanation and
  recovery links. Eligible members can open a private draft; guests can sign
  in and return to the listing editor. Draft creation and publication continue
  to use the existing permission checks and deliberate actions.
- Home preserves the selected feed and its existing preference behavior.
  An empty requested reading page is described as an empty page rather than an
  empty community. A real continuation cursor exposes a working continuation
  link even when that page has no visible cards. Refresh retains the selected
  feed, account scope and display mode. Fresh empty Latest offers community
  discovery; the existing Friends sign-in, invitation and Latest choices remain.

## Implementation and runtime scope

The affected page owners are
[Home](../../components/platform/home-feed-page.tsx),
[Exchange](../../components/platform/exchange-page-ui.tsx),
[Gather](../../components/platform/group-page.tsx) and
[Serve](../../components/platform/volunteer-page.tsx).

The change adds server-rendered guidance and ordinary navigation links. It
introduces no client component, client-side hook, dependency, database query,
background request, schema change or migration. New links disable speculative
prefetch where supported. Existing data owners, permission checks, read
revalidation, account pinning and saved feed preferences remain authoritative.
Additional rendered markup is limited to the applicable empty state; no runtime
performance improvement is claimed.

Gather imports the existing control classes directly from the neutral
[control styles module](../../components/platform/portal-control-styles.ts).
This reuses the release owner's prepared shared-value repair so that server
rendering receives a class string. It changes no control styling values and
avoids importing a value through a Client Component boundary.

The [account return helper](../../lib/platform/account-entry.ts) now accepts
the existing Serve list, applications, new, opportunity, edit and coordinator
applications destinations. Public list returns retain only a bounded, trimmed
search and a valid church reference. Private destinations drop all query and
fragment state. Actions, unsent application details, authentication tokens and
account-bound cursors never replay through sign-in. Unsupported destinations
retain the existing Home fallback.

## Verification checkpoint

The final production build passed, including verification of 231 runtime traces.
Focused ESLint, TypeScript, authored-copy, six repository links and diff checks
also passed.

- Twenty HTTPS browser groups passed on the built source. They cover genuinely
  empty data, filtered misses, guest and member actions, permitted account-return
  destinations, preserved Home feed choices, invalid-input errors, keyboard
  navigation and layouts at 320, 390 and 1280 pixels. The Serve sign-in action
  completed an actual email/password login and returned to private applications
  without creating an application.
- Twenty-eight pure checks passed: four in `serve-account-navigation.test.ts`,
  twenty in `reader-navigation.test.ts` and four in
  `relationship-settings-navigation.test.ts`. These checks cover supported
  destinations, bounded public filters, malformed or repeated parameters,
  private-state removal and unsafe paths without database writes.
- Sixty related checks passed serially in the isolated fictional environment:
  eleven Exchange input and signed-cursor checks, fourteen Home feed checks,
  twenty-two Gather checks and thirteen Serve application checks. The runner
  completed in 128.001 seconds with zero failures, cancellations or skips.
  These checks started after the fresh-empty browser assertions and exercise
  existing preference, audience, private invitation, eligibility, application,
  withdrawal and recovery boundaries.

Browser pagination coverage includes empty terminal pages for Gather and Serve,
an Exchange API-returned signed page cursor and first-page reset, and a Home
legacy before/cursor page with refresh preserving the feed and display mode.
Malformed Home feed cursors retain their explicit error. An empty visible page
that still has a non-null continuation cursor was source-reviewed but was not
reproduced in the browser matrix.

The existing Communities and Exchange browser scripts retain their scenarios
with updated empty-state assertions, including the filtered private invitation
reset. Those two complete legacy browser suites were not rerun in this pass.

## Integration and remaining acceptance

The designated release owner must reconcile this branch with the pending
calendar release and the shared control-style repair, then verify the combined
source, complete the required regression gate, and record deployment, canonical
domain, serving identity and live behavior before product closure. Local
verification alone does not establish integration or publication.
