# Search, Home and display copy review

## Candidate, 18 September 2026 UTC

The review starts from the published private-following-list application. The
unfinished Church Needs feature is checkpointed separately and is not part of
this release. No schema, provider, ranking or permission change is included.

Live Mac browser reproduction before editing returned two public matches for
prayer, both signed out and signed in. Changing category produced a correct empty
state; Back briefly showed only the Posts heading before results returned. A
persistent search or backend failure was not reproduced. The focused repair
renders loading immediately, explains concealed results, provides explicit resume
and rechecks access after restored history. Existing query, category, filters,
cursor and current audience owners are retained.

The persistent layout still owns one update detector and the draft-workspace
guard. Routine checking and current-version status move to the existing footer.
Actionable update, offline and connection recovery notices remain above the page.
Notes do not reload or resolve work, and dirty/saving/conflicted work still prevents
refresh. No duplicate detector, polling loop or dependency is introduced.

Home puts the four main feeds in a labeled button group, keeps the additional
feeds in a secondary selector, and has one deliberate refresh action. List,
Pages, full-screen reading, exact preference retries and remembered choices retain
their owners. The reading-break configuration moves into Feed Settings while its
timer stays mounted and its due reminder remains visible. Compact spacing keeps
the mission and signup invitation. Feed ranking and pagination are unchanged.

Platform-authored display copy, metadata, installation labels and account-message
templates use God’s Churches. URLs, code identifiers, stored member content and
historical release notes remain unchanged. The current feature guide and release
notes describe only this bounded change.

## Isolated acceptance

Types, website copy and the final production build pass. Full lint reports zero
errors and 35 existing fixture warnings. The build verifies 205 runtime traces,
67,632 entries and 516 server JavaScript files with no private fixture or
environment files. The existing hydration repair is retained and verified.

The final built candidate passes eight search groups, eleven discovery groups,
seven current-composer groups and seven focused review groups. The earlier
four-feed candidate also passes eleven groups; its later reminder-visibility
change is covered by the final discovery suite. These checks include restored
query/filter/history, concealed-result resume, loading and retry, account changes,
exact preference requests, finite pagination, unsaved work, publication conflicts,
revoked permissions and keyboard focus. The reading reminder still appears when
both its disclosure and Feed Settings are closed.

The focused review checks 1348, 390 and 320 pixel layouts, all eleven feed choices,
one refresh action, the quiet header, footer update checks, prominent actionable
update/offline notices, preserved draft text and installation identity. Desktop
and narrow screenshots were inspected; the first desktop post starts at 768
pixels in a 1348 by 926 viewport. These are isolated browser observations,
not physical-phone acceptance. The old draft-controller browser script uses an
obsolete composer selector; the current composer suite and focused update test
provide the applicable acceptance. The discovery script's old eleven-option
selector assertion was updated for the requested four buttons and seven
secondary choices before its complete passing run.

Unique route-plus-layout JavaScript, gzip level six per file, totals 222,604 bytes
for Home, 154,326 for search and 150,644 for Menu. These are local bundle sizes,
not latency or comparative speed claims. No dependency, polling loop or database
query was added. Search retains its existing foreground/current-authority read
and adds a read only when restoring a persisted history page or explicitly
resuming concealed results. The footer uses the existing detector and request.

The pre-release read verifies all 96 production migration checksums and the
installed recovery registry, with no pending migration. A fresh encrypted copy
restores 131 tables and the same 96 migrations; plaintext restore files are
removed. The scheduled backup validation reports 69 encrypted sets and no issues.
These operations do not modify production data. This release has no migration.

The clean full regression gate remains in progress. Exact READY/canonical
identity, live acceptance and private-record reconciliation remain required.
