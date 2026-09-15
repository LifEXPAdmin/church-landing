# Discovery feeds acceptance

September 15, 2026 UTC · release candidate; not yet published.

Candidate application `3c731b615a2829e459e6cad74d203da430968bc3` identifies as
**2026.09.15.1**, release `explicit-discovery-feeds`. Production remains the topic
community release until the exact deployment, independent canonical assignment
and live checks below are complete. See [the contract](DISCOVERY_FEEDS_CONTRACT.md).

## Implemented feature

The existing four feeds remain intact. For You, Following, Your Church, Churches,
Local, Public and Favorites add explicit discovery over canonical, currently
permitted posts. Hard language, author-declared tradition, topic, post type,
hidden-word and coarse-area filters remain separate from ranking. Six private
presets can retain strict geography or an explicitly chosen, visibly labeled
expansion. No private faith, address, reading-time or prayer activity is inferred.

Home, My feed and standalone Settings use the same versioned preferences,
finite reading sets, explanation reasons and feedback. Hard-filter changes start
a new set; soft recommendation changes preserve the mounted set with an explicit
refresh notice. More/Less and Reset do not change follows, privacy or hard filters.
Guest choices remain on that browser. Unreadable choices require deliberate reset.

Authors can choose or remove language, tradition and broad locality per post.
Publishing locality requires explicit consent. Private drafts, edits, exact
retries, withdrawal, account export/erasure and protected restore preserve those
boundaries. An independent classification revision prevents unrelated moderation
or post changes from defeating a later removal receipt. Recovery of newer private
preferences requires review when the restored copy is incomplete.

Cold-load controls wait for installed event handlers. The shared renderer's
reproduced interrupted-hydration defect is repaired using the verified upstream
backport described in [the hydration report](HYDRATION_REPAIR.md).

## Verification so far

| Check | Actual result |
| --- | --- |
| Discovery foundations | 52 passes, including independent recovery, withdrawal and erasure; populated upgrade and dump/restore pass |
| Earlier complete discovery gates | Three 139-file gates pass, each 864 executions / 862 passes / two expected disabled skips / zero failures or cancellations |
| Current complete release gate | Candidate passes all 140 discovered files: 871 executions / 869 passes / two expected disabled skips / zero failures or cancellations |
| Built-browser acceptance | 13 suites / 97 groups pass, zero browser errors, no diagnostic instrumentation |
| Streamed reload regression | Twelve Public reloads preserve one interactive shell, appearance and canonical posts at 320, 390 and 1,280 pixels |
| Related browser coverage | Discovery/classification, old four feeds and cold-load selection, composer, draft library, comment reader/retry, retained privacy, photo recovery, profile pin, settings/display and topics |
| Focused controller/display checks | 30 passes, including account replacement and immutable empty server snapshots |
| Installer integrity | Five passes: clean/cached installation, syntax, changed files, future version and altered patch failures |
| Static checks | TypeScript passes; lint has zero errors and 35 existing unused-variable warnings |
| Protected production-copy upgrade | 54→55 succeeds; all original columns across 100 tables preserved; protected restoration complete; zero production writes |

Browser fixtures use fictional accounts and isolated PostgreSQL over verified
local HTTPS. Email and phone delivery are disabled. These checks do not establish
physical-phone installation, locked-screen delivery, or actual operator coverage.
The uninterrupted full gate uses PostgreSQL 16.15; the final production-build
browser fixtures and protected production-copy restore use PostgreSQL 17.11.

## Resource evidence

The attributed public town catalog contains 69,718 places across 245 country
shards. Exact decoded hashes are unchanged after compression: 4,711,979 bytes
become 1,355,796 bytes, a 71.23% reduction. The server retains at most eight country
entries and bounds decompression. There is no live geocoding request or new paid
provider, queue or schedule.

The actual candidate build has 158 runtime traces / 34,260 entries. Current
regular files across those traces total 12,663,443 bytes over 513 unique paths;
one directory reference is counted separately, without recursively adding its
contents. The client output has 230 JavaScript files totaling 2,231,820 bytes.
124 traces include the 1,355,796-byte country dataset. The built renderer's
cursor-restoration code is verified in the emitted asset. These are artifact
measurements, not deployed memory usage or a capacity guarantee.

A 1,000-post isolated dataset yields six samples per query case. Warm medians
exclude the first sample: Public new set 92.376 ms / 28 statements; For You new
set 132.969 ms / 30 statements; retained For You 36.569 ms / 25 statements;
continuation 46.928 ms / 25 statements; Following 87.153 ms / 28 statements;
Favorites 87.767 ms / 28 statements; strict Local 123.402 ms / 28 statements.
Cold US town search is 5.380 ms. Concurrent local regressions may affect timings.
Cases clean their own isolated reading sets; production limits remain unchanged.
These results do not satisfy the separate 100-client hosting target.

## Release evidence still required

The current gate is complete. Use the authorized Git publication process.
Verify the exact READY deployment, canonical assignment and serving SHA/version.
Check all 55 migration names and checksums, installed recovery registry, ordinary
installed restore, nightly recovery health, public and authenticated live behavior,
scoped runtime errors and actual hosting/latency evidence. Compare original
production data fingerprints; count reading-set metadata separately from user
data changes and outbound delivery. Reconcile existing private tasks only after
their own criteria are met, preserving physical/provider blockers and final review.
