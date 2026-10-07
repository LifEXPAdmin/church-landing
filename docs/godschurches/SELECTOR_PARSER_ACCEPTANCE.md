# Selector parser compatibility

## Bounded candidate, 7 October 2026

The dependency candidate starts at `f66097b9b31dcf3fc7b8d5d80c83b15ba39081fd`.
It keeps Tailwind 3.4.19, postcss-nested 6.2.0 and the existing framework and
formatter versions. Two scoped overrides select postcss-selector-parser 7.1.6
for Tailwind and its nested-CSS processor. No audit suppression or threshold
change is part of the candidate.

The [maintainer advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)
identifies quadratic parsing of flat class/id selectors before 7.1.6. This
application uses the inspected parser through build tooling. The advisory
describes exposure to untrusted selectors as deployment dependent; these checks
do not demonstrate an exploitable application request path.

Version 7 changed insertion behavior during AST iteration. A major-version
override therefore needs actual consumer checks, not just a successful install.
The compatibility verifier accompanies this candidate for the selected parser,
AST transformations, nested CSS and project stylesheet outputs.

## Isolated graph and provenance checks

The baseline and candidate were installed independently with Node 24.20.0 and
dependency lifecycle scripts disabled. The official Node archive checksum was
verified before use. The generated candidate lock changes only three paths:

- Removes the shared postcss-selector-parser 6.1.4 entry.
- Adds postcss-selector-parser 7.1.6 below Tailwind.
- Adds postcss-selector-parser 7.1.6 below postcss-nested.

All 548 other entries, including the root metadata and optional platform entries,
retain identical values. Actual resolution from both consumers selects 7.1.6.
All 495 installed packages have verified registry signatures; 84 have verified
attestations.

The candidate's full advisory scan has seven high package findings and no
moderate findings. The two selector-parser-related moderate entries are gone.
The remaining entries arise from the separate braces advisory. This is partial
remediation, not a passing full advisory gate or security clearance.

## Reproducible consumer comparison

The reusable PostCSS comparison runs each dependency installation in its own
child process. It passed 13 byte-identical output groups: six actual Tailwind
selector transformations, four nesting fixtures, generated variants and both
project stylesheets. It verifies the exact parent and parser versions from both
consumers, requires populated project content globs, and rejects missing, empty
or different output. The regression tests cover these failure cases and a
symlink CLI invocation that previously could skip execution silently.

To reproduce, prepare a sibling `baseline` checkout at the source commit above
and install its locked graph with `npm ci --ignore-scripts --no-audit --no-fund`.
Install this candidate's locked graph independently. From the candidate root,
using Node 24, run:

```sh
node --test tests/selector-parser-compatibility.test.mjs
node scripts/verify-selector-parser-compatibility.mjs --baseline ../baseline --candidate . --project .
```

The comparison uses the same project inputs for both installations; it does not
claim to compare two different application revisions. The watch evidence below
is a separate actual CLI run.

The final `node --test tests/*.test.mjs` run passed all 108 tests, including six
verifier regressions. Focused lint and the source-boundary guard also passed.

## Real file-watch comparison

Independent baseline and candidate environments used all 1,031 tracked
application, component, library and stylesheet/configuration inputs. The actual
Tailwind CLI loaded the unchanged TypeScript configuration and generated the
application's global CSS. Both environments produced identical bytes at every
recorded state:

| State | CSS bytes | SHA-256 |
| --- | ---: | --- |
| Initial | 41029 | `06351848d17d8928e2a1b16722afa3ece1e9db8b346ade5ee8e2818f9255b3ed` |
| New fixture classes | 41256 | `cc248dcb5e471bf5f927e47b62bf6a2fe3cd8dcb8caa60846585c8363a019546` |
| Edited fixture classes | 41654 | `b0877e546a017b9dd5d79062742d8c70a9297cb7c2034db952f74b7f9b9aaea1` |
| Immediate snapshot after deletion | 41654 | `b0877e546a017b9dd5d79062742d8c70a9297cb7c2034db952f74b7f9b9aaea1` |
| Fresh process after deletion | 41029 | `06351848d17d8928e2a1b16722afa3ece1e9db8b346ade5ee8e2818f9255b3ed` |

The fixture exercised arbitrary dimensions, hover color, responsive grid and
focus-visible ring utilities. Assertions checked that the new utility output
was present and that a fresh process removed the deleted fixture's utilities.
Both owned watch processes exited and the temporary source fixtures were removed.

The first proof timed out because it assumed every file deletion must trigger an
immediate rebuild. The corrected proof checks add/change behavior and
fresh-process cleanup. Its post-deletion snapshot was taken immediately before
stopping the watcher. It does not establish equivalent settled delete-event
behavior: baseline and candidate recorded different rebuild counts. Independent
review identified this limitation, which remains unverified rather than being
counted as watch acceptance. The failed first attempt is retained as diagnostic
evidence and is not counted as acceptance.

## Repository integration checks

The scoped overrides and exact lock delta were adopted in the source worktree.
A fresh `npm ci` installed 495 packages, applied the existing checksum-verified
hydration repair and generated the Prisma client. The actual `npm run build`
passed using Node 24.20.0 with a clean environment, a fictional loopback database
URL and external provider credentials absent. No database service was started.
This includes compilation, lint/types, authored-copy verification, emitted
hydration verification, 268 runtime traces (90,114 entries and 658 server JS files)
and the build-secret boundary (373 public build files, no findings). The queue
client’s expected missing-region warning appeared in the local build.

An owned production server served `/help` and `/platform/login` with HTTP 200,
the expected content and request-bound CSP. Its emitted CSS returned HTTP 200
with the CSS content type (77,449 bytes; SHA-256
`40ccfb9f3de77e80af8ef9e3d03471cbc124f9a5dc35f6abb895872fe9215dfd`).
The first smoke attempt used an HTTP account origin and correctly hit the
existing production HTTPS requirement. The corrected fixture used the fictional
HTTPS origin from the build; this was a local HTTP rendering smoke, not an HTTPS
authentication test. Both owned server processes exited. No account, external
provider or database operation was exercised.

These checks do not establish browser acceptance on the combined release branch
or change release ownership.

## Remaining boundaries

The formatter plugin contains a bundled Tailwind implementation and older
selector-parser code. An npm override changes ordinary module resolution; it
does not rewrite embedded dependencies. Physical closure of bundled parser and
braces code remains part of the complete toolchain remedy described in
[dependency remediation](DEPENDENCY_REMEDIATION.md). Do not interpret removal of
an advisory entry as removal of every embedded implementation.

No production deployment, provider change or native-device acceptance is
included in this candidate.
