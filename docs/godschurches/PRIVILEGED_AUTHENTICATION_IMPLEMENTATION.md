# Privileged authentication implementation

September 16, 2026 UTC. **Enrollment engineering is published and verified live**
on **2026.09.16.9 / 4b834fba491a0d1c031aafe6dbfed03d8ab5e4e2**. The exact
READY canonical deployment is **dpl_4V71AAVKY7MvWySTY2kGQwyusvtM**.
This follows [the accepted assessment](PRIVILEGED_AUTHENTICATION_ASSESSMENT.md).
Enrollment is available; broader enforcement remains disabled pending the real
adults' private enrollment, recovery readiness and controlled activation checks.
The overall privileged-MFA acceptance therefore remains open.

## Adapter and staged rollout

Retain native primary accounts and the existing optional Google adapter. The
factor implementation uses pinned `@otplib/totp`, `@otplib/plugin-crypto-node`
and `@otplib/plugin-base32-scure` **13.5.0**. The maintained RFC 6238 and Base32
implementations replace the local algorithms. Existing encrypted factor format,
one-use recovery hashes and primary-credential checks remain compatible. This
is a library integration with the native account adapter, not an assertion that
Google or a new hosted identity service provides second-factor assurance.
No subscription, account migration or provider account is created.

The module selection follows the upstream
[Node and modular installation guidance](https://otplib.yeojz.dev/guide/getting-started.html).
Replay bounds use the library's
[verified time step](https://otplib.yeojz.dev/api/%40otplib/totp/type-aliases/TOTPVerifyOptions.html).
Factor replacement follows the existing accepted policy and
[OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

`PRIVILEGED_MFA_MODE` is `off`, `enroll` or `enforce`; an unknown value fails
closed. The current implementation defaults to `off`. Enrollment requires a
configured essential account-email channel and a verified eligible adult.
Setup grants no authority. Allowing setup before a first topic duty avoids a
bootstrap deadlock. Broader enforcement must wait for actual adult enrollment,
recovery-code handling and the controlled activation checks. Ordinary sign-in,
personal settings and unsent work retain their existing boundaries.

## Binding and recovery

The validated database session binds only to its transaction object, never the
shared Prisma client. A challenge records its session, credential generation,
factor version, current authority digest, purpose and fixed expiry. Ordinary
privileged use lasts ten minutes; sensitive access changes, aggregate export,
Support redaction and announcement sending have a separate one-use five-minute
purpose. Authority checks remain necessary after authentication.

Current source generations cover platform and Support grants, effective direct
and position-derived church permissions, topic ownership/moderation and the
configured eligible founder. Actual approved primary/backup coordinator
appointments are included for their explicitly shared Support access; public
contact titles and profile categories still confer nothing.

Enrollment is bound to its original session and current primary credential.
Replacement needs a current factor or unused recovery code plus fresh primary
authentication. It retires other sessions, proofs, the old factor and all old
codes. An unfinished replacement can be resumed only in its original sign-in.
Loss of that sign-in or both factor and recovery codes requires trusted identity
review; no email-only or Support override is implemented.

Protected restore deletes challenge proofs and pending notices and leaves an
opaque quarantined-factor marker with no usable secret. Removing the marker
would incorrectly allow password-only reenrollment. Permanent account erasure
removes the factor, proof and notice records under the existing deletion owner.
No factor secret, recovery code or primary credential belongs in account exports
or structured audit results.

Factor confirmation and replacement create essential private security notices.
The owning action attempts the existing email adapter after commit; the existing
notification maintenance path retries pending notices with bounded attempts.
The settings screen distinguishes provider acceptance from unconfirmed delivery.
These notices are separate from optional social preferences and are removed by
account erasure and protected restore. Delivery failure never claims success.
Private operational health reports only pending/exhausted counts and oldest age;
exhausted retries or more than five minutes pending raise an attention flag.
The existing maintenance result continues to report pending notices after the
automatic retry limit, and no provider body, email address or key enters health.

## Verification

The final authentication/health service run passes **21 checks**: ten broad
privilege/authentication groups, four existing authenticator/access-manager
groups, and seven operational health groups. Fresh **91-migration** installation,
populated upgrade and fixture dump/restore pass. The separate protected-form run
passes **55 checks** across authentication, protected restore, church/calendar,
topic and portal boundaries. The historical Stage2A upgrade case needs the full
gate's special fixture and was excluded from that focused portal run; the complete
gate retains it. These counts overlap and are not a sum of unique checks. The final privacy case
uses a confirmed factor and real session proof: personal export excludes factor
material, and the existing permanent-erasure service removes only that owner's
factor, proofs and notices while preserving another enrolled account.

Six browser groups pass against the actual enforcement-mode production build at
`1ef3919`: guest/unverified denial, real QR decoding and exact lost-response
retry, eight private recovery codes and focus concealment, a complete unsent
topic form resumed through confirmation in another tab, phone/desktop doubled
text and navigation boundaries, invalid-code editing, factor replacement and
account-switch removal of retained secrets. Enrollment mode passes its separate
production-build check at `3ef52b1`: explicit setup is available without creating
a factor/proof or locking an existing operator out of assigned work.

Provider transport was a fictional loopback fixture with external sends blocked;
production policy was unchanged. No real factor, production test account, email,
phone alert or permission was created. Screenshots exclude keys/codes/passwords.
Types, copy validation and lint pass (35 existing unrelated warnings). The final
local build has 193 traces, 61,627 entries and 490 server JavaScript files, with
no private fixture/environment material or Prisma configuration-loader path.
The full regression gate passed against checkpoint `f8810b8`: **174 discovered
test files**, 1047 reported passes and 2 expected skips, including development
and production HTTPS, actual server-process restart, synthetic staged upgrades,
fresh installation and full restore. Later changes have the scoped service and
browser checks above. The final runtime is `3ef52b1`; subsequent commits change
only evidence and the additional owner export/erasure regression. The final
production-build public/access pass has **32 checks**, no browser errors and no
writes. Counts from overlapping stages are not distinct test-case totals.

The actual protected production-copy rehearsal completed **11:06:59 UTC**:
90 to 91 migrations, all 121 original-table column fingerprints preserved,
protected replay complete and plaintext removed. The source connection was
read-only. Installed recovery-registry propagation was completed in this same release after the exact production
migration history was verified, as recorded below.

Earlier test-fixture and build failures are preserved privately. They include
strip-only TypeScript syntax, the quarantined-factor constraint, required fixture
fields, a legacy-upgrade fixture mismatch, browser selector/DNS setup, and a
heap-limited build in the long-lived checkout. Corrected scoped tests and clean
worktree builds pass; none is represented as a successful initial attempt.

Challenge retries match the exact request and current session proof. A session
without a proof incurs one indexed lookup before rejecting privileged projection,
rather than loading every authority source. The authenticator screen conceals
private entries on backgrounding and rechecks its account and opaque session
view key before revealing them. Changed sign-ins remove retained secrets;
unchanged sign-ins can resume. Setup keys and recovery codes remain only in
component memory and expire from view after ten minutes.

## Exact production and recovery acceptance

The authorized fast-forward release uses the existing canonical project and Git
integration. One production setting was added: `PRIVILEGED_MFA_MODE=enroll`.
The provider applied migration `20260916103000_privileged_authentication` at
**11:43:03 UTC**. All **91** production migration checksums match. The release
was **READY at 11:46:00.963 UTC**; the independent alias lookup and canonical
release endpoint both match the full application SHA above. It waited **234.693
seconds** behind the pre-existing counterpart project's shared build slot. No
other project's configuration, plan or domain was changed.

**32 public/access checks, five private health checks and four actual signed-in
UI groups pass.** The real authenticator screen offers primary-confirmed setup
and says no factor is confirmed; Account Security links to it. Existing assigned
Admin access and the original post/discussion remain available. Health confirms
enrollment enabled, enforcement disabled and zero pending/exhausted security
notices, with no attention flag. These read-only observations do not enroll the
owner, send a notice or certify a physical authenticator/device.

All **121 original-table column fingerprints** match between **11:37:30.357 and
11:50:58.850 UTC**. Production factors, session proofs and security notices are
all zero. Application account/content/preference/grant writes, test accounts and
outbound sends are **zero**. The release's actual production changes are the one
additive schema migration and one configuration setting. Public browser errors
are zero, as are provider error/fatal rows in the scoped **11:46:00.963 to
11:50:00 UTC** observation window.

The provider build verifies **193 traces, 61,534 entries and 489 server JavaScript
files**, without private fixtures, environment files or a Prisma configuration
loader. Canonical Home loads the provider-verified 173,096-byte hydration renderer,
SHA256 `2b7c5f99a8710e52520e7d0dc25c9fb65fd7c06e0a1d6cfee97276e0a452a3b7`.

The installed recovery registry now has **91** matching entries and preserves
all 90 prior checksums; its existing backup-retention source hash is unchanged.
The actual installed daily encrypted-copy restore passed **91 to 91** migrations
and restored **123 tables** at **11:45:38.620 UTC**, with plaintext removed. This
ordinary daily check does not perform the protected-replay/upgrade comparison;
the separate **11:06:59 UTC protected release rehearsal** supplies that evidence.
Nightly validation at **11:47:14.104 UTC** checks **60 encrypted sets**, with no
issues, expiry removals or attention flag. The local recovery host must be awake.

## Remaining activation prerequisite

Actual adults must enroll privately and retain their recovery codes themselves.
Before changing to `enforce`, inventory every current privileged authority and
verify each required person's real factor, normal duty, another-sign-in challenge
and recovery readiness without copying keys or codes into evidence. Confirm the
actual essential notice channel and inspect pending/exhausted counts. An enabled
configuration or passing fictional test cannot substitute for these observations.
Do not create test grants or bypass identity review to make this gate appear met.
Ordinary accounts remain available throughout.

Loss of both factors and recovery codes needs trusted human identity review;
this release supplies no email-only or self-service administrative override.
Google configuration and optional passkeys remain their own existing priorities,
not new prerequisites or inferred purchase requirements for native enrollment.
