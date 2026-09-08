# Stage 2B dependency review

Historical baseline reviewed September 7, 2026 America/Chicago (September 8 UTC),
on `codex/church-portal`. The September 8 release follow-up below supersedes the
earlier generic reachability assessment for its specifically captured artifacts.

## September 8 release follow-up

Scope: section 2 of the authorized release request. This subtask changes only this
report and ignored evidence, not source, dependencies, schemas, configuration,
other reports, commits, or the shared `.next`. No install, generation, build,
database access, production environment read, or live benchmark was performed.
The parent owns the authorized release. This is not an independent security review.

### Disposition for GHSA-ggr8-5vv4-36mx

**The vulnerable package remains installed and its failure is reproducible through
the actual Prisma configuration loader. It is not reachable from the inspected
HTTP entrypoints in the captured local runtime graph.** This is a bounded
source-and-artifact disposition, not a claim that deepmerge-ts is fixed, harmless,
absent from every production installation, or excluded from the eventual Vercel
deployment. Final-candidate trace verification remains required.

Fresh `npm audit --json` and `npm audit --omit=dev --json`, captured September 8,
2026, both exit 1 with **3 high entries, 0 critical, and one distinct advisory**:
`prisma@6.19.3 -> @prisma/config@6.19.3 -> deepmerge-ts@7.1.5`.
`npm explain deepmerge-ts` confirms the exact pins, the root dev dependency on
Prisma, and Prisma Client's optional peer on Prisma. That optional peer explains
the production-only audit result; it does not establish an import at runtime.

The registry's newest Prisma 6 version is still **6.19.3**, whose config package
still requires deepmerge-ts **7.1.5**. The [maintainer advisory](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx)
fixes versions below 8.0.0 in 8.0.0. No supported compatible Prisma 6 update was
available in this check. The audit suggestion of Prisma 6.12.0 is a downgrade,
not a current patch. Neither it nor an unvalidated deepmerge-ts 8 override was
applied. Next 15.5.25 and the existing security overrides remain unchanged.

### Installed calls and configuration boundary

The following are actual local installed-source references, not assumptions from
package categories. Fingerprints and excerpts are retained in the evidence directory.

| Stage | Exact evidence | Consequence |
| --- | --- | --- |
| CLI entry | `node_modules/prisma/build/index.js:4883` requires `@prisma/config` and calls `loadConfigFromFile({configFile: e})` | Prisma CLI configuration loading is a real consumer. |
| Loader | `node_modules/@prisma/config/dist/index.js:806`, `:825`, `:892` | `loadConfigFromFile` calls `loadConfigTsOrJs` even when there is no config file. |
| Actual import | `node_modules/@prisma/config/dist/index.js:893`, `:894`, `:917` | Dynamically imports c12 and deepmerge-ts, then supplies `merger: deepmerge`. |
| Restricted sources | `node_modules/@prisma/config/dist/index.js:907` | `dotenv`, `rcFile`, `giget`, `extend`, and `packageJson` are false. No remote extension/RC/default-layer permission follows from c12 being installed. |
| Actual c12 implementation | `node_modules/c12/dist/index.mjs:1` reexports `shared/c12.BXpNC6YI.mjs`; shared file `:136`, `:197` | Selects the supplied merger and merges override/main/RC/package/default inputs. Most inputs are undefined under Prisma's options. |
| Executable config and overlay | `node_modules/c12/dist/shared/c12.BXpNC6YI.mjs:365`, `:369`, `:372`, `:378` | Imports a JS/TS config, can call its exported function, and merges `$<NODE_ENV>`/`$env[NODE_ENV]` into the base. **Environment overlays are not disabled by `extend: false`.** |
| Vulnerable recursion | `node_modules/deepmerge-ts/dist/index.mjs:162`, `:178`, `:242`, `:281`, `:299` | Collects same-key values from input records and recursively merges them; the installed implementation lacks a visited-pair cycle guard. A single non-undefined value returns through the non-recursive branch. |

There is no `package.json#prisma` field and no Prisma config file among the 18
checked JS/TS module candidates at the project root and in `.config/`. The root
uses `prisma/schema.prisma` with `prisma-client-js`. The install lifecycle is
`prisma generate`; the reviewed migration wrapper spawns `prisma migrate deploy`.
Those build/operator commands can import the vulnerable loader. They were not
executed by this follow-up, and the migration wrapper's environment loader was
not invoked. A future config file/plugin can change this conclusion.

To trigger this advisory, two values reaching a merge at the same property path
must carry matching recursive object references. Plain request JSON is acyclic;
however, that is **only one part** of the boundary: server-side reconstruction,
executable config, a deserializer preserving references, or a config function can
create the required graph. Inspected app inputs are JSON/form/string values
validated into account/portal operations, not Prisma config objects. Account JSON
is limited to 8192 bytes in `lib/platform/account-boundary.ts:47` and parsed at
`:68`; size limits are not themselves a cycle defense. A scan of 100 app/component/
library source files found no deepmerge-ts/config-loader import or call marker.
No user-controlled config filename, dynamic config loader, or request-to-CLI
bridge was found in those application sources. The migration wrapper is an
operator script, not a route.

Three owned synthetic fixtures called **the installed** `loadConfigFromFile`
directly in separate processes with explicit `NODE_ENV=production`, no real
environment, no database, a 10-second timeout and a 256 KiB V8 stack:

| Fixture | Result |
| --- | --- |
| No Prisma config file | `resolvedPath: null`, no error; default config returned. |
| Ordinary config with synthetic schema path | Config loads, schema path resolves, no error. No schema/database access is needed. |
| Cyclic base `graph` plus a different cyclic `graph` in `$production` | `ConfigLoadError` containing `RangeError`; stack-exhaustion message confirmed. Error is caught by Prisma's loader; the probe process exits 0 after recording it. |

This proves a reachable **tooling** defect for a malicious executable config,
including with Prisma's restricted loader options. It does not show that an HTTP
caller can write such a config. The caught failure still prevents successful
configuration loading; do not expose the loader/CLI/Studio to untrusted users or
run attacker-controlled config with release credentials. No destructive/OOM test
or production exploit was run.

### All available NFT traces

Capture: **2026-09-08 15:39:33 CDT / 20:39:33 UTC**, checkout HEAD
`9b1354873d3f1665c37e96593af1cc42f688aa6a`, existing local build ID
`TVkJg3grzh0eIB6hO2FJH`. Trace mtimes span
`2026-09-08T04:00:28.167Z` through `2026-09-08T04:00:28.173Z`.
The build ID is not a Git SHA, and these mtimes do not prove which exact source
revision was compiled. No new build was run to change that uncertainty.

Every `.next/**/*.nft.json` was parsed recursively, resolving entries relative to
the owning trace, not by searching a few route names. All **40 traces** were copied
and hashed: **2 core-server traces, 3 Pages framework traces, 35 App Router traces**;
**3,056 entries / 739 unique resolved files**. Results:

| Package | Traces containing package files |
| --- | ---: |
| deepmerge-ts | 0 / 40 |
| @prisma/config | 0 / 40 |
| c12 | 0 / 40 |
| prisma (CLI, not @prisma/client) | 0 / 40 |
| @prisma/client | 22 / 40 |
| .prisma/client generated client | 22 / 40 |

This includes `/api/platform/account`, `/api/platform/portal`, all captured
church/directory/reviewer/sharing/operator pages, recovery/settings/login,
platform/profile/search pages, admin routes, other public routes, and both
`next-server.js.nft.json` and `next-minimal-server.js.nft.json`. The complete
per-trace file list, counts and SHA-256 values are in `runtime-traces.json`;
raw traces are in `nft-snapshot/`. No trace was omitted for being unrelated.

The account trace contains Client `default.js`, package metadata, and
`runtime/library.js`, plus generated `.prisma/client/default.js`, `index.js`,
schema, metadata and the local Darwin native query engine. The observed import
chain is `lib/prisma.ts:1 -> @prisma/client/default.js:2 ->
.prisma/client/default.js:5 -> #main-entry-point -> .prisma/client/index.js:30 ->
@prisma/client/runtime/library.js`. It does **not** go through the CLI/config loader.

All **91 generated server JS files** were separately searched for deepmerge-ts,
`@prisma/config`, `loadConfigFromFile`, and `loadConfigTsOrJs`: no marker hits.
Client import-specifier inspection found no loader/deepmerge import. The external
Client runtime does contain the text `@prisma/config` in bundled **package manifest
metadata** (`dependencies: {"@prisma/config":"workspace:*", ...}`), not a require/
import call. Literal package-name presence was therefore not mistaken for execution.

[Next's output-tracing documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
describes static import/require/filesystem tracing and its possible omissions or
over-inclusions. Consequently, this evidence supports non-reachability in this
captured local runtime graph, not a mathematical guarantee for dynamic code or an
attestation about actual Vercel function contents. The captured graph predates
the new demo and route-duration changes; it includes a Mac query engine rather
than production Linux binaries. The final release build and provider packaging
must be checked again. Keeping a complete `node_modules` installation can leave
the package on disk even though none of these request entrypoints imports it.

### Node 24, scrypt and function budgets

Parent-reported preflight evidence, received September 8 (not fetched from
production by this subtask): the **existing deployment's** Vercel
`/v1/deployments/.../builds` outputs show `runtime: nodejs24.x`,
`memorySize: 2048`, `timeout: 300`, Fluid enabled, Hobby plan. Parent also confirms
configured `UV_THREADPOOL_SIZE=4`. A local parent Node **24.20.0** test of four
simultaneous v2 hashes completed in **313 ms**, peak RSS **587 MiB**, verification
true. These are useful preflight inputs, **not an actual-server benchmark**.
The deployment ID and raw API evidence were not supplied to this subtask; the
parent must retain their non-sensitive provenance in the release evidence.

Current source was independently reread: both
`app/api/platform/account/route.ts:5` and
`app/api/platform/portal/route.ts:5` now export `maxDuration = 60` (parent change).
The captured old `.next/server/functions-config-manifest.json` has empty function
config objects, so it does not substantiate this new limit. **Verify the new
release's actual function outputs again**, expecting Node 24, memory 2048, timeout
60 for both routes, Fluid true and threadpool size 4. The old deployment's timeout
300 is not evidence that the new route limit took effect.

Official guidance checked September 8:

- [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
  supports 24.x and rolls minor/patch versions automatically. Installed engine
  declarations for Next 15.5.25, Prisma/Client 6.19.3 and Sharp 0.35.4 accept
  Node 24; this checks version prerequisites, not runtime throughput.
- [Vercel memory/CPU](https://vercel.com/docs/functions/configuring-functions/memory)
  documents Hobby's 2 GB / 1 vCPU setting. Pro/Enterprise can select 4 GB / 2 vCPUs.
  Memory is per instance; the setting cannot be changed via `vercel.json` under
  Fluid. Existing-deployment API metadata, not that generic default, is the
  parent's evidence for the 2048 allocation here.
- [Vercel duration](https://vercel.com/docs/functions/configuring-functions/duration)
  documents Fluid's Hobby default/maximum of 300 seconds and route-level
  `maxDuration`. Pro/Enterprise have 800-second general maximums and an optional
  1800-second beta; those paid-plan values do not apply to this Hobby release.
  More allowed duration does not add CPU or fix queuing/transaction deadlines.
- [Vercel Fluid concurrency](https://vercel.com/docs/fluid-compute#optimized-concurrency)
  permits simultaneous requests in one process/instance; an awaited async hash
  does not receive its own isolated 2 GB allocation. Autoscaling is not a
  substitute for an application concurrency/resource analysis.
- [Node 24 scrypt](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)
  documents approximately `128 * N * r` memory and `maxmem` validation.
  [Node 24 threadpool documentation](https://github.com/nodejs/node/blob/v24.20.0/doc/api/cli.md#uv_threadpool_sizesize)
  confirms async scrypt shares libuv workers with filesystem, DNS lookup and other
  crypto work; the default is four. The primary Node CLI Markdown was fetched
  directly because its rendered docs endpoint failed in the web reader.

Actual implementation: `lib/platform/auth.ts:15` uses legacy
`N=16384,r=8,p=1,maxmem=32 MiB`; `:16` uses current
`N=131072,r=8,p=1,maxmem=160 MiB`. The dominant v2 region is **128 MiB per active
derivation** (legacy 16 MiB), not 160 MiB permanently allocated per request.
Four active v2 operations imply roughly **512 MiB** of scrypt working regions;
four per-operation maxmem allowances sum to **640 MiB**, but neither figure bounds
total process RSS. Node, Next, Prisma, native buffers, loaded code and queued
requests require additional headroom. `p=1` is not a cross-request concurrency cap.
Do not raise threadpool size to 16 on this budget: the dominant scrypt regions
alone would be about 2 GiB before process overhead.

The local parent 587 MiB result supports feasibility, not a 1-vCPU Vercel latency
guarantee. As a separate reproducible check, this subtask called the actual
`hashPassword` function with synthetic passwords in fresh local Node 25.9.0
Darwin/ARM64 processes and an explicit four-worker pool:

| Submitted hashes | Batch completion | Sampled peak / OS max RSS |
| ---: | ---: | ---: |
| 1 | 305 ms | 203 / 203 MiB |
| 4 | 319 ms | 584 / 584 MiB |
| 8 (two worker-pool waves) | 717 ms | 584 / 585 MiB |

Each batch exits 0. No passwords, salts, hashes, or environment contents are logged.
These tiny local samples exclude Next/Prisma/HTTP and are **not capacity tests or
production latency evidence**. The probe initially had an incorrect import path;
it was corrected only in the ignored harness before these successful runs.

Request-level implications from actual call sites:

- Registration hashes once (`accounts.ts:54`); login verifies once (`:96`). A
  syntactically valid unknown-account login still runs v2 scrypt (`auth.ts:45`).
  An attacker does not need an existing account to consume this hashing budget.
- Password change verifies then hashes **sequentially**, while holding its user
  row lock in an interactive transaction (`accounts.ts:212`, `:224`, `:229`).
  Reset consumption also hashes inside a transaction (`:302`, `:324`) when
  recovery is enabled; disabled delivery does not remove login/registration work.
- `accounts.ts:17` sets Prisma transaction `maxWait=5000 ms, timeout=15000 ms`.
  The route's new 60-second ceiling does not extend those shorter database
  deadlines. Pool queuing, row-lock waits, DB latency and two sequential hashes
  must fit; a short isolated hash timing cannot establish that.
- `account-boundary.ts:133` checks the shared limiter before hashing.
  `account-limits.ts:32` permits 120 global attempts per 60-second window, 30 per
  network per 15 minutes and 10 per operation/subject (3 for grant requests).
  This bounds admission volume, **not active jobs or queue length**. Many subjects/
  networks can burst into the same process, and fixed-window boundaries can admit
  adjacent bursts. With four workers, excess work queues and competes with other
  libuv tasks. No application-wide hash semaphore was found in current source.

**Resource disposition:** the confirmed Node 24 / 2048 / Fluid / four-worker
settings meet the known version and nominal per-process memory prerequisites;
no hashing weakening or dependency change is indicated by the available evidence.
The new candidate's effective 60-second budget and representative Node 24 Linux
HTTP/DB concurrency remain to be verified. Under overload, use bounded admission/
queueing or an explicitly reviewed hash-work concurrency limit and preserve
credential checks/KDF parameters; do not solve a timeout by weakening scrypt.

### Release gates and evidence

1. Preserve trusted build/config inputs. Do not add user-driven config evaluation,
   config uploads, CLI/Studio endpoints, or cyclic-object reconstruction into the
   loader without resolving the dependency and retesting the boundary.
2. After the parent's final build, rerun the all-trace inspection on that candidate,
   including new demo routes and any provider-added function files. Confirm no
   config/deepmerge executable reaches a public request path. If one does, repair
   it or disable that server capability before exposing it; do not relabel unknown
   as non-reachable. This follow-up did not run the prohibited shared build.
3. Recheck actual new-deployment function metadata for Node 24, memory 2048,
   account/portal timeout 60, Fluid and four-worker configuration. Retain the exact
   candidate/deployment identifiers with the parent release evidence. Test bounded
   synthetic HTTP/DB concurrency on equivalent non-production infrastructure;
   check RSS, queuing, 429/503 behavior and the 15-second transaction deadline.
4. Keep the three audit entries visible and the independent security/privacy
   review outstanding. This disposition applies only to the measured graph and
   reviewed trust boundary; it is not a general dependency waiver or pilot approval.

Evidence directory: `.account-test/stage2b-release-dependency-20260908/`.

| File | Exact evidence |
| --- | --- |
| `audit.full.json`, `audit.production.json`, `deepmerge.explain.json` | Fresh registry findings and dependency chain; audit exits 1, explain exits 0 |
| `prisma6.versions.json`, `prisma-config.registry.json`, `GHSA-ggr8-5vv4-36mx.json` | Current supported-line check, exact upstream pin and official advisory |
| `runtime-traces.json`, `nft-snapshot/`, `trace-review.cjs` | All 40 trace snapshots, per-trace package matches, 91 server-JS fingerprints and capture metadata |
| `client-imports.json`, `source-inventory.json`, `source-review.cjs`, `source-excerpts.txt` | Actual client/import resolution, source inventory and installed loader/merger call sites |
| `config-probe-results.json`, `config-probe.cjs`, `config-fixtures/` | Absent/ordinary/cyclic loader results with isolated synthetic inputs |
| `parent-preflight.json` | Parent-supplied deployment budgets and local Node 24 measurements, explicitly attributed rather than independently fetched |
| `scrypt-probe-results.json`, `scrypt-probe.mjs` | Bounded local Node 25 actual-function measurements, not a Vercel load test |
| `vercel-memory.md`, `vercel-duration.md`, `vercel-fluid.md`, `node24-cli.md` | Dated official documentation captures |
| `evidence-hashes.txt`, `trace-stability.json` | Content fingerprints and whether the captured local traces changed before handoff |

## Historical result and scope

Parent final integration checkpoint: local commit `9e927f6`. All 42 account/portal
tests, shared production builds, Prisma generation, fresh migrations, actual
synthetic Stage 2A upgrade, synthetic row/constraint/index restore, TypeScript and
lint passed on the final dependency tree. Evidence:
`.account-test/stage2b-final-6.log`, `.account-test/run-MSq1n6/RESULT.txt`.
Development HTML/RSC guards and production HTTPS raw-payload privacy checks passed.
Browser/mobile/keyboard checks remain blocked by the locked Mac. This evidence
supersedes the subtask-only verification limits at the end of this report; it
does not resolve the remaining advisory or authorize production use.

Additional implementation finding: the installed Next 15.5.25 development Flight
serializer includes awaited I/O debug values, including the cookie collection.
The portal's real raw-HTML test detected its synthetic session token. Moving cookie
reads into a cached server helper alone did not remove this behavior. This is not
one of the npm advisory IDs or evidence of a production leak. Installed source:
`next/dist/server/request/cookies.js` calls `makeDevtoolsIOAwarePromise`;
`dynamic-rendering-utils.js` resolves the underlying value; the compiled React
development server serializer's `emitIOInfoChunk` serializes I/O values. The
production serializer does not contain those debug methods.

Containment: `PortalPage` returns a static notice before reading cookies or private
data whenever NODE_ENV is not production. The private-portal test/preview phase
uses a real production build/server with delivery disabled, behind an isolated
HTTPS loopback proxy and ephemeral trusted test certificate. Account-sink tests
remain a separate development phase. Do not relax TLS, enable production sink
delivery, strip payloads to make privacy assertions pass, or use development
renderers with real private data. QA_REPORT.md records final raw HTML/RSC and guard
results. This guard protects the new portal pages, not every existing dev route.

The actual baseline lock and registry audit contained **29 distinct advisory
IDs**, reported across **17 vulnerable package entries** (15 high, 1 moderate,
1 low). Targeted updates remove 28 of those advisory IDs. Both final full and
production-only audits report **3 high package entries, representing one
remaining advisory**, not three independent vulnerabilities:

`prisma@6.19.3 -> @prisma/config@6.19.3 -> deepmerge-ts@7.1.5`

The remaining advisory is **GHSA-ggr8-5vv4-36mx / CVE-2026-40345**. This is a
documented, unresolved configuration-tooling risk, not a clean audit or an
approved production exception. See the residual-risk section below.

Baseline context was read from `docs/godschurches/RELEASE_READINESS.md`: stage 2A
account work was local/unpushed, real recovery delivery was disabled, and the
previous Next Server Action fix was already at 15.5.21. The parent confirmed its
baseline runner passed 18 checks, fresh migration, restore, and build before
authorizing installs. That is **pre-update** evidence, not this review's result.

Only `package.json`, `package-lock.json`, and this document are this subtask's
tracked edits. Dependency-field patches preserve npm scripts, including the
parent's concurrent portal-script work. Own disposable audit/smoke artifacts are
under ignored `.account-test/stage2b-dependency-20260907/`. No production data,
environment files, live accounts, database connections, email, push, deployment,
commit, shared schema edit, or shared Prisma generation was performed. Installs
used `--ignore-scripts`; the shared `postinstall` was not run.

## Applied package changes

| Package / location | Baseline lock | Final lock | Reason |
| --- | --- | --- | --- |
| next; eslint-config-next | 15.5.21 | 15.5.25 | Supported Next 15 patch; matching ESLint config/plugin/SWC/env packages |
| @prisma/client; prisma and associated Prisma 6 packages | 6.19.2 | 6.19.3 | Maintainer security patch updates pinned Effect; keep client and CLI aligned |
| effect via @prisma/config | 3.18.4 | 3.21.0 | Upstream Prisma pin, not an override |
| sharp via next | 0.34.5 | 0.35.4 | Explicitly allowed by Next 15.5.25; updated native libvips packages |
| postcss at root and under next | 8.5.6 / 8.4.31 | 8.5.28, deduplicated at root | CSS advisories; scoped Next override described below |
| @humanfs/node | 0.16.7 | 0.16.8 | Symlink-copy patch |
| brace-expansion under minimatch 3 / 9 | 1.1.12 / 2.0.2 | 1.1.18 / 2.1.4 | All four brace advisories on their existing major lines |
| browserslist | 4.28.1 | 4.28.9 | Both audited cache/stats advisories |
| defu | 6.1.4 | 6.1.7 | Prototype handling fix |
| flatted | 3.3.3 | 3.4.4 | Recursion and prototype-reference fixes |
| js-yaml | 4.1.1 | 4.3.2 | All three YAML complexity advisories on major 4 |
| minimatch root / typescript-estree nested | 3.1.2 / 9.0.5 | 3.1.5 / 9.0.9 | All three matching advisories on their existing major lines |
| nanoid | 3.3.11 | 3.3.18 | All three generator advisories; no Nano ID 5 migration |
| picomatch root / tinyglobby nested | 2.3.1 / 4.0.3 | 2.3.2 / 4.0.7 | Both matching advisories on existing major lines |
| postcss-selector-parser | 6.1.2 | 6.1.4 | AST serialization recursion fix on major 6 |
| deepmerge-ts | 7.1.5 | 7.1.5 | Unresolved; major 8 override deliberately not applied |

Manifest floors changed to `next`/`eslint-config-next: ^15.5.25`,
`@prisma/client`/`prisma: ^6.19.3`, and `postcss: ^8.5.28`.
Other direct dependency ranges and npm scripts were not changed by this subtask.

The only override is `overrides.next.postcss: "$postcss"`. Next 15.5.25 still pins
PostCSS 8.4.31; simply updating the root dev dependency leaves that vulnerable
runtime-installable copy. This scoped same-major replacement resolves Next's
PostCSS to the reviewed direct range. It does not override arbitrary packages.
Reevaluate/remove it when a future Next 15 patch carries a safe PostCSS version.
An initial version-qualified parent override was rejected with npm `EOVERRIDE`
before lock resolution; the unversioned parent scope above is the applied form.

[Next 15.5.25](https://github.com/vercel/next.js/releases/tag/v15.5.25) restores
AVIF optimization with newer Sharp; its published manifest allows
`sharp: ^0.34.3 || ^0.35.4`. Sharp 0.35.4 therefore does not require a forced
out-of-range override or Next 16. It does require **Node >=20.9.0**; verify the
eventual production runtime separately. This review used Node 25.9.0, not the
production runtime. [Sharp 0.35.4 release](https://github.com/lovell/sharp/releases/tag/v0.35.4).

[Prisma 6.19.3](https://github.com/prisma/orm/releases/tag/6.19.3) specifically
patches Effect. [PostCSS 8.5.28](https://github.com/postcss/postcss/releases/tag/8.5.28)
is on the same major line and follows the relevant security fixes. No Prisma 7/8,
Next 16, Tailwind 4, ESLint 10, or broad major migration was attempted.

Lockfile collateral is confined to resolution of these dependency subtrees:
Next native/compiler packages; Prisma config/engine and c12/giget/nypm helpers;
Sharp platform/libvips/colour/wasm helpers; humanfs core/types; Browserslist
browser datasets/update helpers; and compatible semver/glob leaves. Existing
application/UI direct packages were not broadly refreshed. The full before/after
locks and machine-readable change inventory are retained with the audit evidence.

## Reading the advisory inventory

Each numbered row below is one distinct advisory from the baseline `via` objects.
Duplicate IDs for multiple affected version ranges are counted once. `next`,
`prisma`, and `@prisma/config` also appear as propagated vulnerable parents; those
are not extra advisories. Severity below is npm's reported severity, not a new
reachability-adjusted CVSS score. Minimum fixes refer to the installed major
lines, not every version line in the upstream advisory.

Reachability assessments are **source-based inferences for this checkout**,
using the lock graph, `npm explain`, configs, application imports, and installed
package call sites. They are not production tracing or proof of non-exploitability.
Reassess after parent portal changes, new uploads, remote image hosts, user CSS,
dynamic globs, or untrusted configuration are introduced.

### Prisma configuration: rows 1-3

Paths: root dev `prisma -> @prisma/config -> deepmerge-ts/effect`, and
`prisma -> @prisma/config -> c12 -> defu`. c12 also reaches defu through `giget`
and `rc9`. Baseline config pins are deepmerge-ts 7.1.5 and Effect 3.18.4.
`@prisma/client` has an optional peer on Prisma: npm marks this CLI/config subtree
`devOptional`, so **it remains in `npm audit --omit=dev`**. Installation category
does not establish request-handler reachability.

These packages load CLI/configuration during generation/migration tooling. The
application imports `@prisma/client`, not Effect RPC, deepmerge-ts, defu, or Prisma
configuration APIs. Installed `@prisma/config/dist/index.js` dynamically imports
deepmerge-ts and passes `merger: deepmerge` to c12's config loader; that loader sets
`dotenv`, `rcFile`, `giget`, `extend`, and `packageJson` to false. Thus the installed
giget/rc9 branches do not imply those features are enabled in Prisma's loader.
No request-to-config-merge path was found. Do not expose Prisma
Studio/CLI or arbitrary config evaluation as a public service.

| # / advisory | Severity | Required attacker influence / impact | Minimum fix and disposition |
| --- | --- | --- | --- |
| 1. [GHSA-ggr8-5vv4-36mx](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx), CVE-2026-40345 | High | Matching cyclic references in two merged object graphs cause stack exhaustion. Ordinary parsed JSON alone cannot create those cycles. Here an attacker would need influence over executable/generated Prisma config objects, not an ordinary account request. | deepmerge-ts 8.0.0. **Remaining at 7.1.5**, exactly pinned by Prisma 6.19.3; no compatible upstream Prisma 6 fix found. |
| 2. [GHSA-38f7-945m-qr2g](https://github.com/Effect-TS/effect/security/advisories/GHSA-38f7-945m-qr2g), CVE-2026-32887 | High | Concurrent Effect fibers can resume under another request's AsyncLocalStorage context, including RPC/auth contexts. No Effect RPC/platform request integration is installed or used here; CLI schema/config validation is the observed use. | Effect 3.20.0. **Fixed at 3.21.0** by Prisma 6.19.3's upstream pin. |
| 3. [GHSA-737v-mqg7-c878](https://github.com/unjs/defu/security/advisories/GHSA-737v-mqg7-c878), CVE-2026-35209 | High | A crafted prototype key in untrusted merge input/defaults changes the merged result's prototype/default values. Requires attacker-controlled c12/giget/rc9 configuration here; no account-body use found. | defu 6.1.5. **Fixed at 6.1.7**, within existing ranges. |

### Next image optimization: row 4

Path: runtime `next -> sharp -> @img/sharp-<platform>` and
`@img/sharp-libvips-<platform>`. Baseline Sharp 0.34.5 uses libvips platform package
1.2.4; final Sharp 0.35.4 uses 1.3.3. The installed Darwin ARM64 library reports
**libvips 8.18.6** after the update.

`app/page.tsx` uses `next/image` with repository JPEG hero files. No remote image
allowlist or upload-serving endpoint was found in the inspected app; the checked
Next config leaves remote patterns empty. However, `/_next/image` is a runtime
surface, and default local-pattern matching is not restricted to only the two
rendered hero URLs. A hostile local response/file or later upload/remote source
could supply decoder input. Next bypasses some animated/SVG paths, which is not
a general mitigation for all underlying native issues, especially EXIF metadata.

| # / advisory | Severity | Prerequisites / reachability | Minimum fix and disposition |
| --- | --- | --- | --- |
| 4. [GHSA-f88m-g3jw-g9cj](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj) | High | Untrusted image bytes reaching native libvips decoding/metadata processing. Runtime-capable through Next's optimizer, though an attacker-controlled image source was not found in the baseline app. Also relevant to build-time image processing. | Sharp 0.35.0 is the advisory's minimum; the maintainer recommends newer libvips bundles. **Fixed at Sharp 0.35.4 / local libvips 8.18.6** through Next 15.5.25's supported range. |

The aggregate Sharp finding covers four distinct upstream native advisories;
these are not extra npm audit IDs. All use the same dependency path above:

| Upstream advisory | Distinct prerequisite / impact | Disposition |
| --- | --- | --- |
| [GHSA-2fcj-gj27-279x](https://github.com/libvips/libvips/security/advisories/GHSA-2fcj-gj27-279x), CVE-2026-33327 | VIPS-format image dimensions overflow in `vipsload`, potentially corrupting heap memory. Requires that decoder to receive crafted data. | Patched bundle; upstream minimum libvips 8.18.1. |
| [GHSA-523x-vhfw-6r76](https://github.com/libvips/libvips/security/advisories/GHSA-523x-vhfw-6r76), CVE-2026-35591 | Crafted JPEG/JPEG2000-encoded TIFF tile can cause heap buffer overflow when TIFF decoding is invoked. | Patched bundle; upstream minimum libvips 8.18.2. |
| [GHSA-jmwm-wc68-mhwm](https://github.com/libvips/libvips/security/advisories/GHSA-jmwm-wc68-mhwm), CVE-2026-35590 | Crafted EXIF metadata causes out-of-bounds read/crash. Not limited to VIPS/TIFF/GIF format blocking. | Patched bundle; upstream specifies libvips 8.18.2 and no known workaround. |
| [GHSA-r98w-4fp7-m9c7](https://github.com/libvips/libvips/security/advisories/GHSA-r98w-4fp7-m9c7), CVE-2026-33328 | Crafted GIF input on a 32-bit system triggers integer overflow/DoS. Local tested machine is 64-bit; production architecture was not inspected. | Patched bundle; upstream minimum libvips 8.18.1; no architecture-based exception relied upon. |

### PostCSS and Nano ID: rows 5-11

Paths: root dev `postcss -> nanoid`; `tailwindcss -> postcss -> nanoid`; and
runtime-installable `next -> postcss -> nanoid`. Next's pinned PostCSS 8.4.31 was
a distinct nested vulnerable copy. The scoped override now deduplicates all
these paths to PostCSS 8.5.28 and Nano ID 3.3.18.

Observed use is build-time CSS compilation with repository-controlled
`postcss.config.mjs`, Tailwind config and styles. No API accepts/processes user CSS
or exposes PostCSS results. Presence in a production install does not prove CSS
is parsed per request. Malicious dependency/config CSS in CI remains relevant;
build-time does not mean harmless. The local source contains no Nano ID use for
sessions or recovery tokens: PostCSS's `lib/input.js` calls the non-secure
generator with a fixed positive size of 6 for internal diagnostic IDs.

| # / advisory | Severity | Exploit prerequisite | Minimum fix and disposition |
| --- | --- | --- | --- |
| 5. [GHSA-qx2v-qp2m-jg93](https://github.com/postcss/postcss/security/advisories/GHSA-qx2v-qp2m-jg93), CVE-2026-41305 | Moderate | Attacker CSS containing a closing style tag is stringified and embedded unsafely in an HTML style element; parsing alone is not the complete XSS sink. That application flow was not found. | PostCSS 8.5.10; **fixed at 8.5.28** on both original paths. |
| 6. [GHSA-6g55-p6wh-862q](https://github.com/postcss/postcss/security/advisories/GHSA-6g55-p6wh-862q), CVE-2026-45623 | High | Attacker-controlled CSS sourceMappingURL is auto-loaded from the filesystem; accessible output/error text can disclose local content. Requires untrusted CSS at the build/parser boundary, not merely reading a generated stylesheet. | PostCSS 8.5.12; **fixed at 8.5.28**. |
| 7. [GHSA-fxqj-rqcc-2cmp](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp), CVE-2026-69153 | Moderate | Previous-map traversal/absolute path checks are bypassed when `from` is unset; attacker must submit CSS and obtain emitted source maps. | Audit/database patched threshold 8.5.23; **fixed at 8.5.28**. A historical release link in the advisory points to 8.5.19; it was not treated as sufficient over the actual audited range. |
| 8. [GHSA-r28c-9q8g-f849](https://github.com/postcss/postcss/security/advisories/GHSA-r28c-9q8g-f849), CVE-2026-73646 | High | CSS previous-map path escapes its source directory; extension-only checks still allow disclosure of reachable .map sources/content. Requires attacker CSS and visible result/error output. | PostCSS 8.5.18; **fixed at 8.5.28**. |
| 9. [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), CVE-2026-67214; [maintainer fix](https://github.com/ai/nanoid/commit/e835c9b71eab832bc6106944bdd26ea96cf2c66d) | High | Negative unvalidated size reaches a non-secure generator, hanging the thread. PostCSS supplies 6, not user input. | Nano ID 3.3.16; **fixed at 3.3.18**. |
| 10. [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), CVE-2026-67213; [3.3.18 backport](https://github.com/ai/nanoid/releases/tag/3.3.18) | High | Zero size passed to customAlphabet/customRandom causes an infinite loop. No such application call was found. | Nano ID 3.3.18 on this branch; **fixed at 3.3.18**. |
| 11. [GHSA-xwg4-73v4-xw9w](https://github.com/ai/nanoid/security/advisories/GHSA-xwg4-73v4-xw9w), CVE-2026-73086 | High | Attacker controls a secure generator size large enough to wrap a signed integer and corrupt its random pool, making later IDs predictable. Not the observed fixed-size non-secure PostCSS use. | Nano ID 3.3.12; **fixed at 3.3.18**. |

### Glob matching and brace expansion: rows 12-20

Paths to root minimatch 3: `eslint -> minimatch`,
`eslint -> @eslint/config-array -> minimatch`,
root/ESLint `@eslint/eslintrc -> minimatch`, and
`eslint-config-next -> eslint-plugin-import/eslint-plugin-jsx-a11y/eslint-plugin-react
-> minimatch`. Each reaches root brace-expansion 1 through minimatch 3.

The separate branch is
`eslint-config-next -> @typescript-eslint/parser` (also the ESLint plugin/utils
branch) `-> @typescript-eslint/typescript-estree -> minimatch 9 -> brace-expansion 2`.
Both nested copies stay under `node_modules/@typescript-eslint/typescript-estree/`.

Picomatch 2 paths: `tailwindcss -> micromatch -> picomatch`, Tailwind/Next ESLint
plugin `-> fast-glob -> micromatch -> picomatch`, and
`tailwindcss -> chokidar 3 -> anymatch/readdirp -> picomatch`.
Picomatch 4 paths: `tinyglobby -> picomatch`, where tinyglobby is reached through
typescript-estree, `eslint-import-resolver-typescript`, and `tailwindcss -> sucrase`.

All audited copies are dev/build tooling. Checked Tailwind globs are static
app/components/lib source patterns; ESLint uses repository configuration. No
public endpoint takes glob/brace expressions. The prerequisites below become
relevant if attacker-supplied patterns/configs or hostile source trees are fed
into CI, watch mode, or future application filtering. Matching bugs should not
be dismissed merely because today's glob constants are trusted.

| # / advisory | Severity | Distinct triggering input / impact | Minimum fixes and disposition |
| --- | --- | --- | --- |
| 12. [GHSA-3ppc-4f35-3m26](https://github.com/isaacs/minimatch/security/advisories/GHSA-3ppc-4f35-3m26), CVE-2026-26996 | High | Repeated wildcards with a missing literal cause regexp backtracking. | minimatch 3.1.3 / 9.0.6; **fixed at 3.1.5 / 9.0.9**. |
| 13. [GHSA-7r86-cg39-jmmj](https://github.com/isaacs/minimatch/security/advisories/GHSA-7r86-cg39-jmmj), CVE-2026-27903 | High | Multiple separated globstar segments plus nonmatching path cause combinatorial matchOne recursion. | minimatch 3.1.3 / 9.0.7; **fixed at 3.1.5 / 9.0.9**. |
| 14. [GHSA-23c5-xmqv-rm74](https://github.com/isaacs/minimatch/security/advisories/GHSA-23c5-xmqv-rm74), CVE-2026-27904 | High | Nested star/plus extglobs generate nested unbounded regexp quantifiers. | minimatch 3.1.4 / 9.0.7; **fixed at 3.1.5 / 9.0.9**. |
| 15. [GHSA-f886-m6hf-6m8v](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-f886-m6hf-6m8v), CVE-2026-33750 | Moderate | A zero-step brace sequence never advances, consuming CPU/memory. | brace-expansion 1.1.13 / 2.0.3; **fixed at 1.1.18 / 2.1.4**. |
| 16. [GHSA-3jxr-9vmj-r5cp](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-3jxr-9vmj-r5cp), CVE-2026-13149 | High | Consecutive non-expanding brace groups trigger repeated exponential work. | brace-expansion 1.1.16 / 2.1.2; **fixed at 1.1.18 / 2.1.4**. |
| 17. [GHSA-mh99-v99m-4gvg](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-mh99-v99m-4gvg), CVE-2026-14257 | High | Chained brace groups make expansion strings huge despite result-count limits; OOM can terminate the process. | brace-expansion 1.1.17 / 2.1.3; **fixed at 1.1.18 / 2.1.4**. |
| 18. [GHSA-rgw5-rvv9-x895](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-rgw5-rvv9-x895), CVE-2026-69152 | High | Alternatives/intermediate arrays or padded sequences bypass earlier length limits, causing OOM or long CPU stalls. | brace-expansion 1.1.18 / 2.1.4; **fixed at 1.1.18 / 2.1.4**. |
| 19. [GHSA-3v7f-55p6-f55p](https://github.com/micromatch/picomatch/security/advisories/GHSA-3v7f-55p6-f55p), CVE-2026-33672 | Moderate | Crafted POSIX character-class names access inherited methods and alter matching. This is incorrect matching, not demonstrated remote code execution. | picomatch 2.3.2 / 4.0.4; **fixed at 2.3.2 / 4.0.7**. |
| 20. [GHSA-c2c7-rcm5-vvqj](https://github.com/micromatch/picomatch/security/advisories/GHSA-c2c7-rcm5-vvqj), CVE-2026-33671 | High | Overlapping/nested extglob quantifiers yield expensive backtracking against nonmatching strings. | picomatch 2.3.2 / 4.0.4; **fixed at 2.3.2 / 4.0.7**. |

### Other lint/CSS/configuration tooling: rows 21-29

Paths and actual exposure for the following rows:

- Humanfs: `eslint -> @humanfs/node`. ESLint's inspected helper calls directory
  checks/walking, not copy/copyAll; no application import. A malicious source
  symlink alone does not establish the advisory's vulnerable copy call here.
- Flatted: `eslint -> file-entry-cache -> flat-cache -> flatted`. Lint cache
  deserialization, not an HTTP JSON parser. The normal lint script does not enable
  `--cache`; a hostile cache becomes relevant if caching is enabled/reused in CI.
- JS-YAML: root/ESLint `@eslint/eslintrc -> js-yaml`. The checked config uses JS
  FlatCompat; YAML parsing is possible through legacy/shared config loading, not
  a public YAML upload route.
- Browserslist: `autoprefixer -> browserslist`. Browser targeting during CSS
  builds, not user-selectable runtime queries. Custom stats auto-discovery can
  consume a malicious stats file even without a special custom-stats query.
- Selector parser: `tailwindcss -> postcss-selector-parser`, also
  `tailwindcss -> postcss-nested -> postcss-selector-parser`. Repository CSS build
  path, not a discovered user CSS service.

| # / advisory | Severity | Distinct prerequisite / impact | Minimum fix and disposition |
| --- | --- | --- | --- |
| 21. [GHSA-p498-v437-472g](https://github.com/humanwhocodes/humanfs/security/advisories/GHSA-p498-v437-472g) | Moderate | Attacker places a symlink in a source tree that is subsequently copied with copy/copyAll; readable files outside the tree are copied to the destination. No vulnerable copy invocation found in this lint use. | @humanfs/node 0.16.8; **fixed at 0.16.8**. |
| 22. [GHSA-25h7-pfq9-p65f](https://github.com/WebReflection/flatted/security/advisories/GHSA-25h7-pfq9-p65f), CVE-2026-32141 | High | Crafted flatted data reaches parse's recursive revive step, causing stack exhaustion. Here requires hostile/reused lint-cache content. | flatted 3.4.0; **fixed at 3.4.4**. |
| 23. [GHSA-rf6f-7fwh-wjgh](https://github.com/WebReflection/flatted/security/advisories/GHSA-rf6f-7fwh-wjgh), CVE-2026-33228 | High | Non-numeric reference strings expose Array.prototype in parsed output; a subsequent consumer write can pollute that prototype. Requires crafted cache plus relevant downstream use. | flatted 3.4.2; **fixed at 3.4.4**. |
| 24. [GHSA-h67p-54hq-rp68](https://github.com/nodeca/js-yaml/security/advisories/GHSA-h67p-54hq-rp68), CVE-2026-53550 | Moderate | Repeated aliases in YAML merge sequences cause redundant quadratic key traversal. Requires malicious YAML being parsed by config tooling. | js-yaml 4.2.0; **fixed at 4.3.2**. |
| 25. [GHSA-52cp-r559-cp3m](https://github.com/nodeca/js-yaml/security/advisories/GHSA-52cp-r559-cp3m), CVE-2026-59869 | High | Chains of YAML merge keys repeatedly enumerate growing inherited mappings, consuming quadratic CPU. | js-yaml 4.3.0; **fixed at 4.3.2**. |
| 26. [GHSA-5p4m-2wfm-xmqj](https://github.com/nodeca/js-yaml/security/advisories/GHSA-5p4m-2wfm-xmqj) | High | Large ordered maps (`!!omap`) trigger quadratic uniqueness checking even with the default schema; the earlier 5.x fix had not reached this 4.x copy. | js-yaml 4.3.1; **fixed at 4.3.2**. |
| 27. [GHSA-c83g-rgw3-j3cx](https://github.com/browserslist/browserslist/security/advisories/GHSA-c83g-rgw3-j3cx), CVE-2026-73089 | High | Many distinct attacker-influenced browser queries accumulate indefinitely in a long-lived process. Requires varying queries and volume; normal fixed-query one-shot builds do not demonstrate this attack. | browserslist 4.28.7; **fixed at 4.28.9**. |
| 28. [GHSA-73wf-gq98-2v4g](https://github.com/browserslist/browserslist/security/advisories/GHSA-73wf-gq98-2v4g), CVE-2026-73088 | High | Malformed/prototype-bearing custom stats reach normalizeStats and cause an uncaught error or prototype write. Requires hostile stats file/options, possibly auto-discovered in a source tree. | browserslist 4.28.7; **fixed at 4.28.9**. |
| 29. [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92), CVE-2026-9358; [maintainer 6.1.3 backport](https://github.com/postcss/postcss-selector-parser/releases/tag/6.1.3) | Low | Attacker-controlled deeply nested selector AST reaches recursive serialization; no application CSS parsing endpoint was found. | postcss-selector-parser 6.1.3; **fixed at 6.1.4**. |

## Exact remaining findings and disposition

Both final audits have only the following entries, all severity high:

| npm entry | Locked version | Node path | Cause |
| --- | --- | --- | --- |
| deepmerge-ts | 7.1.5 | node_modules/deepmerge-ts | GHSA-ggr8-5vv4-36mx, affected <8.0.0 |
| @prisma/config | 6.19.3 | node_modules/@prisma/config | Propagated from deepmerge-ts |
| prisma | 6.19.3 | node_modules/prisma | Propagated from @prisma/config |

**Disposition: defer the dependency/API migration, retain an explicit release
risk.** Prisma 6.19.3 still pins deepmerge-ts 7.1.5. Its 8.0.0 upstream fix is a
major change and has not been validated with Prisma's merger/config semantics.
Blindly overriding it would suppress the audit without establishing compatibility.
The audit's suggested `prisma@6.12.0` fix (marked `isSemVerMajor: true` by npm)
is actually a backward move from this lock, not a targeted patch; it was rejected.
No `npm audit fix`, `--force`, downgrade, or Prisma major migration was used.

Observed request-path exposure is low because only trusted local configuration
loading reaches this merger, and ordinary JSON cannot construct the necessary
cyclic pair. Nevertheless, production-only npm audit remains nonzero. Do not call
the dependency safe, fixed, or absent from production installations. Do not allow
untrusted Prisma config/plugins/extends or expose the CLI/Studio publicly. Review
the exception with the release/security owner before release; a zero-high policy
still blocks release. Reopen immediately if configuration becomes user-controlled,
and otherwise resolve via a supported Prisma patch or a separately tested migration
that adopts deepmerge-ts 8.0.0+.

The baseline [Next Server Action advisory GHSA-m99w-x7hq-7vfj](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj)
was already fixed at 15.5.21 and is not one of the 29 baseline audit IDs. The update
to 15.5.25 retains that floor. Baseline `next` audit entries were propagated from
PostCSS/Sharp, not a reappearance of that direct advisory.

## Reproducible evidence and verification

Commands executed with Node **25.9.0**, npm **11.12.1**. Audit status 1 below is
the expected vulnerability result, not a transport failure. Registry data is a
dated snapshot and may change. Raw advisory metadata was retrieved from GitHub's
public Advisory Database API for all 29 IDs; original maintainer advisories,
release notes, manifests, and native libvips advisories were also consulted.

| Evidence file under `.account-test/stage2b-dependency-20260907/` | Result |
| --- | --- |
| audit.before.json: `npm audit --json` | Exit 1; 17 entries: 15 high, 1 moderate, 1 low; 29 distinct IDs |
| audit.production.before.json: `npm audit --omit=dev --json` | Exit 1; 9 high entries; 11 distinct IDs |
| audit.after.json: `npm audit --json` | Exit 1; 3 high entries; 1 distinct ID |
| audit.production.after.json: `npm audit --omit=dev --json` | Exit 1; same 3 high entries and 1 ID |
| paths.before.json: `npm explain ... --json` | Baseline dependency-parent/path evidence |
| tree.after.json: `npm ls --all --json` | Exit 0; installed dependency graph valid |
| package.before.json; package-lock.before.json; lock-changes.json | Baseline manifests and exact changed lock-node inventory |
| advisory-summary.json; GHSA-*.json | Advisory IDs, affected ranges, patched versions, descriptions and primary references |
| resolve.log; targeted-update.log; install.log | Successful targeted resolution/install, all lifecycle scripts disabled |
| smoke.log | CSS pipeline, previous-map regression, native optimizer formats, Prisma config validation pass |
| smoke-build.log | Isolated synthetic Next 15.5.25 production build pass; four static pages generated |
| lint.log | Source/config lint command below, exit 0 |
| evidence-hashes.txt | SHA-256 fingerprints of final manifests and audit snapshots |

The applied resolution commands were:

```sh
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm update @humanfs/node brace-expansion browserslist defu flatted js-yaml minimatch nanoid picomatch postcss-selector-parser sharp --package-lock-only --ignore-scripts --no-audit --no-fund
npm install --ignore-scripts --no-audit --no-fund
npm audit --json
npm audit --omit=dev --json
npm ls --all --json
node node_modules/eslint/bin/eslint.js app components lib next.config.ts postcss.config.mjs tailwind.config.ts
```

The isolated smoke fixture contains only synthetic source/CSS and no `.env` files
or database configuration. With a minimal explicit environment it verified:

- Next's own module resolution selects PostCSS 8.5.28, not a leftover nested copy.
- Tailwind 3 utilities and Autoprefixer work through that PostCSS instance.
- An absolute previous-map annotation with `from` unset does not leak the marker
  from an owned synthetic .map fixture outside the synthetic CSS source.
- Next's actual `optimizeImage` with Sharp 0.35.4 successfully produces resized
  JPEG, PNG, WebP and AVIF from generated pixels; libvips reports 8.18.6.
- Prisma 6.19.3 `defineConfig` accepts a synthetic schema path with Effect 3.21.0.
- A separate minimal Next app completes a production build with the updated
  dependency tree and PostCSS plugins, without writing the shared `.next`.

These are bounded compatibility/regression checks, not exhaustive exploit tests.
No dangerous OOM/ReDoS payloads were run. This subtask did **not** rerun the complete
account/portal database suite or shared production build after dependency changes.
The parent must regenerate the shared Prisma client in its isolated runner and
repeat account/portal/fresh/restore/build checks on the final merged code. The
shared client was not regenerated by the ignored-script install. Production
Node/platform, deployment contents, native binary selection outside this Mac,
and production reachability remain unverified.
