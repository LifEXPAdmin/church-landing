# Portable package and API compatibility checks

`npm run check:portable` checks the canonical `@godschurches/shared-core`
package and the reviewed v1 wire contract without starting a browser, database,
website server or native SDK. Install the existing root lockfile with
`npm ci --ignore-scripts --no-audit --no-fund` first. Set `GC_SHARED_CORE_TMP`
to an existing absolute directory on verified task-owned generated storage.
There is no temporary-directory fallback. The negative fixtures use unique
small copies and remove only those copies; the named-package consumer check
retains its generated receipt for inspection.

## Boundary enforcement

The checker reads every shared source file, including modules not exported yet.
It follows local imports, re-exports, import types and literal dynamic imports,
rejecting edges outside the reviewed source directory before TypeScript follows
them. This source-only package accepts implementation `.ts` files; declaration-only
`.d.ts` files cannot masquerade as runtime entries or imported implementations.
It rejects external dependencies, CommonJS or computed imports, dynamic
runtime construction, source symlinks, ambient declarations/references and
suppressed type errors. The package and wire module compile with strict ES2022
types and no DOM, Node, React, Next.js or Prisma ambient types. Wire source is
currently a single independent module; a future module split requires explicit
review of its allowed source closure.

Package metadata must remain private, side-effect-free and free of runtime
dependencies or lifecycle scripts. Its explicit default, React Native and types
exports must resolve inside `src`. Wildcard exports, browser redirects and
unreviewed assets fail. The existing named-package consumer check separately
resolves the public package name, emits declarations and JavaScript, runs shared
behavior tests and verifies the server's post enum stays equivalent.

These are build boundaries, not a sandbox for hostile JavaScript or proof that
arbitrary type assertions are safe. Review remains required for semantic behavior,
authority, unbounded allocation and platform assumptions.

## Compatibility baseline

`tests/fixtures/api-v1-compatibility.ts` freezes consumer shapes and request types
from the first reviewed contract at `e02ab5d`.
`tests/fixtures/api-v1-requests.json` freezes fictional requests, methods and paths
for its eleven operations. The current contract must continue to produce shapes
readable by that consumer and accept those old requests. Additional response
fields are allowed; missing or changed fields, new unsupported discriminators,
new required inputs, moved endpoints and incompatible fixture validation fail.
Stable error-code types are included. Diagnostic output contains only a finding
code and relative source path, never rejected values or inferred literal types.

Frozen response probes also preserve the public ID, username and cursor length
and representative character bounds. A string field can keep its TypeScript
type while becoming unreadable by an older strict decoder. For example, expanding
the original 2000-character cursor domain fails until the supported-client
baseline and version policy are explicitly reconciled. Broader request acceptance
alone does not establish that responses are compatible with earlier clients.

This baseline is deliberately independent of current generated examples. Do not
regenerate it to make a breaking change pass. Compatible additions should leave
it intact and add their own coverage. A deliberate breaking change needs the
reviewed API version and client migration policy, minimum-version behavior and
acceptance for supported installed clients before a new baseline is approved.
Keep earlier supported baselines while those clients remain supported.

The fixtures cover structural compatibility, representative requests and selected
response primitive bounds, not every possible validator input, every response
constraint or compatibility of a new client with an older
server. Authorization, viewer binding, revocation, error recovery and endpoint
behavior remain covered by their existing API and HTTP tests. Server capability
negotiation and native upgrade UX have their own owners and gates.

## CI and remaining gates

The separate `Portable contracts` workflow uses the existing pinned checkout and
Node actions, Node 24 and the unchanged root dependency lock. It installs without
lifecycle scripts, runs the complete portable command and lints its tooling. It
does not install Expo, Android SDKs or Xcode and does not couple the website build
to mobile native tooling. Existing source-security, audit, signature/provenance,
lint and release checks remain mandatory. This workflow neither changes dependency
advisory policy nor resolves an existing dependency/security release hold.

The negative suite mutates task-owned copies to demonstrate failing browser,
server, ambient-type, export and wire-contract cases, plus a compatible additive
case. Run it once for a coherent change and again only for a relevant fix.
Local success is distinct from a GitHub CI run. Native dependency installation,
Metro export, Android/iPhone builds, device behavior and mobile release automation
still require the canonical app's own checks. Integration must run the gate again
against the combined branch, particularly when its API contracts have changed.
