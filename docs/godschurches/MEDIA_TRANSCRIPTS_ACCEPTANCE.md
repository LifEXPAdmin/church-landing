# Media transcripts and chapter markers

## Scope

This checkpoint adds manually supplied transcript text and ordered chapter markers to the existing media catalog. Publishers can save private drafts, review and publish text, and revise an item through the existing owner-pinned editor and exact-request retry path. Readers can search the authorized catalog by transcript text and search within the current transcript using accessible, literal text matches.

Transcript text is plain text, bounded at 60,000 UTF-16 code units. Up to 100 chapters contain only a title and a whole start time in seconds. Times are unique, strictly increasing and strictly before a known duration. An unknown duration stays unknown; the reader explains that its markers have not been checked against the recording length. Chapter markers do not seek or activate an external player. This feature generates no captions and adds no upload or provider integration.

## Implementation

- The canonical validator normalizes line endings and rejects invalid text, malformed chapter objects, out-of-order times and excessive input without truncating saved content.
- Catalog search applies the existing audience, account, blocking, source and rights rules before counting and paging. Full transcripts and chapters appear only in authorized detail, editor and account-export projections; library and playlist cards retain their smaller projections.
- Publication review covers transcript and chapter text. Empty additive fields preserve existing rights fingerprints. Content-bearing rows reject stale editors that omit the new fields.
- The editor retains raw invalid chapter input, associates its error with the offending field, and preserves unsaved text during existing session concealment. An uncertain save retains its original body and mutation identity. A changed account cannot send that request.
- The reader searches literal text with a maximum of 100 displayed matches, renders supplied markup as text, and clears its search state when the current authorized item is concealed or replaced. No transcript query is persisted in a URL or browser storage.
- Only the media catalog receives a 512 KiB request and receipt-fingerprint budget. Other social domains retain their existing limits. The editor checks the serialized request size before attempting it.
- Existing account export, deletion and protected recovery include the new fields. Removal and recovery scrub transcript content even when an older writer does not know those columns.

## Migration and compatibility

`20261007234500_media_transcripts` adds two default-empty fields, validates their shape in PostgreSQL and protects content-bearing rows from older authoring writers. Restrictive cleanup, unpublishing and revocation remain available. The current writer marker is transaction-local and follows canonical authorization.

The first populated backup restore exposed an unqualified function reference under PostgreSQL's restricted restore search path. All user-defined function references are now schema-qualified. The repaired run preserved all 165 populated-table fingerprints, retained the old-writer denial after restore, and applied all 127 migrations to a fresh schema containing 166 tables. Both temporary verification databases were removed. The original failed restore remains in private evidence.

## Local verification

Completed checks at this checkpoint:

- Seven pure input groups, including Unicode bounds, malformed text and exact duration edges.
- Eleven new service and retention groups, including private search counts and pagination, legacy rights compatibility, old-writer transaction rollback, exact retries, export, erasure and protected replay.
- Thirty-nine existing media, Scripture and playlist service groups. Two affected existing cloned-row fixtures were corrected for Prisma's JSON input types; their pagination and resource-sitemap tests passed again.
- Full TypeScript check and focused lint.

- Final Node 24.20.0 production build `nE37mJwtv3hUClLTGRxDK`, bound to 1,569 unchanged source inputs. Copy, hydration, runtime-trace and public-build security checks pass.
- Seven actual trusted-HTTPS groups: three new transcript groups and four catalog/playlist regressions. Two enforced-MFA groups were skipped because this isolated fixture runs with MFA enforcement off; they establish no enforced-MFA acceptance. They include complete 60,000-character multibyte text, exact receipt replay, audience concealment and unchanged unrelated-domain limits.
- Seven browser journeys: persisted authoring, retained invalid input and focused errors, concealment, reviewed publication, one exact retry after a committed response is lost and the account changes, authorized catalog/local text search, and revocation. The 320px reader remains usable with both 16px and 32px root text and actual keyboard navigation. Clearing search returns focus to the search field before the clear button disables itself. Screenshots were inspected; no page errors or external requests occurred.

The initial HTTP fixture used an unnormalized source acknowledgment. The browser driver initially reloaded the new-item route instead of the saved editor, then crossed browser chrome while cycling focus. These test setup errors were corrected without production changes. Failed receipts were retained, and the corrected test files were included in a fresh build before the final complete run. Final review also tightened the lifecycle test to enter distinct unsaved transcript text and a raw invalid chapter value, verify both survive every concealment cycle, and confirm the database remains unchanged. The search clear action now restores input focus, asserted before any test helper moves it. Lifecycle events and enlarged root text are bounded browser simulations; they do not establish physical-device or full browser-zoom conformance.

## Integration boundary

This branch builds on the preceding interchurch activity checkpoint. Apply the additive migration and regenerate the Prisma client when integrating. Preserve both new fields in any independently developed media writer, and reconcile the shared social boundary and operation changes with the release owner's branch. No package or lockfile changes are required.

Local acceptance does not establish merged, deployed, live, provider or physical-device acceptance. The designated release owner retains combined integration, release checks and live verification. Known hosted source-security gates are not waived by this feature.
