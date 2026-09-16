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
  run. A fresh combined run checks the final read-cost adjustment.
- Ninety-six fresh migrations and populated upgrade preservation pass. The prior
  combined 38-test run also passes dump/restore. Tests use isolated fictional data.
- TypeScript and website copy checks pass. Full ESLint has zero errors and the
  same 35 existing fixture warnings. No production writes or recipient sends.

The first isolated run caught the missing recovery kind in database constraints;
the migration now updates both explicit allowlists. Two invalid post fixtures
were corrected to obey existing audience/church constraints. A legacy-feed test
caught a changed synchronous validation contract; that contract is preserved.
These failed checkpoints are diagnostic evidence, not release acceptance.

Complete the browser/privacy/mobile checks, measured query and bundle review,
full clean gate, protected pre-migration replay, exact READY/canonical deployment,
live read-only acceptance and private task reconciliation before closing scope.
Then continue eligible church Needs work. Final batch review remains last.
