## Password safety and post resource cards verified live, 27 September 2026 UTC

Password screening .32 and current listing/event/volunteer post cards .33 are
**implemented, tested, merged and verified live** in one **2026.09.27.33**
deployment. Source `8c0a7ad5184beb05908cf5f0034c83576edbc393` is READY and
canonical as `dpl_CXsPBL3gCRDkHAvvzaxGgzaMQNrw`, independently serving from
`godschurches.com` at **23:22:45 UTC**. This supersedes the local-only entries below.

Combined build `UDUz_KdQ1zgHa-A0tUPrb` took 42.199 seconds with all 1,965 tracked
files unchanged. Full TypeScript, lint/copy/build security and exact-source CI
passed. Twelve password and thirteen resource-card browser groups passed against
that build. The focused 116-assertion run passed 115 and recorded one query-count
mismatch, 13 versus 14. The unchanged four-test availability rerun passed; four
captured diagnostic reads each used the same 13-query policy sequence and one
bounded post query. Review found no reproduced product regression. The original
extra query is unidentified; asynchronous log attribution is credible, not proven.
The failed run remains recorded and is not presented as a clean whole-suite pass.

Production passed 100 guest/page/browser/API checks and six health checks, with
zero page errors, blocked mutation attempts, scoped error/fatal log rows, test
writes or real-recipient sends. All 153 original-table/column fingerprints were
unchanged at **23:24:50 UTC**. No new queue probe or provider activation occurred.

The single additive resource-reference migration was applied at **23:19:19 UTC**;
all 118 source and production checksums match. Existing post references were empty
and valid. Protected encrypted 117-to-118 restoration preserved all 153 original
table/column fingerprints and completed stable frozen-journal replay with zero
provider-write attempts or unresolved items. The installed 118 registry, ordinary
118-to-118 restore and actual nightly run 24 to 25 passed. All 111 backup sets
were preserved; there were no expiry candidates, removals or maintenance issues.

New-password checks run locally only at registration, change/add and reset.
Existing credentials still sign in unchanged, and rejected new choices preserve
the original session, reset grant or Google confirmation for correction. The
finite historical password corpus is not a current global breach lookup. Resource
cards recheck present source access and compatible publication audiences; hidden
or unavailable sources reveal no previous details. Removal-only edits retain the
unsaved-work guard, and reconnect respects focus and current access.

The broader security task and complete attachment tasks remain open: media and
campaign adapters need their owning source services and acceptance. Full CSP,
cookie prefix/session-idle policy, real MFA enforcement, provider/device/operator
and pilot gates are separate. Retain the complete .33 artifact and 118 schema;
the prior .31 client is additive-schema compatible but lacks these new behaviors.
Prefer a reviewed forward fix. No schema downgrade or production-restore readiness
is implied. See [password policy](PASSWORD_POLICY.md) and
[post attachments](POST_RESOURCE_ATTACHMENTS.md) for the scoped contracts.

# New-password screening

27 September 2026. Local implementation, service and built-browser verification;
combined-release and live acceptance remain pending. This is a scoped control,
not a security certification or a claim that every breached password is known.

Before editing, an isolated fixture reproduced common-password registration,
product-name password change and username-based reset acceptance. The existing
length-only verifier accepted all three. The repair applies only when choosing
a new password, at registration, authenticated change or addition, and reset.

## Policy and compatibility

Keep the established 8 to 128 UTF-16 unit boundary and recommend 15 or more in
the forms. Permit paste, password managers, Unicode and arbitrary character
composition. Existing credentials still use exact unchanged verification and
the existing salted scrypt storage. No forced reset, account scan, plaintext
credential storage or periodic rotation is introduced.

The server checks 10,000 distinct whole-password comparisons from the ranked
SecLists Xato corpus, after filtering by the existing length policy. The first
22,191 source entries contain those comparisons. The source is pinned to commit
`c5a05259b61cc60dee828ad1bf92c288c7e97ea0`; its SHA-256 is
`1472aafa2561df5e3293aee252aee3ca660c12b399a283cf808bb01b39be388b`.
The [source description](https://github.com/danielmiessler/SecLists/blob/c5a05259b61cc60dee828ad1bf92c288c7e97ea0/Passwords/Common-Credentials/README.md)
identifies the ranked credential dataset. Its age and finite scope matter:
this is a local historical common/compromised-password subset, not a current
global breach lookup. Corpus data is MIT licensed; the notice is retained in
`third-party/seclists-passwords-LICENSE.txt`.

For comparison only, normalize to NFKC, lowercase and trim. Also check the entire
candidate after removing punctuation/spacing. Stored hashes represent public
corpus entries, never submitted user credentials. The actual password passed
to scrypt is unchanged. Only server modules import this corpus. There is no
request-time network call, new package, credential or provider activation.

Context checks compare the whole compact candidate with these documented terms:

- `godschurches`, `godschurchescom`, `godschurchesplatform`, `churchplatform`,
  and `churchlanding`.
- The current account's full display name, public username, complete sign-in
  email and email local part. Registration uses only the submitted values.
- Case, punctuation and numeric prefix/suffix variants. Numeric identifiers
  and valid two-character names are included. Numeric wrappers around an
  identifier do not turn it into a different safe choice.

Words occurring inside a longer passphrase are not rejected merely for being
context words. No other account's details, church records or private contacts
are consulted. Comparison uses bounded inputs and an in-memory set.

## Mutation and recovery boundaries

Registration screening precedes identity lookup, preserving the same rejection
for new and existing email addresses. Change/add screening follows the current
session, original-owner check and user lock, before consuming current credential
confirmation. Reset screening follows current grant purpose, ownership, expiry,
credential generation and one-use validation, before consuming the grant.

A definitive rejection uses `ACCOUNT_PASSWORD_UNSAFE`, no-store feedback and no
credential-cookie changes. Account forms retain entries; a Google confirmation
that the server did not consume remains available for the corrected submission.
Rejected changes preserve password hash, credential version, sessions, reset
grants and Google proof rows. An accepted change still rotates credentials and
revokes all prior sessions/grants as before. Suspended, expired, wrong-account,
wrong-purpose, used and stale-generation proofs keep their existing denials.

## Evidence and maintenance

Five policy groups and nine account/boundary groups pass, along with twenty
existing Google lifecycle groups: 34 checks. Review reproduced and repaired
numeric-identifier and short-name comparison gaps. The first service run's
one failure was a test expecting 401 for the existing change-password ambiguous
cookie response; that route returns 400 with sign-in-required text. The corrected
test verifies the actual denial and unchanged account state. No boundary was
weakened.

Twelve actual built HTTPS browser groups passed on source `420e3fc`, build
`lpYVawBSCpVERc364KzkM`, with 1,953 tracked files unchanged. Rejected registration,
change/add and reset retained their original fields, credential state and grants;
corrected submissions succeeded. Google-only addition retained its browser and
server confirmation after rejection, then completed without another provider
confirmation. Existing common-password sign-in remained compatible. Concealment,
focus, keyboard Show controls, password-manager guidance, browser-storage absence
and enlarged 320, 390 and 1280 pixel layouts passed. Screenshots were reviewed.
There were no page errors, external requests, production writes or real sends.
Google provider exchange is fictional and does not establish real OAuth acceptance.
Two prior harness failures (a selector and a successful-navigation response-body
race) are preserved separately; neither required an application change.

The generator takes an independently reviewed local source file, verifies its
pinned checksum and deterministically writes the corpus. It never downloads a
list or processes real account passwords. A corpus update requires review of
its source, license, checksum, eligibility and tests, then a normal release.

This implements bounded evidence for ASVS 5.0.0 V6.1.2, V6.2.4 and V6.2.11, with
a finite historical subset for V6.2.12. See the
[authentication requirements](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x15-V6-Authentication.md).
Ongoing compromised-credential detection, full CSP, cookie-prefix/session-idle
policy, MFA activation and real provider/device/operator acceptance retain their
separate open gates. No NIST assurance-level claim is made.
