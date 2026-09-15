# Interrupted streaming hydration

September 15, 2026 UTC · verified live in 2026.09.15.1 / ee6071c.

Production-build fixture diagnostics reproduced React error 418 while hydrating
an identical shared shell. The host div had already claimed its DOM node and
advanced to the skip link when an outlined Flight child suspended. A microtask
resolved that child; the renderer retried the same host fiber without restoring
its cursor, then compared the outer div against its own child link. The captured
fiber and hydration-parent fiber were identical. This establishes the failing
mechanism; a passing loop alone would not.

The mechanism matches React's [reviewed upstream fix #35494](https://github.com/react/react/pull/35494),
commit `c18662405cc436646411647f8a8965c1c0594c3c`. The installed Next 15.5.25
renderer lacks that cursor restoration. Next bundles its own renderer; changing
the application's react-dom dependency alone does not replace it.

`scripts/patch-next-hydration.mjs` backports the upstream logic at its sole host
replay call site in the four bundled development/production renderers. The
existing MIT attribution is retained. Installation and build both verify the
exact Next version and original SHA256 of every full file before applying the
patch; cached patched copies must reconstruct those same hashes. An unexpected
version, changed file or changed cached patch stops the build before any patch
writes. The backport adds no runtime dependency, account reads or network calls.
It does not remove DOM nodes, disable server rendering, suppress warnings or
ignore browser errors.

Remove the backport and its exact version pin when a reviewed Next upgrade
includes the upstream repair. Do not change its checksums merely to make a build
pass. `node scripts/patch-next-hydration.mjs --check` verifies installation.

The first discovery deployment exposed a second build boundary: Next explicitly
excludes its own package from cache dependencies. Vercel restored the previous
Webpack cache, verified and patched all four installed renderers, then emitted
the old App Router renderer. Live asset inspection caught its missing cursor
restoration before feature acceptance. The follow-up namespaces Webpack's cache
version with the upstream repair and verifies actual App Router manifest assets
after every build. The emitted-code gate rejects the actual stale deployment's
renderer and accepts the repaired source build. It includes application error
and not-found entries; the separate Pages Router framework is not an App Router
input. A changed asset filename alone is not evidence that the repair is present.

The existing draft controllers also now retain the original empty, concealed
server snapshot for delayed hydration, while current client snapshots continue
to track identity, private drafts and unsaved work. Equal presentation cookies
no longer schedule redundant layout updates. These are independently checked;
neither change alone resolved the captured renderer defect. A footer-only
restructuring was tested and reverted after reproduction.

Five installer tests cover clean/cached installs, syntax, unknown versions,
unexpected renderer bytes, and altered cached patches. Thirty controller/display
tests cover existing recovery and stable private-data-free server snapshots.
Final browser acceptance passes 97 groups across thirteen suites, including twelve
streamed reloads, all feed choices, appearance controls, private draft/comment/photo
recovery, current account changes and the previously affected profile/navigation
paths. The uninterrupted complete gate passes 140 files / 869 checks with two
expected disabled skips and no failures or cancellations. All accepted builds
come from source and the verified installer, with no diagnostic instrumentation.
The build-cache repair also passes 32 fresh browser groups. Final canonical live
checks verify the actual repaired renderer bytes and twelve streamed Public reloads
without browser errors. The failed first deployment and accepted final identity are
in [discovery acceptance](DISCOVERY_FEEDS_ACCEPTANCE.md). Private edited-asset
probes remain diagnostic evidence only.
