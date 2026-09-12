# Shared post and reply composer

## Scope

Post and reply creation use a centered desktop dialog and a viewport-aware mobile
editor. Close and Save draft remain at the top; Post or Reply stays at the bottom
while the writing area and optional tools scroll. Writing comes first, with
category/Scripture/link/topics, author/audience/reply choices and saved photos
available in compact groups. Replies identify their parent conversation. Existing
Home, church, post discussion and draft-library entry points use the same shell.

The current controllers and services remain authoritative. Closing provides save,
discard-unsent or keep-writing recovery. Unknown requests retain exact retries;
known conflicts permit review or explicit abandonment of the local working copy,
without deleting or overwriting the saved draft. Ordinary discard restores the
acknowledged ID/version and complete payload. Starting another post preserves
independent work guards. Existing church/event permissions, photo sources and
older unresolved reply choices remain protected.

No schema, provider, contact policy or quote-draft behavior is introduced.

## Verification

Twenty isolated built-browser groups pass: seven shared-editor groups, five
comment-reader groups, three comment-draft recovery groups and five existing
participation-card groups. These cover actual post/reply publication, exact lost
save/send retries, newer unsent entries, conflict review/replacement/discard,
private library resume, independent saved work, both reply modes, older snapshots,
revoked church access, account changes, nested dialogs, Back and focus restoration.
Existing poll setup, ballots, event and volunteer controls continue to work.

Twenty-four controller tests, two release-content tests and twelve private-workspace
service tests pass. Scoped lint, TypeScript and production build pass; the runtime
check covers 121 traces, 10,296 entries and 300 server JavaScript files with no
private artifacts. Visual inspection verified actual light/dark surfaces,
320/390/1280 widths, enlarged text and a reduced keyboard viewport. The current
shared-editor browser entry point is `scripts/qa-composer-shell-browser.mjs`.
Physical phone keyboard acceptance remains separate from automated simulation.
All application writes were confined to isolated fictional accounts.

A fresh encrypted production backup and isolated PostgreSQL 17 restore preserved
all 75 tables and original-column fingerprints. The read-only preflight matched
all 30 migration checksums. No migration or production data write was applied.

## Release

Product `2026.09.12.21`, application `4c515835cc54c4bafef9a8f083e27d556f64c6a5`,
is live on READY deployment `dpl_E3KFyqpXTGLTkbDU73WRMgRRC2oA`. Independent
canonical assignment and serving identity match. Six live read-only checks at
16:56:30 UTC passed with zero application writes or browser errors; runtime error
rows were zero. Live checks cover the serving version, public reading and actions,
private composer/draft API rejection for guests, Explore and account returns,
current/retained notes and safe update. Authenticated save/publication behavior was
verified against the isolated production build, without creating production posts.
No schema, provider or permission change. Parent integration and physical owner
acceptance remain open.
