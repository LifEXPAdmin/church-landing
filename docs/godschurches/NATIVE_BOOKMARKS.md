# Native bookmark adapter

The native v1 bookmark routes use the same saved-workspace service and database
as the website. Collection management, resource bookmarking and drafts remain
website operations. This slice enables post saving, moving and removing an
existing saved item, and reading the complete mixed saved library.

## Transport and contracts

- `GET /api/platform/v1/bookmarks` accepts an optional signed `cursor` and
  `collectionId`. Omit the collection for all items; `unfiled` selects items
  without a collection.
- `GET /api/platform/v1/bookmark-collections` accepts an optional signed cursor.
- `GET /api/platform/v1/posts/:postId/bookmark` returns the owner's current
  saved reference or null, after checking current source visibility.
- `POST /api/platform/v1/bookmarks` accepts only `save-item`, `move-item`
  and `remove-item`. Use the corresponding pure `apiContracts.bookmarkCommand`
  body. Every command requires the original mutation ID and expected version.

All routes require a bearer session and `X-Expected-Account`. Native transport
rejects browser credentials, Origin/Fetch Metadata, duplicate or unknown query
fields and unsupported methods. Responses are private, noncacheable JSON with
the existing v1 error vocabulary. The request limit is 16 KiB and the response
limit is 2 MiB. Optional capabilities are `bookmarks.read` and
`bookmarks.write`; admission pauses precede body consumption and database work.

Both lists contain at most 20 entries. Signed continuations bind endpoint,
account and collection, retaining their original one-hour deadline. They are
neither permission grants nor content snapshots. Restart at the first page on
`cursor_invalid`; every continuation checks current session and visibility.

The canonical service retains its limits of 100 collections, 2,000 saved items
and 20,000 immutable operation receipts. Native writes share the website's
workspace rate bucket. No extra per-transport quota or durable client cache is
introduced.

## Visibility and account ownership

The service checks expected ownership inside its existing session and permission
lock, before private reads or receipt lookup. Existing browser callers may omit
the owner argument. All saved-status requests now validate source
visibility through the canonical post interaction reader, including ordinary
posts. This repairs stale bookmark metadata exposure after withdrawal.

Unavailable list entries contain only the owner's saved-item ID, version,
collection ID and `available:false`. They never include a source ID, excerpt,
title or navigation target. An owner can still remove that private reference.

Available post previews use the website's selected safe excerpt and content note.
Resource cards preserve current Exchange, Church Help, calendar, volunteer and
media visibility. Their bounded projection includes only title, kind, ID, state,
canonical relative website target and event timing when applicable.
`requiresWeb:true` marks resource cards. No provider URL, event meeting URL,
coordinator contact, management fields or full private content is projected.

## Exact retry behavior

Keep the complete original command. A plain repost resolves to the original
post's bookmark; its original requested reference still participates in the
operation fingerprint. Quotes retain their own bookmark.

Move and remove commands target the saved-item ID returned by a read, not a post
ID resolved again during retry. Removing and later saving a post creates a new
saved-item ID. Retrying the old remove recovers its historical receipt without
deleting the replacement. Changed bodies sharing a mutation ID conflict.

A historical receipt acknowledges an earlier result, not current visibility or
current saved state. Refresh status/list explicitly after confirmation. Preserve
the original body on an unconfirmed outcome; never manufacture a new toggle,
version or item ID.

## Verification and acceptance

Run `node scripts/test-post-workspace.mjs --native-bookmarks` in an isolated
fictional environment. It includes native regression, existing saved-workspace,
resource and repost checks, migration preservation and dump/restore. Run the
pure `tests/native-bookmark-contracts.test.ts` and
`tests/native-api-policy.test.ts` checks, plus the existing portability gate.
The build's routes are exercised by `tests/native-bookmarks-http.test.ts` under
trusted loopback HTTPS. The existing `scripts/qa-saved-browser.mjs` verifies the
website bookmark flow against the same compiled application.

This source does not activate a native screen or establish device, store,
security, hosted CI or production acceptance. Integration requires the exact
tested source receipt and the separately accepted native transport/session
handoff. No schema migration or new dependency is required.
