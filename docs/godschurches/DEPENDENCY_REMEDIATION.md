# Dependency remediation for the first release batch

8 October 2026 UTC. This is a candidate until its hosted checks and production acceptance are complete.

The artist-privacy batch includes reviewed compatible updates to Next and its lint configuration 15.5.27, Sharp 0.35.5 with matching platform/libvips records, source-map-js 1.2.2, and the scoped selector-parser 7.1.6 override. The existing four React hydration renderer hashes stay unchanged.

## Braces depth repair

The official braces 3.0.3 release remains affected by GHSA-vfj7-8cjw-p6xm. This candidate uses the exact maintained derivative `@dieub/braces-depth-guard@3.0.3-pn.3`, not the older bootstrap latest tag. Its published archive matches source commit `305a2e4bfe324bb53c336c1b03387ee1251c926f`, with verified npm registry signatures and complete Sigstore npm-publish and SLSA provenance. The original MIT license and upstream attribution are retained. The published README still calls the source unpublished; the actual registry archive and verified attestations establish its identity.

The review examined every published file and the full upstream diff. The six changed runtime modules add a 100-level nesting/traversal ceiling, honor stricter finite nonnegative depth limits, reject parent-chain cycles, and validate numeric length options. They add no install hooks, executable, network or process operations. Depth limits intentionally reject inputs exceeding the new boundary. This does not claim to bound expansion cardinality, AST width or arbitrary object getters.

The lock override installs two exact aliases through micromatch and Tailwind. All 549 unrelated package records remain unchanged. A clean lock-only audit reports zero advisories; installed-graph and final hosted verification are separate gates. A renamed package alone would not establish a fix.

## Embedded copies

Next's file tracer and Prettier contain embedded braces implementations. The installer validates the exact signed payload, both installed consumer resolutions, package versions, every pristine or already-patched bundle hash, and the unchanged formatter-plugin hash before writing. It replaces only the six affected factories in each of the two bundles and verifies the complete expected output hashes. Repeated execution is safe; unknown or modified inputs fail.

The Next copy is identified by pinned factory hashes, without guessing its embedded package version. Three explicit adapters preserve its existing 65,536-character ceiling, optional zero-padding matching, and absence of an upstream diagnostic log. Prettier retains its 10,000-character ceiling. The remaining bytes outside the replaced factories are unchanged.

The Tailwind formatter plugin 0.6.14 calls the actual Prettier package; inspected glob package-name strings occur in embedded package metadata. Its exact artifact and observed formatting path were checked. No unnecessary metadata-only patch is applied, and package-name absence is not presented as a complete vulnerability proof.

## Validation and remaining acceptance

Bounded standalone and embedded differential tests compare 1,516 ordinary patterns and cover the relevant public wrappers, malformed/deep ASTs, cycles, option boundaries and unchanged consumer behavior. Actual Next file tracing, Prettier parser/configuration/file-info operations and Tailwind class sorting were exercised. Separate negative controls reject absent or tampered provenance. The portable regression suite verifies actual installed aliases, guarded transformations and consumer behavior on the clean CI graph.

The full high-severity audit, registry signatures/provenance, secret-history scan, source/copy/types/lint, production build, runtime traces, artist service/recovery, HTTPS and browser checks remain required. No advisory exception is enabled. Deployment and canonical live acceptance must be recorded separately.

Sources: [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [exact derivative metadata](https://registry.npmjs.org/@dieub%2fbraces-depth-guard/3.0.3-pn.3), [attested source](https://github.com/dieub/braces-depth-guard/tree/305a2e4bfe324bb53c336c1b03387ee1251c926f).
