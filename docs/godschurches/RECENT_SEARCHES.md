# Opt-in recent searches

Explore now offers recent searches for its existing posts, people, churches,
events and topics categories. The preference starts off. Signed-in members can
enable it for their current account in this browser, remove one entry, clear all,
or turn it off and delete the stored preference and history.

Only explicit search submissions are recorded. Opening, restoring or reloading
a results URL never adds its query back. History stores query/category/time,
not result payloads, permission grants, church filters or pagination cursors.
Following a history link runs the ordinary current-permission search again.
This change does not activate new resource types or change saved-item services.

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
remain separate from component checks. Broader resource-adapter expansion is
still outside this change.
