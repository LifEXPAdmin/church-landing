# Selector parser integration

## Combined candidate, 7 October 2026

The bounded parser repair from `af693a8` is integrated with the shared/native
candidate `70ec43c` at `9b85fbe`. Its original provenance is retained. This
changes the two scoped parser resolutions and adds their verifier; application,
shared-package, schema and migration source is unchanged from the tested shared
integration. Existing package scripts, including `check:portable`, are preserved.

The lockfile is byte-identical to the dependency handoff. Against the prior
candidate, only three package paths change: the shared 6.1.4 parser entry is
removed and the Tailwind and postcss-nested consumers receive separate 7.1.6
entries. The other 548 entries are identical. Parent consumer versions remain
Tailwind 3.4.19 and postcss-nested 6.2.0.

## Checks on the combined source

A clean, independently installed dependency graph was checked with Node 24.20.0.
The fictional build environment contained no external provider credentials. No
database service was started for this dependency verification.

- Registry verification passed for 495 signatures and 84 attestations.
- Thirteen real consumer output comparisons passed byte-for-byte against the
  previous installed graph, using the same current project inputs.
- All 108 source-tooling tests and all 99 portable checks passed. The source
  security guard passed.
- The production build, types, lint, authored-copy, hydration and emitted-secret
  checks passed. Runtime verification covered 272 traces, 92,171 entries and 668
  server JS files; 377 public build files contained no secret-boundary findings.
- Four actual browser rendering groups passed over local HTTPS: `/help` and
  `/platform/login` at widths 320 and 1280. Each response was HTTP 200 with
  request-bound CSP, a visible page heading, bounded layout and successful CSS
  retrieval. Login password controls were present. No form was submitted.

Build `PNHS3BLxbN9yPKwaUimNC` identifies the tested `9b85fbe` application. Its
stylesheet `9cdf69240dc50443.css` is byte-identical to the prior shared-candidate
build: 77,449 bytes, SHA-256
`40ccfb9f3de77e80af8ef9e3d03471cbc124f9a5dc35f6abb895872fe9215dfd`.
The browser receipt records no page errors, external requests or production
writes. Owned browser and HTTP/HTTPS servers were stopped after verification.

The earlier [shared integration](SHARED_NATIVE_INTEGRATION.md) retains its 372
checks and 17 browser groups as separate evidence. They were not all rerun for
this dependency-only integration. The four new guest rendering groups do not
establish authenticated, native-device or production acceptance.

## Release gates remain open

The fresh full dependency audit failed with seven high findings, zero moderate
findings and zero critical findings. The two moderate parser findings are
removed; the separate braces remediation remains required. No advisory waiver,
threshold change or dependency suppression was introduced.

The [original compatibility receipt](SELECTOR_PARSER_ACCEPTANCE.md) also retains
its watch-delete limitation and the formatter's embedded-parser boundary.
These are not closed by the combined build or browser checks. Hosted CI, main
integration, supported-client inventory, native-device acceptance and verified
live release remain distinct gates. No production deployment, migration or
provider operation occurred.
