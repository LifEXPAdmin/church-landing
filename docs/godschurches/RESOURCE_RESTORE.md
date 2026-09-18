# Expanded resource recovery verification

Verified September 18, 2026, 19:50:36 UTC. This is an isolated recovery rehearsal
and operator-tooling checkpoint against the 100-migration application. It does
not change application behavior, production data or the current release.

## Snapshot and integrity

The fictional fixture contains 10,000 accounts, 100,001 posts, 502,363 comments,
12,003 listings, 1,000 groups, 5,001 calendar events and occurrences, 275 images,
and canonical Needs, contribution, Pantry pickup and group-event relationships.
The expanded fixture uses the existing command services and current permission
checks. The extra three listings include two preserved failed setup attempts.

An encrypted custom-format PostgreSQL snapshot restored into a fresh isolated
database. All 144 application tables plus the migration table matched their
complete row fingerprints and column definitions before protected replay. All
100 migration checksums matched. All 273 foreign keys had zero orphaned rows,
both before and after replay. Explicit non-FK checks also verified Pantry
replenishment links and the category/hub references inside request-item JSON.

The first asset inventory detected 700 files omitted when this local clone was
prepared. Every file was located in the original fictional capacity fixture and
copied without modifying that source. The final inventory contains 1,100 variants
and 359,996,300 bytes, with zero missing files. Two bounded AES-256-GCM archives
restored every variant byte for byte, with no regenerated replacement images.
The restored set has zero missing or orphaned files. Its combined SHA-256 is
`95bfc8082838463d20954071aea28279935494fa7821f0ba7a99b295072b265d`.

| Observed phase | Time |
| --- | ---: |
| Encrypted database copy, 11,652,088 bytes | 0.603 seconds |
| Authenticate, decrypt and restore database | 3.665 seconds |
| Copy and encrypt both asset archives | 1.177 seconds |
| Authenticate and restore both asset archives | 1.217 seconds |
| Protected journal replay | 0.212 seconds |
| Complete rehearsal, including inventory and integrity checks | 20.045 seconds |

These are one local workstation observation, not a production recovery-time
guarantee. The independently running second worker was preserved.

## Protected recovery and failure diagnostics

After the snapshot, the contributor withdrew the Need commitment and canceled
the confirmed Pantry pickup through their canonical services. The separately
protected journal was flushed and replayed into the older restored snapshot.
Recovery retired 112 sessions and 15 elevated grants and replayed 17 controls.
Old account tokens failed. Outbound work and traffic remained disabled, and
current authority review remained required.

Both resource owners were quarantined and canonical commitment-policy reads
returned unavailable. Historical rows are retained: the old Pantry row still
records `ASSIGNED`, but its authority key and private contact/note fields are
cleared, and its hub is unpublished with intake disabled. A historical state
label must not be mistaken for current permission or renewed consent.

Controlled diagnostics identified exactly one missing variant, one orphan file,
one orphan replenishment reference and one orphan JSON category reference.
The temporary changes were reversed or rolled back and the accepted restore
was checked again. Failed fixture attempts and final private receipts remain
distinct; failed attempts are not passing evidence.

## Actual external-media rehearsal

At 19:32:54 to 19:32:57 UTC, a separate read-only production inventory and
provider rehearsal copied all four current READY images, comprising 16 variants
and 3,199,916 bytes. Authenticated archive copying took 2.394 seconds and local
restore took 0.023 seconds. Every restored byte matched. The source-reference
inventory was unchanged, with zero missing or orphaned archive entries.

This used 16 provider GETs, zero provider writes, zero application writes and zero
recipient sends. The temporary ciphertext, independent key and restored files
were removed. The existing daily recovery job remains **database-only**; this
manual rehearsal does not claim a scheduled or continuously current media backup.
The dated result proves recovery of the inventoried objects, not detection of
historical corruption for which no independent original digest exists.

## Repeatable verification

`tests/resource-restore.ts seed` expands a dedicated fictional dense fixture.
`tests/resource-restore.ts rehearse` creates a uniquely named private run, performs
the encrypted dump/restore and asset checks, then tests newer protected controls.
Use the established test loader and private isolated configuration. The helper
rejects production and any earlier expanded seed; preserve a completed run and
use a fresh source clone when repeating the workflow. Do not target either
worker's active feature database. Private receipts contain exact environment and
run paths; none belong in the public repository.

The operator-only `lib/operations/resource-archive.ts` has no application route
imports or new dependencies. Each archive is bounded to 256 MiB of source bytes,
4,000 entries and 4 MiB per variant. Keys stay separate, files private, and prior
outputs cannot be overwritten. Complete authentication precedes plaintext
output; exact entry, size and digest checks precede atomic directory publication.

Five focused tests cover round-trip and no-overwrite behavior, missing or
changed-length source bytes, wrong keys/ciphertext, authenticated malformed
records, path traversal, missing/duplicate entries and unsafe files. Types,
focused lint, formatting and source-copy checks pass. A bounded independent
review found no blocking archive issue; its test-description correction is
included. See [backup operations](BACKUP_OPERATIONS.md) and
[protected recovery](RETENTION_OPERATIONS.md) for the separate operating gates.
