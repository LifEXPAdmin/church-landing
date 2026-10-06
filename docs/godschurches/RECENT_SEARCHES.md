# Opt-in recent searches

Explore offers recent searches for posts, people, churches, events, topics,
listings, media, volunteer opportunities and listed groups. The preference starts off. Signed-in members can
enable it for their current account in this browser, remove one entry, clear all,
or turn it off and delete the stored preference and history.

Only explicit search submissions are recorded. Opening, restoring or reloading
a results URL never adds its query back. History stores query/category/time,
not result payloads, permission grants, church filters or pagination cursors.
Following a history link runs the ordinary current-permission search again.
The [resource search adapters](UNIVERSAL_SEARCH.md) own resource discovery;
recent history does not change saved-item permissions.

The versioned browser store is scoped by account ID, bounded to 20 unique
query/category pairs and 200 characters per query. Display excludes entries older
than 30 days; subsequent actions rewrite the current filtered set. Stored data
remains on this browser until overwritten, cleared, disabled or browser storage
is cleared. It is not a cross-device account setting or an encrypted store.

The UI reads only after checking current sign-in and conceals on blur, page exit,
hidden visibility or offline transitions. A different account cannot adopt the
old component's history. Cross-tab storage changes invalidate pending reads.
Actions read the current stored value, never save an older displayed list.
Recording also rejects a storage change while identity verification is pending.
Storage failures remain visible; Search still works. Optional recording waits
at most 1.5 seconds before normal navigation proceeds.

## Verification and limits

Focused storage tests cover default-off, owner scoping, clear/remove, stale
snapshots, opt-out, bounds, category validation, expiry and blocked storage.
The browser fixture mounts the actual React search form and uses real browser
storage, navigation and keyboard controls. It covers current-account changes,
delayed identity reads, cross-tab clearing and storage failure. Its identity API
is mocked with fictional users; it is not database or hosted acceptance.

Run the browser check after a build, with a new artifact directory:

```sh
RECENT_SEARCH_QA_DIR=/absolute/task-artifacts/browser-run node scripts/qa-recent-searches-browser.mjs
node --import ./tests/register.mjs --test tests/recent-searches.test.ts
```

This source change has no schema migration, new dependency, production writes
or deployment. Full application/live acceptance and the existing release gates
remain separate from component checks. Resource-adapter expansion now has its own acceptance record linked above.
The production-build baseline reproduced a native unfocused-window leak after a
real cross-window storage event and delayed actual identity response. Reads now
require visible, online, focused state before dispatch and before settling; passive
background hints cannot restore history. The native two-window regression is
`scripts/qa-recent-search-foreground-browser.mjs` with `RECENT_FOREGROUND_HEADED=1`
and an isolated HTTPS fixture directory. Playwright's forced-focus emulation is
disabled for that check. Final browser acceptance is pending.
