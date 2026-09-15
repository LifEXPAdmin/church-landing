# Discovery feeds acceptance

September 15, 2026 UTC · implemented, deployed and verified live.

**2026.09.15.1 / ee6071ccb9787bcb999a8ad9edb5dacd9d4dded8** is READY in
**dpl_92BSPBt8tXvWFxPZz93aWi74bSFS**, independently assigned to
**godschurches.com** and confirmed by the serving build endpoint. READY at
**06:46:26.038 UTC**. The feature uses application source
`3c731b615a2829e459e6cad74d203da430968bc3`; the final commit adds the required
build-cache repair and emitted-renderer guard. See [the contract](DISCOVERY_FEEDS_CONTRACT.md).

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

## Verification

| Check | Actual result |
| --- | --- |
| Discovery foundations | 52 passes, including independent recovery, withdrawal and erasure; populated upgrade and dump/restore pass |
| Earlier complete discovery gates | Three 139-file gates pass, each 864 executions / 862 passes / two expected disabled skips / zero failures or cancellations |
| Current complete release gate | Candidate passes all 140 discovered files: 871 executions / 869 passes / two expected disabled skips / zero failures or cancellations |
| Application built-browser acceptance | 13 suites / 97 groups pass, zero browser errors, no diagnostic instrumentation |
| Final cache-repair browser checks | 32 additional groups pass across discovery, original feeds and profile navigation; no browser errors |
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

## Publication, recovery and live evidence

The initial `8e227e6` deployment installed the backport but restored an old
Webpack renderer module. Live asset verification failed before acceptance.
`ee6071c` namespaces that cache and checks actual App Router manifest assets in
every build. The gate rejects the actual stale production bundle. The final
Vercel build and live browser load the repaired 173,096-byte renderer with SHA256
`2b7c5f99a8710e52520e7d0dc25c9fb65fd7c06e0a1d6cfee97276e0a452a3b7`.
No instrumented asset was released. The complete application gate remains tied
to `3c731b6`; the build-only repair has fresh types, scoped lint, five installer
checks, emitted-output validation and the 32 browser groups above.

Twenty-six public, four secured health and six actual signed-in checks pass.
Public checks include twelve serial Public-feed reloads at 320/390/1,280 pixels,
all eleven modes, deployed town search without private coordinates, guest and
account-mismatch denials, safe Settings sign-in returns, canonical posts and
release/help continuity. Signed-in My feed reaches three genuine permitted posts,
settles its controls and bookmark state, and exposes explanation and finite
navigation. Private Settings loads filters, hidden/feedback controls and presets;
direct For You navigation preserves the saved Latest default. No Save or delivery
command was used. Browser errors and scoped final-deployment error/fatal rows: zero.

All 55 migration names/checksums and installed recovery checksums match. Protected
54→55 upgrade preserves original columns across 100 tables and completes protected
replay. Installed ordinary 55→55 restore passes for 100 tables; plaintext is removed.
The nightly job verifies 41 encrypted sets, zero issues/removals, and the approved
28-day expiry within the 30-day maximum. It still requires the awake workstation.

Original-column fingerprints across 17 production tables match. New post
classifications, private discovery preferences, recovery controls, test user-data
changes and outbound sends are zero. Live reads create five bounded, temporary
reading-set metadata records, counted separately from user data.

The final deployment is on the existing Hobby project in iad1, Node 24 with Fluid
Compute configured. Its build machine has two cores and 8,192 MB; queue 107.969 s,
build/publication 102.601 s, total 210.570 s. Actual provider output passes 158
runtime traces / 47,234 entries / 399 server JavaScript files. This differs from
the local artifact count above; neither count establishes runtime memory usage.

Twenty serial public GETs from the workstation use a new connection per sample,
five per route. No forced cold state or concurrent load is claimed:

| Route | TTFB median / maximum | Total median / maximum |
| --- | --- | --- |
| Release identity | 110.0 / 150.0 ms | 110.4 / 150.1 ms |
| Home, Latest | 174.1 / 289.7 ms | 204.5 / 316.8 ms |
| Chicago town search | 103.0 / 137.8 ms | 103.2 / 138.2 ms |
| Public health | 110.5 / 200.3 ms | 110.9 / 200.6 ms |

These small-sample server observations do not establish browser paint, a cold-start
bound, physical-phone feel or the separate unmet 100-client capacity target.

## Remaining acceptance and recovery limits

Engineering/service/interface scopes are complete. Physical-phone gestures,
keyboard/return behavior and larger-text browser-edge feel remain in the existing
cross-surface acceptance owner; browser emulation does not satisfy those criteria.
Actual operator coverage and other provider/device prerequisites retain their own
owners. Future short-video and feedback modules are not activated by this feature.
Final batch review stays last; continue the next independently eligible priority.

Recovery must retain migration 55 and its protected privacy/removal semantics.
Prefer a forward repair; do not downgrade schemas, erase reading preferences,
restore removed classification or reactivate older consent to roll back UI.
