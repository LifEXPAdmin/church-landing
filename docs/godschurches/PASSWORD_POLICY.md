# New-password screening

27 September 2026. Local implementation and service verification; browser,
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
weakened. Browser and actual built HTTPS evidence will be appended after running.

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
