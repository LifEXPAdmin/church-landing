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
suppressed type errors. The package and canonical API/native-auth modules compile
with strict ES2022 types and no DOM, Node, React, Next.js or Prisma ambient types.
Both contract implementations live in shared-core. The two legacy web files must
contain exactly one export-all statement to their matching canonical module.
Their reviewed closure is the shared source set; extra web statements, redirected
forwards or escapes into other website modules fail.

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

The active baseline is explicitly reported as `initial-native-v1-64e2106`.
`tests/fixtures/api-v1-initial-native-compatibility.ts` freezes consumer shapes and
request types from the reviewed canonical native-read contract at `64e2106`.
`tests/fixtures/api-v1-initial-native-requests.json` freezes fictional requests,
methods and paths for its eleven core operations. The current contract must
continue to produce shapes readable by that consumer and accept those requests.
Additional response
fields are allowed; missing or changed fields, new unsupported discriminators,
new required inputs, moved endpoints and incompatible fixture validation fail.
Stable error-code types are included. Diagnostic output contains only a finding
code and relative source path, never rejected values or inferred literal types.

Frozen response probes also preserve the public ID, username and cursor length
and representative character bounds. A string field can keep its TypeScript
type while becoming unreadable by an older strict decoder. For example, expanding
the active 4096-character cursor domain fails. A positive probe at the frozen
maximum also prevents silently narrowing accepted cursor input. Broader request
acceptance alone does not establish compatibility with earlier clients.

### Explicit preactivation reconciliation

The first contract at `e02ab5d` and the later canonical native contract at `64e2106`
are not mutually compatible. The latter adds `method_not_allowed` and expands
cursors from 2000 to 4096 characters, violating the first strict consumer's
assumptions. In the other direction, the new decoder requires explicit `audience`;
old-server responses without it fail closed rather than defaulting to `PUBLIC`.

The supplied native auth/read receipts establish local readiness and report no
released v1 native client. This permits a separately named engineering baseline
before activation, not a waiver of compatibility for a supported installed client.
Integration and release owners must verify that inventory again before activation.
If a supported earlier client exists, retain its contract or review a separate
version/migration policy before release. Dependency security, combined-release and
native acceptance gates remain open.

The historical fixtures from `625a012` remain byte-for-byte preserved and are
checked by SHA256. The old TypeScript source was moved to a non-source suffix so
root TypeScript does not compile an explicitly incompatible historical consumer:

| Original path | Retained path | Original Git blob | SHA256 |
| --- | --- | --- | --- |
| `tests/fixtures/api-v1-compatibility.ts` | `tests/fixtures/api-v1-pre-native-compatibility.ts.txt` | `c6ce4fb15178c83accba7f1aa702dd6ed334958c` | `9248af0dad5510151f23e6a49d752c94328994daf8ef943ce1911bd6236ad691` |
| `tests/fixtures/api-v1-requests.json` | unchanged | `0536ccbec1a11dc72462221bb45d181a14901d13` | `cb002ec613317550115d49d4b05f27041089b6981d08ed1d0b73cc83c1c1e06f` |

The active fixtures add exactly the explicit audience/error/cursor expectations;
the eleven operation paths, methods and frozen request values remain unchanged.
Native authentication has separate canonical decoder and one-shot request tests;
the core-operation baseline does not pretend to freeze its server route files.

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
