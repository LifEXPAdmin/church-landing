# Dependency remediation

## Compatible patch candidate, 7 October 2026 UTC

Candidate `535778a4cab31c9701272a1ccee583827edee9ab` repairs the available
compatible dependency patches on top of the prepared website and native API work.
It is not a complete security or deployment receipt.

| Component | Previous lock | Candidate | Reason |
| --- | --- | --- | --- |
| Sharp | 0.35.4 | 0.35.5 | Includes the upstream librsvg repair and matching platform binaries. |
| brace-expansion | 1.1.18, 2.1.4, 5.0.9 | 1.1.21, 2.1.7, 5.0.12 | Carries forward the three compatible repairs prepared in `94462d4`. |
| source-map-js | 1.2.1 | 1.2.2 | Repairs indexed source-map offset handling. |

The lock retains every optional platform entry and every other package. Sharp's
platform packages move to 0.35.5 and libvips packages to 1.3.4. No override,
framework major upgrade, dependency alias, scanner exception or weaker gate is
introduced. Sharp remains exactly pinned. The existing Next 15.5.25 hydration
backport remains unchanged.

The baseline advisory scan failed with 12 package findings: ten high and two
moderate. The candidate scan still fails, with nine package findings: seven high
and two moderate. Those nine entries represent the remaining `braces` and
`postcss-selector-parser` advisories and their affected parent packages. Counts
of package findings are not counts of independent vulnerabilities.

A clean Node 24.20.0 locked install with dependency lifecycle scripts disabled
passed. Registry verification passed for 494 installed packages and 84
attestations. The canonical hydration installer, Prisma client generation and
source-boundary check passed separately. Application regression and build
verification passed with the scope below. No release or production change is
claimed.

### Local verification

The production build is `KHnHKw9bkrBRazxwAQzSp` from application `535778a`.
Test-only successor `e5ddfce` corrects an older scheduled-publication fixture:
advancing time one hour also expires its 30-minute idle session. It now asserts
that the expired session cannot read the church post, then signs in through the
real password service before checking the published reply audience. No
application, dependency or build input changed in that successor.

- 55 service checks passed: media processing, storage and permission boundaries,
  avatar delivery, private feedback attachments, generated SVG share cards,
  notification outbox/worker/consumer, and scheduled publication.
- Five production-build HTTPS checks passed for image upload/delivery and public
  share images, including revocation and private fallback behavior.
- 32 source, migration-wrapper and hydration-installer checks passed. Whole
  project lint, TypeScript without incremental output, authored copy and source
  checks also passed.
- The build verified all four hydration renderers and the emitted repair,
  268 traces containing 66,875 entries, 659 server JavaScript files and the
  existing build-secret boundary.
- The actual Darwin arm64 decoder reports Sharp 0.35.5, libvips 8.18.7 and
  librsvg 2.63.2. Linux/glibc binaries were not executed locally.

Failed attempts are retained. The first HTTP run incorrectly borrowed a
native-auth fixture with MFA enforcement; one older church-image test expected
the canonical image fixture's mode. The corrected adapter preserves the
production code and uses that suite's existing fictional mode. A later probe
mistook the runtime release identifier for a build-embedded value; the final
probe supplies and verifies the actual application source separately from the
test-only successor. All four owned fixtures stopped, and all twelve allocated
ports were checked closed.

The production-only npm advisory scan reports zero findings. A scan of all
declared build-trace entries finds none of the selected remaining braces,
micromatch, fast-glob, Prettier, NFT, selector-parser or brace-expansion paths.
Neither result proves the absence of embedded code from all artifacts or clears
the full installed toolchain. The full audit remains fatal. Browser/device,
Linux CI, provider, integration and live-release acceptance remain open.

Official repair references:

- [Sharp and librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- [brace-expansion nested groups](https://github.com/advisories/GHSA-qhr7-859c-m2p7),
  [comma parsing](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), and
  [quadratic rewriting](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
- [source-map-js indexed offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

## Remaining release blockers

The current [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects every published version through 3.0.3 and lists no patched release.
[Upstream PR 72](https://github.com/micromatch/braces/pull/72) is closed without
merging, as confirmed on 7 October. Its proposed patch and the earlier isolated
105-check experiment are not an adopted or complete remedy.

The installed paths through Next lint, Tailwind, fast-glob, micromatch and
chokidar remain. The separate
[selector-parser advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)
also remains through Tailwind and postcss-nested. Its fixed 7.1.6 version is
outside the existing version 6 parent range; a forced major override is not a
verified compatibility repair.

Published bundle inspection also prevents treating an ordinary manifest upgrade
as physical removal:

| Published artifact inspected | Source finding |
| --- | --- |
| Prettier 3.9.9 `index.mjs` | Includes braces parse, compile, expand and stringify implementations with recursive walkers and no nesting-depth guard. Exported internal fast-glob task generation reaches expansion. |
| Next 15.5.27 compiled NFT | Includes the same braces API and recursive implementation family. The NFT ignore matcher imports micromatch; that import alone does not establish execution of expansion walkers. |
| Next 16.4.0 compiled NFT | Replaces that braces module chain with external picomatch and glob/minimatch. It separately embeds recursive brace-expansion code that still needs exact ancestry and repair verification. |

Archive integrity was verified against registry metadata before source-only
inspection. No newer package was executed or adopted by this inspection. The
Next 16 external picomatch payload was not part of the inspected NFT file.
Lock overrides cannot change code embedded within a published bundle. A Next
major upgrade also requires the existing hydration repair and framework behavior
to be verified, not merely changing installer hashes.

Preserve the earlier source experiments and failed compatibility evidence. The
literal-root lint derivative, bounded Tailwind source comparisons and formatter
backend proof are incomplete proposals. They do not establish actual package,
watch, configuration, editor or physical dependency closure.

Next steps are to retain the remaining advisory failures and review a complete
maintainable remedy for the remaining toolchain. Linux CI, combined browser and
application release checks, and actual live acceptance remain open. Current
advisory, signature, source and secret requirements remain in force.
