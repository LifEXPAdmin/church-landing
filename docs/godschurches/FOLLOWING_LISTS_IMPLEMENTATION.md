# Private following lists implementation

## Local candidate, 16 September 2026 UTC

The private following list contract is implemented for isolated acceptance.
Product candidate **2026.09.16.13**, release **private-following-lists**.
The currently verified production application remains **2026.09.16.12**.
Built-browser, complete release gate and exact production acceptance are pending.

Reuse SocialPreferences with three additive fields, independently versioned from
discovery forms, and existing follow records. Twenty private lists may each hold
100 current follows. Names and membership are account-owned. Current personal
follow IDs and church follow epochs prevent silent membership revival. Canonical
unfollow, block and friend-removal paths remove matching entries and record an
opaque protected recovery version. Erasure removes the owning preferences.

The private Connections page supports creating and renaming lists, atomic name
and membership edits, bounded follow search and pagination, explicit feed use,
deletion and restrictive recovery. Deleting a selected list preserves a tombstone
until the owner chooses a new selection; it never deletes follows. Settings,
account returns, product help and release notes are integrated.

Following intersects each list with current follow, post audience, source, mute
and block rules. Reading sets and retained-card availability bind to the owned
list version. Older feed and discovery forms preserve independent lists. List
documents are read only for Following; other feed modes avoid that payload.
Private names are concealed on foreground/account rechecks. Forms retain their
original version and exact uncertain request. The existing Exchange private-save
hook is extracted without behavior changes for reuse by the list editor.

Verification so far:

- The nine focused list checks pass, including owner isolation, exact/concurrent
  saves, epoch and audience changes, selected-list deletion, old-form compatibility,
  protected restore, export/erasure, unfollow journals, atomic editor saves and
  explicit list/picker bounds.
- The related 15 discovery and 14 legacy-feed tests pass in the prior focused
  run. The fresh combined 38-test run also passes after the read-cost adjustment.
- Ninety-six fresh migrations and populated upgrade preservation pass. The prior
  combined 38-test run also passes dump/restore. Tests use isolated fictional data.
- TypeScript and website copy checks pass. Full ESLint has zero errors and the
  same 35 existing fixture warnings. No production writes or recipient sends.

The first isolated run caught the missing recovery kind in database constraints;
the migration now updates both explicit allowlists. Two invalid post fixtures
were corrected to obey existing audience/church constraints. A legacy-feed test
caught a changed synchronous validation contract; that contract is preserved.
These failed checkpoints are diagnostic evidence, not release acceptance.

The initial built candidate passes seven real browser groups: guest returns,
lost-successful-response retry after foreground recheck, atomic editing and
unsaved navigation, mobile/enlarged dark layout, actual filtered feed selection,
account-switch concealment, current block and selected-list deletion. The browser
fixture selectors were corrected to target the intended guest link, the native
follow picker and the existing List view. No application error was observed.
A further editor change compares the current visible member projection as well
as the saved version, so a suspended/unavailable member also conceals stale
identities. Its additional built-browser acceptance is pending.

The initial isolated client bundle comparison adds **940 gzip bytes** to Home
and My feed, **125** to Connections and **151** to Exchange. The new private list
route totals **153,224 gzip bytes**, including shared application chunks. There
is no added dependency. These local compressed sizes do not establish latency.

The bounded local query fixture uses 100 follows/posts and 20 lists of 100 entries
each. The selected and unselected post-page projections have the same SHA-256.
The owned list document is 227,673 bytes; other feed modes do not read it. The
private editor returns 100 members and a 20-candidate page in 23,058 response
bytes with 15 SELECTs. Exact timings and feed query counts remain in the private
measurement receipt; these are isolated local observations, not hosted targets.

Complete the browser/privacy/mobile checks, measured query and bundle review,
full clean gate, protected pre-migration replay, exact READY/canonical deployment,
live read-only acceptance and private task reconciliation before closing scope.
Then continue eligible church Needs work. Final batch review remains last.
