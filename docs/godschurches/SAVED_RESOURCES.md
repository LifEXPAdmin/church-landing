# Private bookmarks for supported resources

Bookmarks now retain typed references to event occurrences, Exchange listings,
media catalog items and volunteer opportunities in the existing private
collections. Source detail pages reuse the established bookmark control and its
current-account checks, concealment, version conflicts and exact retry behavior.
Collections can move or remove these references alongside existing post bookmarks.

Only a resource kind and identifier are stored. Every read and new save uses the
canonical resource-card resolver and current permission rules. Lost access,
withdrawal and deletion replace the preview with an unavailable placeholder;
no title, provider URL, event details or application data is copied into storage
or retry receipts. Unavailable bookmarks remain removable from the library.
Saving never grants access, RSVPs, reserves goods, applies to volunteer or downloads
media. Exchange favorites, saved media and playlists keep their specialized owners.

The additive migration extends SavedPostItem with nullable reference columns,
a type/pair constraint and owner/type/identifier uniqueness. Existing post
references and collections are retained. Old code remains compatible with the
new columns during a rollback; retain the columns and new bookmarks rather than
dropping user records. Account deletion and minimized export reuse the existing
saved-item owners. Export intentionally contains organization only, not source
identifiers or private previews.

Reads remain paginated to 20 bookmarks, with one extra cursor row. The shared
resolver batches by resource kind instead of querying once per bookmark. There
are no added dependencies, providers or background jobs. Browser status is checked
only when the existing bookmark control becomes visible and on access refresh.

## Verification

Local verification passed 35 real PostgreSQL service cases, 124 migrations with
populated-upgrade preservation and database dump/restore, six actual React/Chrome
groups, and the production build including type, lint, copy and runtime-trace
checks. Source security reported zero findings. Existing dependency-advisory and
publication gates remain separate.

Run `node scripts/test-post-workspace.mjs --saved-resources` in an isolated
fictional environment. It checks source revocation, reference-only persistence,
current status and retry access, duplicate races, account and collection isolation,
malformed references, deleted items and pagination. Existing draft/bookmark and
resource-card suites run alongside it. The runner verifies populated upgrade
preservation and database dump/restore, including constraints and retry receipts.

The browser harness uses the actual React controls with fictional HTTP responses.
It checks all four type submissions, keyboard control, remove/exact retry,
collection movement, current unavailable previews, changed account and narrow
screens with enlarged text. This is separate from the real PostgreSQL service
suite and is not a full hosted end-to-end or production acceptance claim.

```sh
SAVED_RESOURCES_QA_DIR=/absolute/new-artifact-folder SAVED_RESOURCES_QA_CSS=/absolute/build/.next/static/css node scripts/qa-saved-resources-browser.mjs
```

A deployment must apply the additive migration before serving this source,
pass the existing release gates and verify the canonical live site. No production
migration or deployment is included in these local results.
