# Mobile verification

The mobile workflow checks the shared native package independently of the website.
It does not start a server, use member credentials, accept SDK terms, sign a
binary, upload a package or publish an update.

## Change selection and jobs

`.github/workflows/mobile.yml` runs for mobile source, the canonical shared-core
package, the source test resolver, its own workflow and the root files used by
mobile lint or isolation checks. Ordinary website feature and documentation edits
do not start mobile jobs. Root dependency changes do trigger mobile checks because
the native lint configuration reuses the existing locked analysis tools.

The four matrix jobs run mobile lint, TypeScript, unit tests and the native import/
website-isolation boundary separately. Only lint installs the root dependency
graph. Type and unit jobs install just the mobile graph; the boundary check needs
only Node and checked-out source. All installs use the lockfiles and disable
dependency lifecycle scripts. No persistent package cache is created by Actions.

The package-security job runs the mobile dependency audit at the high threshold
and checks registry signatures/provenance. The provenance step still runs after
an advisory failure when installation succeeded. Both failures remain fatal.
Registry or key-service failures are failures, not security approval.

The existing `portable-contracts.yml` remains the single shared-package and
API compatibility gate. The existing `source-security.yml` remains the source,
reachable-history secret, website dependency and security gate. Both inspect the
combined source in their own workflow; passing a mobile job does not replace them.
Do not weaken those workflows, change their required status, or reset a frozen
compatibility fixture to make integration pass.

## Explicit JavaScript exports

Pushes and pull requests do not export either platform. A manual run defaults to
checks only. Selecting `android`, `ios` or `all` requests that JavaScript/Hermes
export after mobile checks and package security pass. The workflow validates that
selection, runs Expo's compatibility check and uses one Metro worker. It logs
file hashes but does not upload bundles or source maps.

The hosted workflow pins Node 22.23.2 and uses ephemeral Ubuntu runner storage for
npm, Expo state, temporary data and output. It uses read-only repository
permissions, commit-pinned existing Actions and no signing or provider secrets.
The shared Mac still uses the SSD and ownership guarded launcher. Hosted-runner
configuration does not create a local storage or claim bypass.

An export proves JavaScript transformation and bytecode generation only. It does
not produce an APK, AAB or IPA and does not establish native installation,
permission, lifecycle, accessibility, device performance or release acceptance.

## Reproduce on the prepared Mac

Reserve the machine-build contract and set the private storage/worker environment
as described in [the workspace guide](../../mobile/README.md). From the repository
root, reinstall only the task-owned mobile generated dependency tree with the same
lifecycle policy used in CI:

```sh
(
  set -e
  npm_config_ignore_scripts=true node mobile/scripts/workspace.mjs install
  export npm_config_cache="$PWD/mobile/.generated/npm-cache"
  export TMPDIR="$PWD/mobile/.generated/tmp"
  npm --prefix mobile run lint
  node mobile/scripts/workspace.mjs typecheck
  node mobile/scripts/workspace.mjs test
  npm --prefix mobile run check:boundary
  mobile_security_result=0
  npm --prefix mobile audit --audit-level=high || mobile_security_result=1
  npm --prefix mobile audit signatures || mobile_security_result=1
  exit "$mobile_security_result"
)
```

Set those cache/temp paths only after the launcher confirms this worktree is on
the mounted SSD. Its child environment does not configure the parent shell.
The subshell stops on a failed guard or source check, runs both security checks
after successful setup, and reports failure if either security check fails.
The explicit settings keep later standalone npm logs, signature/provenance
caches and temporary files in the already verified generated directories.

Lint also needs the existing locked root analysis tools installed through the
website's inspected setup. No root workspace conversion or second lint-tool
dependency graph is introduced. The native config applies TypeScript and React
Hooks rules plus core JavaScript rules for Node-based tooling, without Next.js/
browser rules; intentional object-rest omissions are
allowed, while warnings fail the job.

Run `npm run check:portable` on the combined branch with
`GC_SHARED_CORE_TMP` set to existing task-owned generated storage. Use its current
canonical contract receipt. Follow the existing source-security and copy checks
as well. These are independent checks, not proof of a native journey.

For a justified local export after dependencies or runtime code change, use
`node mobile/scripts/workspace.mjs compatibility` and
`node mobile/scripts/workspace.mjs export` under the same exclusive heavy-job
reservation. Preserve the resulting source identity, bundle hashes and actual
failures in private evidence. Do not repeat unchanged exports as a progress loop.

## Current acceptance limits

Password-entry handler checks execute the actual component handlers with the
canonical input contract and memory-only fixture. The explicit Show/Hide password
control starts masked, preserves the entered value without submitting, and resets
masking on invalid or valid submission. Retained toggle callbacks obey the same
foreground, generation and unmount guard as submission. Fresh forms discard the
old draft and visibility choice. These checks do not prove native text selection,
autofill, keyboard persistence, screen-reader delivery or app-switcher protection;
those require the rebuilt native application and separate device observations.

The 8 October 2026 mobile dependency checkpoint scopes two overrides to their
existing consumers. `micromatch@4.0.8` uses the already reviewed canonical
`@dieub/braces-depth-guard@3.0.3-pn.3` derivative. `xcode@3.0.1` uses the
CommonJS-compatible `uuid@11.1.1` security backport. Expo, React Native and React
versions remain unchanged. The lockfile changes only the brace parser's package
placement and the UUID package. This does not claim that upstream `braces` has
published a fix or that a renamed package alone establishes remediation.

The consumer tests exercise Metro's actual file filter, ordinary brace expansion
and excessive-depth rejection through its resolved `micromatch`, and xcode's
project-group creation/write/parse path through its resolved UUID library. They
also check UUID's output-buffer bounds. The installed derivative payload and
consumer files were matched to the canonical source-review records before use.

The consumed dependency checkpoint is
`886dbd8bd4d379996b44b83f6cf423d85a5bd34f`; the following local observations
belong to that source, before the later iPhone form and privacy integration.
Clean locked installation with lifecycle scripts disabled, 230 local mobile
tests, TypeScript, lint, the import boundary and Expo's compatibility check pass.
Registry verification reports 481 signed packages and 123 attestations. Fresh
iOS project generation and both platform Hermes exports pass under the exclusive
local build reservation. These exports identify a modified source snapshot with
the exact manifest and lockfile hashes retained in private evidence. Project
generation does not install Pods or compile an iOS binary. No Android binary was
rebuilt with this dependency checkpoint; the earlier native receipt retains its
own source and dependency identity.

The audit now reports four high-severity affected-package flags, all derived from
the remaining [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
through Expo's CLI and code-signing tooling. As checked on 8 October, no patched
node-forge release is listed. The audit still exits with failure. The registry's
proposed Expo major downgrade is not an accepted compatibility fix. No exception,
suppression or gate change is added; package security and dependent hosted
exports remain blocked. Recheck when upstream packages or the supported graph
change, rather than repeating the same failed audit.

Local checks and hosted Actions receipts remain separate and identify the exact
source they verify. Integration must verify the combined source; this partial
dependency remedy does not establish overall CI or security acceptance. Preserve
the shared session/transport integration gate and the existing website security
hold.

### Root toolchain receipt consumption, 8 October 2026

The mobile integration branch consumes the canonical website repair from
`c0e121a8ec532fbff93919f5639ebd8d6ead37a1`: the exact root lock, Next/lint
15.5.27, Sharp 0.35.5, scoped selector-parser updates, reviewed braces alias and
hash-guarded embedded toolchain patches. It also consumes the canonical source
security workflow's independent fatal checks and suppression-path rejection.
The existing portable command and mobile checks retain their scope and gates.
Fresh hosted runs exposed invalid `runner.temp` references in both workflows'
job-level environment. Portable storage now uses step environment; mobile setup
exports runner-owned paths through `GITHUB_ENV` before installation. Missing
runner storage fails closed. The source-security unit step explicitly selects
its tooling tests, including execution of the actual temporary-storage steps;
the portable workflow retains tests that require its compiled shared package.

Canonical verification establishes the origin of the consumed repair. Fresh
locked CI must verify this combined branch separately. Installation with
`--ignore-scripts` does not apply the embedded patches; the depth regression
tests exercise patched temporary consumers, while an installed hydration check
requires running its reviewed patch helper first. No mobile lock change or
mobile package-security acceptance follows from repairing the root graph.

Native build automation remains gated on the actual Android/iOS toolchain and
owner-controlled signing setup. Use the inspected
[Android preparation](../godschurches/ANDROID_DEVELOPMENT.md) and
[iOS preparation](IOS_DEVELOPMENT.md) before adding reproducible binary jobs.
Record SDK/Xcode/JDK versions, unsigned versus signed identity, build and installed
sizes, device results and rollback boundaries. A development spike is not a
release candidate.

Workflow behavior follows the official
[GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
and [Expo CLI export documentation](https://docs.expo.dev/more/expo-cli/).
