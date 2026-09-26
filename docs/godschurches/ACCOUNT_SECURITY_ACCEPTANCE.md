# Account security acceptance

## Scope and evidence, 26 September 2026 UTC

This is a focused engineering review of current adult accounts and their existing
private-data boundaries. The inspected candidate is
`1ce6d2e27d36e821072a992a64e8560a570d1c27`. It includes the framing and session
parsing repair in `f9cfe5e` and the subsequent Google account-binding repair.
The development diagnostic regression found on that source is repaired in the
current local follow-up. Final-source, integration and verified-live gates remain
open.

Requirement IDs below use the official [OWASP ASVS 5.0.0 CSV](https://github.com/OWASP/ASVS/releases/download/v5.0.0_release/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv),
containing 345 requirements, with SHA-256
`6124dba176dc563f66363a11ae0c47f9b86b8a4a84c66a793670bd196ed86cd5`.
The matrix selects relevant requirements; it does not establish a complete ASVS
level, certification, independent audit or acceptance of future child/guardian
features. Listed tests identify existing coverage unless a fresh result is
explicitly recorded below. Implementation, passing tests, integration and live
behavior are separate evidence.

## Reproduced defects and repairs

- **External framing:** the preceding built application rendered usable sign-in
  controls inside an independent origin's frame. The 04:17 UTC reproduction
  entered no credentials and made no application writes. Global response headers
  now include `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`,
  `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`. The 04:30 UTC
  built-browser check on `f9cfe5e` verifies eight response paths, usable top-level
  sign-in and an actual browser framing denial: ten checks, no browser errors,
  application writes or recipient sends. This is not a complete script CSP.
- **Duplicate session cookies:** the baseline investigation reproduced API and
  server-rendered principal disagreement when the same session-cookie name
  carried different accounts. `account-cookies.ts` now reads the original header
  and rejects ambiguity, including identical duplicates and malformed duplicate
  entries. `account-boundary.ts` and `private-cookies.ts` share that decision;
  neither chooses a principal nor revokes either valid account. Fresh HTTPS tests
  exercise both cookie orders, private HTML/API denial and denied revocation.
- **Google ambiguity edge:** after the parser repair, a callback could treat
  conflicting active account cookies as an anonymous browser. Its focused
  regression failed before `1ce6d2e`. Both Google entry and callback now reject
  ambiguity before starting or consuming the authorization flow. Tests preserve
  legitimate replacement of an expired cookie and reject a competing active
  account without issuing a session or consuming the original attempt.
- **Development header diagnostics:** a follow-up reproduction
  on `1ce6d2e` found that resolving the newly read Next.js `headers()` object can
  serialize raw Cookie, Authorization and other header values into development
  HTML/RSC diagnostics. No corresponding production leak was observed. The
  private adapter now redacts JSON serialization of both the header and cookie
  stores before a component receives them. The same 18 actual development
  HTML/RSC probes exposed request secrets before the repair and passed afterward,
  preserving ordinary owner selection and denial of either ambiguous ordering.
  `account-http.test.ts` adds a permanent development regression for tokens,
  unrelated cookies and private Authorization/header markers. Final-source
  production regression remains required.

## Scoped control matrix

Source filenames below are under `lib/platform/` unless another directory is
named. Test filenames are under `tests/`. A mapped control is not a declaration
that every clause of the associated requirement has passed.

| ASVS 5.0.0 references | Inspected control and meaningful existing checks |
| --- | --- |
| V6.2.1, V6.2.3, V6.2.5, V6.2.8, V6.2.9; V11.4.2 | `auth.ts` accepts unchanged passwords of 8 to 128 UTF-16 code units, uses salted scrypt-v2 and timing-safe comparison, and retains the bounded legacy verifier. `accounts.ts` requires current credentials for password change. `account-security.test.ts` covers malformed hashes, Unicode, recovery, rotation races and persistent limits. The corrected isolated legacy-fixture result is recorded below. |
| V7.2.1, V7.2.2, V7.2.3, V7.2.4; V7.4.1, V7.4.2, V7.4.3 | `auth.ts` generates 32 random token bytes; database sessions store hashes. `accounts.ts`, `account-sessions.ts` and `session.ts` check expiry, credential generation and account state; row locking coordinates issuance and revocation. `account-session-rotation.test.ts`, `account-sessions.test.ts` and `account-security.test.ts` cover replacement, failed-login preservation, logout/revocation and credential races. |
| V7.5.1, V7.5.2, V7.5.3; V6.3.4, V6.4.3 | `account-credential.ts`, `account-email-change.ts` and `privileged-auth-policy.ts` bind sensitive confirmation to the account, session, purpose and current credential/authority generation. `account-email-change.test.ts`, `account-export.test.ts` and `privileged-authentication.test.ts` cover substitution, expiry and recovery. Actual MFA enforcement is a separate open gate. |
| V9.2.1, V9.2.3; V10.1.2, V10.2.1, V10.5.1, V10.5.2 | `google-provider.ts`, `google-accounts.ts` and `google-boundary.ts` use the maintained verifier, fixed issuer/audience, issuer-plus-subject identity, nonce, state, PKCE and a one-use browser-bound attempt. Recent confirmation is purpose-bound, not second-factor assurance. `google-accounts.test.ts`, `google-boundary.test.ts` and the fresh session suite cover replay, wrong account/browser, linking and the ambiguous-cookie edge. Real Google acceptance is separate. |
| V3.3.2, V3.3.4; V3.5.1, V3.5.2, V3.5.3 | Ordinary sessions use host-only, HttpOnly, SameSite=Lax cookies with Secure in HTTPS configuration. Account/social HTTP boundaries require the configured origin, appropriate mutation methods, bounded input and expected-account binding. `account-http.test.ts`, `portal-http.test.ts` and `google-boundary.test.ts` exercise origin/account denial and private response handling. Cookie-prefix limitations remain below. |
| V3.4.3, V3.4.4, V3.4.6 | `next.config.ts` installs the global framing, object/base and MIME-sniffing response policy. `scripts/qa-account-security-headers.mjs` verifies ordinary pages, guest private/API responses, a 404, the manifest and actual cross-origin framing. Fresh evidence is limited to the preceding repair build noted above; the complete CSP requirement is partial. |
| V8.1.1, V8.1.2; V8.2.1, V8.2.2, V8.2.3; V8.3.1, V8.3.2; V8.4.1 | Existing account, church, Support and audience contracts define separate permissions. `admin-authority.ts`, `post-access.ts`, `calendar-access.ts` and `account-read.ts` enforce current grants, owner/object/field scope and serialized revocation in the trusted service. `portal-service.test.ts`, `portal-http.test.ts`, `calendar-http.test.ts`, `post-read-concurrency.test.ts` and `membership-revocation.test.ts` cover cross-account/church reads and concurrent authority loss. This is a selected inventory, not a proof for every endpoint. |
| V14.2.2, V14.2.6, V14.3.2 | Explicit DTOs exclude credential/private fields. `community-search.ts` applies current source predicates; `feed-reads.ts` rehydrates bounded ID snapshots through current permissions. Private HTTP/media responses use no-store. `community-search.test.ts`, `profiles-http.test.ts`, `post-availability.test.ts` and `media-http.test.ts` cover search, field projection, revocation and cache headers. Public church publication is distinct from private setup drafts; `communityListed` is provenance, not a visibility grant. |
| V5.2.1, V5.2.2, V5.3.1, V5.3.2, V5.4.1, V5.4.2; V14.2.8 | `media-processing.ts` bounds bytes/pixels, checks image content, rejects unsupported animation and re-encodes derivatives without embedded private metadata. `media-storage.ts` uses private generated keys; `media-boundary.ts` rechecks access and fixes safe response filenames. `media-processing.test.ts`, `media-boundary.test.ts` and `media.test.ts` cover disguised/truncated files, streaming limits, metadata and revoked delivery. This does not establish antivirus scanning. |
| V7.5.3, V8.2.3; V14.2.1, V14.2.6, V14.3.2 | `account-export.ts` creates a bounded owner projection under a short-lived session/credential-bound proof; the proof stays out of URL paths and queries. `account-export.test.ts` covers cross-session/account rejection, expiry, revocation, attachment/no-store headers and explicit size failure. Credentials, factor material and another person's private records are excluded. |
| V14.2.4, V14.2.7 | `account-deletion.ts`, `retention-journal.ts` and `retention-restore.ts` reuse explicit erasure, content-free protected controls and conservative restore retirement/quarantine. `account-deletion.test.ts`, `retention-controls.test.ts` and `retention-restore.test.ts` cover retained decisions, failed protection and stale restores. Scheduled/provider expiry and recovery operations require their own dated receipts. |
| V1.2.2, V1.2.4; V2.2.1, V2.2.2 | Selected account/profile/source paths use server allowlists, bounded typed fields, validated URL schemes, Prisma queries and parameterized raw SQL. `profile-modules.test.ts` covers malformed/oversized text, invalid links and rejected writes; source-security checks detect prohibited public artifacts and secret canaries. This is not a complete XSS, SQL injection, command injection or SSRF assessment. |

## Partial requirements and retained recovery

**CSP and cookies:** V3.4.3 remains partial because the policy does not restrict
script execution through an allowlist, nonce or hash. A complete nonce policy,
resource compatibility and violation reporting remain unverified; V3.4.7 is not
claimed. The ordinary `church_platform_session` cookie remains unprefixed, so
V3.3.1 and V3.3.3 are not fully met despite HTTPS Secure and host-only attributes.
Rejecting duplicate cookies fixes principal ambiguity; it does not implement
the prefix requirements. Google cookies have their separate secure host prefix.

**Password/session policy:** common, contextual and breached-password checks
(V6.1.2, V6.2.4, V6.2.11, V6.2.12) are not implemented by the current length-only
validator. Ordinary sessions have a fixed 30-day lifetime, without an implemented
idle timeout. V7.1.1 and V7.3.1 remain open; the existence of an absolute expiry
alone does not establish the risk justification required by V7.3.2. Existing
rate limits and generic errors are not complete credential-stuffing or timing
analysis evidence.

**Client cleanup, V14.3.1:** completed same-tab logout redirects to the login
page, removing the previous page. A retained page in another tab can instead
receive a confirmed identity denial and leave old server children or form values
in hidden/inert DOM. `PrivateSnapshotGuard` and mounted original/repost readers
conceal content; concealment is not DOM erasure. Existing browser assertions
usually check hidden state or visible text, not absence of all DOM values.
No complete client-storage cleanup claim follows from them.

Recovery must stay with its owner. [Retained reader privacy](RETAINED_READER_PRIVACY.md)
preserves composers during source withdrawal/restoration. The
[reporting contract](COMMUNITY_REPORTING_CONTRACT.md) preserves an uncertain
privileged request across 401/403/404 and legitimate account/access restoration;
`qa-community-report-review-browser.mjs` verifies an account switch after a lost
committed response and an identical original-account retry. Support stores its
exact retry body inside the mounted form. Other draft owners explicitly clear
on account change. A shared status-only unmount would silently change these
contracts. Separate confirmed session termination from transient failure,
source denial, MFA challenge and version change; preserve unresolved request
ownership when removing rendered private data. This review leaves that combined
cleanup/recovery acceptance open.

**Other limits:** V5.4.3 antivirus scanning is not established by image
normalization. V14.1.1, V14.1.2 and V14.3.3 need a complete classified inventory,
including bounded browser draft/progress state. No fresh exhaustive logging,
provider-access or retention-enforcement assessment is claimed. The
[privileged authentication implementation](PRIVILEGED_AUTHENTICATION_IMPLEMENTATION.md)
remains the owner of staged MFA enrollment, recovery and enforcement. Actual
adult enrollment, essential delivery, Google/provider setup, controlled
activation, provider isolation and physical-device/pilot acceptance remain open
until separately observed. This review changes no grant, rollout mode or policy.

## Verification checkpoint and remaining acceptance

- Candidate `1ce6d2e` passes eight focused session checks with no failures. The
  production build exits successfully at 04:32 UTC, including 231 runtime traces,
  the existing hydration guard and build secret exclusion.
- Fresh source-security and hosted-migration guard checks pass 27 tests.
  Source/copy checks pass. These cover their named tooling boundaries, not all
  ASVS requirements or framework development diagnostic serialization.
- The initial service run stops with eight passing and four failing account
  security cases dependent on missing legacy-upgrade fixtures. A separate
  correctly named isolated cluster then seeds the legacy state, upgrades through
  110 migrations and passes all twelve cases at 04:42 UTC on `1ce6d2e`. The failed
  attempt remains recorded. The corrected broader run passes 147 checks across
  20 files, including these twelve cases. The initial calendar phase mismatch
  is retained; all five calendar HTTP checks pass with the production phase.
  These explicit fixture continuations are not a new complete all-files gate.
- The framing repair has the ten-check browser receipt above. Final-candidate
  account Settings, privacy and retained-reader browser acceptance is pending.
- The earlier complete calendar gate has 202 files, 1,290 passes and two expected
  skips. It remains historical baseline evidence, not a fresh full run here.
- Deduplicated route/layout asset comparison against the public-guidance build
  measures 1 to 5 additional gzip JavaScript bytes and 7 CSS bytes across six
  routes, including release-note changes. Source inspection finds no new query,
  dependency, client component or background fetch. No speed or capacity
  improvement is claimed.

Before release acceptance, record the development diagnostic repair and its
HTML/RSC regression results; final service results and exact tested source;
the final browser groups and retained-DOM/recovery disposition;
required regression/recovery gates; final integrated and serving commits;
READY deployment and canonical assignment; live headers/session checks;
migration/installed-recovery consistency; production write/send counts and scoped
runtime errors. These fields are pending, and this document does not mark the
candidate merged, released or verified live.
