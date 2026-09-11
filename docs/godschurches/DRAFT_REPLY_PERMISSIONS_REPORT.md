# Private draft reply permissions

September 11, 2026. Focused contract repair on `codex/draft-reply-permissions`,
based on released `bbbe500`. Implemented and verified locally; production
publication and canonical serving verification are pending at this checkpoint.

## Change

The existing `post-workspace.ts` service now preserves `replyAudience` in its
payload whitelist, stored snapshots, private single/list reads and publication.
Both `VIEWERS` and `CHURCH_MEMBERS` reach the canonical post service unchanged.
Missing/null legacy choices remain unresolved; publication requires an explicit
versioned save first. Reads do not backfill rows. Incomplete member-only drafts
remain recoverable even before a church is selected or after access is revoked.

The original complete request still determines the retry fingerprint. Old exact
receipts remain valid, changed bodies conflict, stale versions cannot overwrite
newer work, and publication rechecks current church/grant/event permissions
inside the locked transaction. No schema, provider, dependency, composer UI or
canonical post defaults changed. See [the contract](POST_WORKSPACE_CONTRACT.md).

## Fresh verification

- `npm run test:post-workspace`: 24 passes (12 workspace, seven canonical post,
  five search), all 27 migrations on isolated PostgreSQL, populated upgrade
  preservation and exact workspace dump/restore including receipts/tombstones.
- Four actual production-mode local HTTPS workspace/search checks and six
  account-export regressions passed. The established isolated HTTPS wrapper
  ran `tests/post-workspace-http.test.ts` and `tests/account-export.test.ts`.
- Ten existing draft-library browser groups passed at 320/390px, including owner
  isolation, pagination, stale discard, exact retry after lost acknowledgment,
  account switching, sign-out, empty/error states and private-storage boundaries.
- TypeScript, full lint, final affected-file lint and production build passed.
  Runtime tracing: 105 traces, 8,514 entries, 257 server JavaScript files; no
  private fixtures/environment files or Prisma configuration-loader path.
- Read-only production migration inspection: 27 complete, none pending, all
  checksums match. No migration applied and no production application writes.

Focused regressions exercise both reply modes through a second authenticated
session, complete snapshot edits, changed-key conflicts, delayed retries and
concurrent publish-once. Actual replies distinguish members from outsiders.
Legacy snapshots with and without a church stay unchanged on read/retry and
cannot publish until the choice is saved. Invalid/unresolved selections and a
missing church fail without consuming the draft. Revoked membership and revoked
church-publishing grants block publication for both modes. Initial fixture field
and explicit-choice corrections and local certificate setup are excluded from
passing-run evidence; normal TLS verification remained enabled.

## Remaining scope

Production verification is the remaining prerequisite before declaring the
shared autosave controller ready. Autosave/conflict status and composer resume
interfaces remain separate work. Rich media/poll/scheduled snapshots, parent
integration, owner acceptance and physical-device checks remain open. This
repair neither reopens the completed foundation nor completes those later gates.
