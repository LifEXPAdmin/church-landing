# Stage 2B dependency review

Reviewed September 7, 2026 America/Chicago (September 8 UTC), on
`codex/church-portal`. Local evidence only; no deployment authorization.

## Result and scope

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
