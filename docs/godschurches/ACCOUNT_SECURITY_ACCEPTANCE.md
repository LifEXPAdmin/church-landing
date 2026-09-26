# Account security acceptance

## Scope and evidence, 26 September 2026 UTC

The demonstrated framing, session-selection and development-diagnostic defects
are repaired in serving source `2c92f844d5996d3f87afab0bdbb63c45f41ddf2e`,
version **2026.09.26.3**. Its deployment
`dpl_2FYJbVoLpokFY7hu4rwu961tX5Zw` was independently READY and canonical at
04:59 UTC. Live acceptance completed at 05:01 UTC. This is a scoped review of
current adult accounts and their existing private-data boundaries. The broader
partial requirements below remain open.

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
| V3.4.3, V3.4.4, V3.4.6 | `next.config.ts` installs the global framing, object/base and MIME-sniffing response policy. `scripts/qa-account-security-headers.mjs` verifies ordinary pages, guest private/API responses, a 404, the manifest and actual cross-origin framing. Ten checks also pass on the final serving-source build; the complete CSP requirement is partial. |
| V8.1.1, V8.1.2; V8.2.1, V8.2.2, V8.2.3; V8.3.1, V8.3.2; V8.4.1 | Existing account, church, Support and audience contracts define separate permissions. `admin-authority.ts`, `post-access.ts`, `calendar-access.ts` and `account-read.ts` enforce current grants, owner/object/field scope and serialized revocation in the trusted service. `portal-service.test.ts`, `portal-http.test.ts`, `calendar-http.test.ts`, `post-read-concurrency.test.ts` and `membership-revocation.test.ts` cover cross-account/church reads and concurrent authority loss. This is a selected inventory, not a proof for every endpoint. |
| V14.2.2, V14.2.6, V14.3.2 | Explicit DTOs exclude credential/private fields. `community-search.ts` applies current source predicates; `feed-reads.ts` rehydrates bounded ID snapshots through current permissions. Private HTTP/media responses use no-store. `community-search.test.ts`, `profiles-http.test.ts`, `post-availability.test.ts` and `media-http.test.ts` cover search, field projection, revocation and cache headers. Public church publication is distinct from private setup drafts; `communityListed` is provenance, not a visibility grant. |
| V5.2.1, V5.2.2, V5.3.1, V5.3.2, V5.4.1, V5.4.2; V14.2.8 | `media-processing.ts` bounds bytes/pixels, checks image content, rejects unsupported animation and re-encodes derivatives without embedded private metadata. `media-storage.ts` uses private generated keys; `media-boundary.ts` rechecks access and fixes safe response filenames. `media-processing.test.ts`, `media-boundary.test.ts` and `media.test.ts` cover disguised/truncated files, streaming limits, metadata and revoked delivery. This does not establish antivirus scanning. |
| V7.5.3, V8.2.3; V14.2.1, V14.2.6, V14.3.2 | `account-export.ts` creates a bounded owner projection under a short-lived session/credential-bound proof; the proof stays out of URL paths and queries. `account-export.test.ts` covers cross-session/account rejection, expiry, revocation, attachment/no-store headers and explicit size failure. Credentials, factor material and another person's private records are excluded. |
| V14.2.4, V14.2.7 | `account-deletion.ts`, `retention-journal.ts` and `retention-restore.ts` reuse explicit erasure, content-free protected controls and conservative restore retirement/quarantine. `account-deletion.test.ts`, `retention-controls.test.ts` and `retention-restore.test.ts` cover retained decisions, failed protection and stale restores. Scheduled/provider expiry and recovery operations require their own dated receipts. |
| V1.2.1, V1.2.2, V1.2.4, V1.3.6; V2.2.1, V2.2.2 | Account/profile/source paths use bounded typed fields, React text encoding, Prisma queries and parameterized raw SQL. `post-link-fetch.ts` checks both DNS families, denies private/special-use destinations, revalidates every redirect, pins the validated address with TLS verification and bounds total time/bytes. Fresh `post-link-fetch.test.ts`, `post-links.test.ts` and `post-links-http.test.ts` verify rebinding, mixed DNS answers, hostile inert metadata, actor-bound receipts and revoked-session reads. `share-card-images.test.ts` verifies XML/HTML escaping and ignored user-supplied image URLs. This selected review is not an exhaustive injection assessment. |

## Sensitive data inventory for the reviewed features

This inventory groups the current data by its existing owner and disclosure
boundary. Publication can reveal religious affiliation, prayer or church
participation even without a conventional contact field. Consent and source
audience therefore remain part of each read, export and notification decision.
No end-to-end encryption or recall of downloaded copies is claimed.

| Data and examples | Current exposure and retention boundary |
| --- | --- |
| Sign-in identity, email verification, adult acknowledgement, provider subject, password/session/recovery material | The owner receives selected account settings; ordinary public/member DTOs exclude sign-in contact and credential fields. Session/grant tables contain token hashes. Export omits credentials, factor material and session/security records. Deletion revokes access immediately and removes private identity fields under the accepted erasure contract. |
| Names, usernames, profile content, church connections, directory contact and grants | Public authorship can identify the author; member profiles and church directory fields have their separate current audience and consent rules. A role choice never grants authority. Export includes only the owner's selected input; shared church records and internal grants/audits are separate. |
| Posts, comments, prayers, drafts, personal calendar details and participation | Stored source audience and current account/church access govern projections, search and linked media. Private drafts and personal calendar details do not become rich anonymous share previews. Other viewers can retain content already deliberately published or shared; withdrawal prevents fresh authorized reads, not screenshots. |
| Contact requests and direct-message text | Accepted two-person membership, current eligibility, blocks and personal visibility govern actual routes. Clearing one participant's view does not delete the other participant's retained history. Canonical text is purged within 30 days after neither participant retains it; permanent account deletion removes live identity linkage but disclosed recipient-history exceptions remain. |
| Support submissions, claim proof and selected report evidence | Current requester/coordinator/reviewer authority applies to exact cases and selected evidence. Ordinary export excludes other people's replies and internal staff/authority records. Selected evidence is reviewed while open and expires within 180 days after final closure unless an exact scoped hold applies. |
| Uploaded images, captions, derivative metadata and provider keys | Current source rights govern every derivative; generated keys and provider paths stay server-side. Image normalization strips embedded metadata. Account erasure waits for acknowledged provider garbage collection before claiming image deletion complete. Public sharing uses an explicit anonymous projection rather than exposing originals. |
| Notification preferences, device endpoints, activity references and browser state | Channel consent does not change source permission. Revoked endpoints are disabled immediately and purged within 24 hours of detection; content-free push diagnostics expire after 14 days. Browser drafts, layout preferences and deletion progress capabilities have their own bounded owners and are not a promise of zero local sensitive state. |
| Deletion/recovery control records and backups | Protected control records contain opaque references, dates, policy and outcomes. Restore replay retires restored access and reapplies deletion before traffic. Ordinary backups have a 30-day maximum age; copying does not restart expiry. Separate provider inventory and actual scheduled/restore receipts establish operations, not this table alone. |

The [account deletion contract](ACCOUNT_DELETION_CONTRACT.md),
[messaging retention policy](MESSAGING_RETENTION_POLICY.md),
[media sharing contract](MEDIA_SHARING_CONTRACT.md) and
[retention operations](RETENTION_OPERATIONS.md) retain their exact exceptions
and implementation evidence. A saved owner export is a separate local copy under
that person's control. This scoped inventory does not establish a complete
provider/browser storage classification or legal data-access fulfillment.

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

## Verified release and remaining acceptance

The final source passes the production build, types, scoped lint, copy and
[Linux source-security workflow](https://github.com/LifEXPAdmin/church-landing/actions/runs/36218842549).
The runtime guard verifies 231 traces; the build secret exclusion and existing
hydration guard pass. Twenty service/HTTP files on `1ce6d2e` pass 147 checks,
including twelve checks after an actual isolated legacy-schema upgrade through
110 migrations. Final `2c92f844` adds only the request-store redaction to runtime
source. Seven final-source files pass 33 checks, covering session replacement,
private message/report/claim routes and hostile link handling. The eight session
cases appear in both sets; these figures are not 180 unique cases.

The final built browser passes ten header/framing checks, five account Settings,
five privacy Settings and eight retained-reader groups. The development repair
passes all 18 identical before/after probes and its permanent HTTP regression
on matching source hashes. No raw cookie/header secrets appear after the repair.
The retained-reader groups prove concealment, fresh access denial and authorized
restoration; they do not prove removal of every hidden DOM value.

Initial missing legacy fixtures, a shared delivery sink and an incorrect calendar
render phase are preserved as failed fixture attempts. Their explicit corrected
runs pass without weakening application controls. The earlier complete calendar
gate remains the broad baseline: 202 files, 1,290 passes and two expected skips.
This delta does not claim a new complete all-files run.

All 17 live guest HTTP/browser checks and six health checks pass. The exact
serving SHA, product version and independent canonical deployment match.
All 149 production table fingerprints are unchanged. All 110 source, production
and installed migration checksums match, with zero new or pending migrations.
Unchanged schema/recovery code reuses the actual 03:33 encrypted restore and
scheduled backup receipts; no new restore or scheduled run is claimed. Scoped
runtime error and fatal rows are zero. Verification made zero production test
writes, sent zero recipient notifications and issued no new queue probe.

Deduplicated route/layout assets compared with the verified public-guidance
build grow 2 to 6 gzip JavaScript bytes on Home, Gather, Exchange, Serve and login,
and 358 bytes on Settings; CSS grows 7 bytes per route. These measured build
outputs include release-note content and bundler variation. No query, dependency,
client component or background fetch was added. No speed or capacity improvement
is claimed.

The broader security/privacy acceptance stays open for the explicit partial
requirements and retained-DOM/recovery disposition above. Actual MFA enforcement,
provider ownership/isolation, physical-device and adult-pilot gates retain their
existing owners. The live fixes do not close those gates or establish complete
ASVS compliance.
