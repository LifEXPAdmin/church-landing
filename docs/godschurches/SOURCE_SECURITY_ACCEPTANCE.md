## Current hosting-plan correction, 26 September 2026 UTC

Authenticated provider inspection confirms active Vercel Pro. The older Hobby
observation below is dated history. Spend Management is now available, but an
actual team-wide threshold, pause policy, alert recipients and response coverage
remain unverified. An analytics-specific spending field is not a global cap.
Existing provider recovery, MFA, credential separation and branch-protection
acceptance remains open. The reviewed local batch policy suppresses automatic
Git deployments while retaining independent source/security CI and deliberate
release gates; it applies only to branches containing that configuration.
[Current Pro documentation](https://vercel.com/docs/plans/pro-plan),
[Spend Management](https://vercel.com/docs/spend-management).

# Source and deployment security acceptance

## Exchange editor privacy and recovery, 3 October 2026 UTC

The unchanged baseline `b399140ea7628b71f23ae1ad8b48dc850129dc39` retained
private editor fields and photo-caption/alternative-text values in the DOM after
blur. In the account-switch browser observation, the marker remained visible at
35 ms, was hidden but retained at 1,037 ms, and was cleared at 29,574 ms. The
global session guard's synthetic blur invalidated the editor's fresh identity
confirmation, leaving the next poll to clear it. This was not a demonstrated
30-second visible exposure. Fourteen of seventeen focused parent-editor cases
failed against the retained baseline source.

The repair removes private field and photo presentation while access is
unconfirmed, retaining the original controller's draft, selected files and exact
uncertain command privately. Identity confirmation has its own generation, so
concealment cannot discard a valid changed-owner result. Overlapping access
requests coalesce, obsolete confirmations cannot clear a newer check, and a
mutation finishing while concealed cannot restore fields or navigate. A later
verified foreground check resumes a saved creation once. Unselected town text
and queued personal-default continuations retain their original state. Passive
online events and polling cannot reopen an editor that was blurred.

Independent review also reproduced an indefinitely stalled identity/data read
blocking subsequent retries. Candidate `d6419532ddb7c95771dd87cce22c87a3f1b501e2`
adds a 15-second owned access-read deadline and cancellation through the existing
transport's pre/post identity checks, data reads and replenishment check. It
cancels outstanding sibling reads and unmount work. Existing mutation callers
do not use this cancellation. Three additional regressions fail against
`277ba88`; all 21 Exchange and 17 artist recovery tests pass with the repair.
These focused hook tests are not a browser substitute.

Final runtime source `b03105b078cf8d91ead18de8a69229dc17b6d90d` passes
[hosted runtime 37094012583](https://github.com/LifEXPAdmin/church-landing/actions/runs/37094012583),
build `Ze_PFo6JpW52PXV7CdGTA`: 97 service cases, 19 listing and eight search browser
groups, and one HTTPS API/HTML/RSC/photo-access case. The browser confirms
selected file/caption retention through a failed gallery read, private fields
absent during a held identity check, and exactly one accepted save after blur.
After account replacement, private markers were absent at the first 23 ms
observation and clearing was confirmed at 1,029 ms. These are observations from
one fictional run, not general latency guarantees. Exact serving source was
verified with browser MFA mode off and HTTPS mode enforce; an actual MFA
challenge is not claimed. All 139 exact-source guards, copy and types pass;
changed-file lint also passes. The complete source-security job fails at its
unchanged dependency audit, skipping subsequent signature, whole-project lint
and secret checks. No complete release receipt is issued.

Earlier failed attempts remain recorded. A held identity route was released
without waiting for its handler, and the second photo selection raced the prior
metadata receipt/gallery refresh. The browser harness now waits for released
route handlers, completed photo work and an enabled visible upload control,
then acknowledges the selected file before saving. The original privacy and
one-effect retry assertions remain. These are test-sequencing repairs; the
second-upload failure alone did not establish a product file-retention defect.

The original owner's saved snapshot is still present in initial authorized
HTML/RSC. Removing that serialized bootstrap payload is a separate open privacy
gate; this repair addresses live editor presentation and recovery. Broader
Exchange readers and inquiry controls retain their own acceptance boundaries.
The current source audit also remains blocked by
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), affecting
`braces <=3.0.3`; no patched release was listed at the recorded check. Passing
guards, copy and types do not constitute a complete source-security receipt.
There is no integration, deployment, production write or external send claim.

## Inexpensive CI and candidate receipts, 2 October 2026

The source-security workflow now runs every standalone `tests/*.test.mjs` guard,
including worker coordination and the release-receipt validator. It also checks
authored copy, explicitly generates the locked Prisma client, and runs
`npm run check:types` without incremental output. Client generation does not run
migrations or require a production database. The locked install still disables
dependency lifecycle scripts, and the existing advisory, signature, lint and
redacted secret scans remain. No application dependency or provider setting is
added. Hosted execution and local verification are recorded separately below.

Local verification of this tooling slice passed 55 source-security, coordination
and receipt tests, source/copy guards, changed-file lint and diff checks. A bounded
independent source review found no concrete issue. The first all-guard run could
not load the existing migration test's `@next/env` in the source-only checkout;
that setup failure is not a passing receipt. Clean locked-install Linux CI must
verify that test, schema generation and whole-project types. No product build,
database/browser acceptance, provider change or deployment is claimed here.

The first exact-source Linux CI run passed all 66 guard tests, copy validation,
schema generation and whole-project TypeScript, then correctly failed its
existing advisory gate. Three locked `brace-expansion` versions were newly
reported affected. Compatible patches update 1.1.18 to 1.1.21, 2.1.4 to 2.1.7
and 5.0.9 to 5.0.12, including the transitive production queue dependency.
The [maintainer advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7)
describes the bounded parsing repair. Existing optional-platform metadata and
all other locked packages are preserved. This is a dependency repair, not a
claim of a demonstrated application exploit. The new candidate needs its own
successful CI and normal combined product release checks before deployment.

### Candidate release evidence

Before product integration/publication, run from the clean candidate checkout:

```sh
npm run check:release-evidence -- --candidate <full-commit-sha> --receipt <private-json-path>
```

The private JSON receipt uses `schema: 1`, `sourceSha` equal to the full candidate
commit, and a `checks` array with exactly one entry for each kind: `static`,
`services`, `https`, `build` and `browser`. Each entry contains:

- `kind`, the same `sourceSha`, `status: "passed"`, numeric `exitCode: 0`, and the
  actual nonempty `command` or recorded command group.
- Actual `startedAt` and `finishedAt` UTC ISO timestamps, ordered and not in the
  future. There is no invented expiry for unchanged-source test evidence;
  recovery/provider evidence keeps its own existing freshness rules.
- One or more `artifacts`, each with a relative `path` and full lowercase
  `sha256`. Logs must exist, be nonempty regular files and resolve inside the
  receipt directory, including through symlinks. Their hashes must still match.
- For `services`, `https` and `browser`, `environment: "isolated-fictional"`, an
  integer `passed` greater than zero, and numeric `failed: 0`. Document selected
  suites, expected skips and exclusions in the retained evidence. An all-skipped
  suite cannot satisfy the gate.
- For `build`, the actual `buildId`. Its retained build log must include the
  existing copy, hydration, trace and build-security results.

Keep receipts and logs private, for example in the ignored `.account-test`
directory or an approved external task directory. Never fabricate receipt
fields from unrun checks. Static evidence includes the applicable exact-source
CI result. Services, HTTPS and browser selection must cover changed behavior and
affected shared callers; the release owner still reviews that scope. A manifest
is an index into actual evidence, not a substitute for examining it.

The validator rejects a different HEAD, tracked/staged changes, untracked files,
missing or repeated categories, mismatched source, failed/skipped checks, invalid
times, unsuitable fixture declarations and missing/changed/escaping artifacts.
It rechecks checkout cleanliness after hashing. Success prints only the source,
category names, artifact count and verification time. Failures print a stable
code, never receipt values or raw log/file errors.

This is a fail-closed consistency check on operator-supplied evidence, not test
execution, cryptographic attestation, proof of declared fixture isolation or
proof that the chosen suites are sufficient. It does not inspect the built
artifact's internals, deploy, acquire the release lock, enforce repository or
provider rules, or waive recovery, migration, operator and live acceptance.
No current product release is certified by the validator's fictional tests.

## Integrated release acceptance, 26 September 2026 UTC

Engineering is integrated and deployed in **2026.09.26.2**, serving commit
`20d81d73706e2ef38488617ebf57a27beb12acdb`. All 27 guard tests and the
[exact-source Linux check](https://github.com/LifEXPAdmin/church-landing/actions/runs/36215908264)
pass. The final local build checks 329 public files against three supplied fictional
secret keys; this is not exhaustive production-secret coverage. All 110 production
migrations match with no pending changes. Live page/health checks and scoped logs
pass. Provider isolation, required checks, alerts and owner-account controls remain
open. See [deployment evidence](DEPLOYMENT_REPORT.md).

## Original engineering receipt

26 September 2026 UTC. Engineering verification is separate from integration,
hosted enforcement and the private provider/account acceptance record.

## Changes and existing owners

The existing release pipeline already validates authored copy, the guarded React
hydration patch and 231 runtime traces. Those owners remain authoritative. The
new checks add source/lock validation, secret scanning and public-build inspection
without introducing application dependencies, database queries or background
jobs.

`npm run check:security` checks Git-tracked files for private artifacts, validates
the locked registry/integrity and root dependency metadata, and restricts public
environment names in application source to the existing approved site URL.
Its diagnostics use stable finding codes and file/key names, never matched values
or excerpts. The production build separately checks public static output for
source maps and configured server secret values. This build-only mode works
without Git metadata and records how many eligible secret values were supplied;
zero supplied values is not comprehensive credential coverage.

The migration wrapper now refuses hosted preview, development, unknown or
incomplete deployment identities before loading local environment files or
starting Prisma. It checks identity again after environment loading. Confirmed
production and the existing explicit local operator path retain their original
connection fallback order. This prevents the build wrapper from treating a
nonproduction deployment as authorization to migrate a shared database. It does
not itself separate provider credentials or prevent all possible direct access
to a misconfigured database.

The new GitHub `Source security` workflow uses an ephemeral hosted runner,
read-only repository contents permission, checkout without persisted credentials,
full commit pins for both actions and no dependency cache. Dependency lifecycle
scripts are disabled during installation. The workflow runs the source and
migration guard tests, npm advisory/signature checks, existing ESLint and a
checksum-pinned Gitleaks scan. It does not receive production secrets, deploy,
migrate, approve pull requests or run privileged pull-request events. Required
status enforcement remains a separate repository-owner setting.
Inline suppression comments and repository fingerprint-ignore files cannot
bypass the reviewed exact fixture exception; encoded-content scanning has a
bounded depth of five.

The designated release maintainer owns scanner/action versions, dependency
findings and workflow failures. Review failed checks before integration. A real
credential finding requires trusted revocation/rotation and an impact review;
removing text or adding an ignore entry alone is insufficient.

## Source and dependency evidence

The frozen baseline contains 1,843 tracked files and 721 reachable commits across
126 local refs with 110 distinct tips. Gitleaks 8.30.1 examined the 720 commits
with changed paths; the remaining commit is patchless. The current-source scan
read 13.49 MB of text from 21.04 MB of tracked content; binary assets account for
the difference. This scope covers the inspected local refs, not inaccessible,
deleted or unfetched remote history.

Default rules found the same fictional mission-browser fixture password once in
current source and once in history. Historical and current context establishes
its loopback, test-sink and fictional-account use. The committed exception matches
both the exact value and exact file under the existing generic-key rule; default
rules remain enabled. Four controls prove that only that combination is allowed,
while another credential pattern in the same file and the same fixture value in
another file still fail. Reviewed source and history scans report zero remaining
findings. No real credential exposure was identified by these scans.

The initial public-artifact scan covers 328 files, including 316 text files, with
zero Gitleaks findings, public maps/map references or inspected sensitive-name
and fictional-secret matches. That initial artifact was the earlier tested
`b0aa39086a20d612fb03920ab5d990865af59d8d` build; final candidate verification is
recorded separately below. No production secret values were loaded for the scan.

Full and production-only npm audits report zero known vulnerabilities. Registry
signature/provenance checks have no invalid or missing signatures. All 548
non-root entries have npm-registry URLs and SHA-512 integrity, and the installed
graph agrees with the lock. The [dependency review](DEPENDENCY_REVIEW.md) now
supersedes the old deepmerge-ts exception: the existing 8.0.2 override is patched.
No dependency upgrade was introduced by this work. Advisory checks are dated and
do not establish the absence of unknown vulnerabilities.

## Verification

Engineering source `f713611d79c2e9f1cb71dca1fdcf6b7a3d30bef6` passes all 27
focused checks: 16 source/build tests and 11 migration-wrapper tests. Final local
execution took 1,052.594 ms, with zero failures, cancellations or skips. The tests
use disposable source trees, fictional canaries and injected process calls; they
never execute real migrations or contact an application database.

Source validation passes for 1,848 tracked files, 878 application source files
and 548 locked packages. The final frozen history rescan covers 126 refs with
111 tips and 723 reachable commits, with zero reviewed findings. The fresh
production build passes authored-copy, lint/type, hydration and all 231 trace
checks. Its public-build guard checks 328 files and three supplied fictional
server-secret keys, finding no maps or raw/JSON/URL-encoded matches. The guard
supports 19 explicit server-secret names and intentionally excludes the public
VAPID key. It does not claim that arbitrary encoding or unknown secret names are
exhaustively detected.

The actual [GitHub workflow run](https://github.com/LifEXPAdmin/church-landing/actions/runs/36215368561)
passed on that source SHA using a fresh Linux runner. Locked installation with
scripts disabled, all 27 guard tests, advisory/signature checks, full ESLint and
the checksum-pinned history scan each succeeded. No generated Prisma client,
database, production credential or deployment permission was needed by that
workflow. Public application source and the dependency lock are unchanged;
the added checks run during development/build, not on website requests.

Review caught and repaired two scanner-coverage gaps before publication: inline
allow comments initially bypassed the history command, and the first build-key
list omitted existing database aliases and provider secrets. The final command
disables the bypass and the tested explicit list includes those keys. An initial
synthetic AWS probe used characters outside the scanner rule's alphabet; its
corrected negative control detects the fictional token. No credential was rotated
or suppressed because of an unreviewed scanner result.

The [shared abuse-budget acceptance](ABUSE_BUDGET_ACCEPTANCE.md) remains the
separate 37-check receipt for signup/reset, image, post, message and report
budgets, retries and payload bounds. Existing export and error-response tests
remain with their canonical owners; source inspection is not described as a new
full service regression or penetration test.

## Provider and operator acceptance remains open

Read-only provider inspection was performed and detailed results were retained in
the private security ledger and existing owner-action task. No access grant,
credential rotation, protection rule, domain assignment, provider configuration
or production data was changed by this audit.

Outstanding acceptance includes actual separation of preview/production data and
credentials, the intended deployment-project boundary, default-branch required
checks and dependency alerts, provider account/recovery coverage, and operational
notification ownership. Source guards do not certify these settings. The release
owner must review and integrate the tested commits, verify the combined pipeline
and record exact deployment/live acceptance before closing the engineering task.

Vercel documents automatic DDoS mitigation on all plans. This provider behavior
does not replace application account/action budgets or establish a custom WAF or
BotID configuration. The inspected firewall API returned configuration-not-found;
no custom rule coverage is claimed. Spend Management is documented for Pro and
eligible Enterprise plans; the inspected account is Hobby, so this audit does not
claim a configured paid-plan spending threshold or purchase an upgrade. Native
usage notices and actual response coverage require separate owner evidence.

Application queues retain existing bounded batches, 60-second consumers,
visibility/retry controls and idempotent receipts. Source limits are not proof of
the provider's concurrent execution ceiling or hosted capacity. Database grants
and storage access beyond the inspected configuration/code are not independently
certified by this audit.

Primary references: [OWASP supply-chain guidance](https://cheatsheetseries.owasp.org/cheatsheets/Software_Supply_Chain_Security_Cheat_Sheet.html),
[GitHub secure workflow use](https://docs.github.com/en/actions/reference/security/secure-use),
[Gitleaks](https://github.com/gitleaks/gitleaks),
[Vercel DDoS mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation)
and [Vercel Spend Management](https://vercel.com/docs/spend-management).
