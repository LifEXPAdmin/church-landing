# Privileged authentication implementation

September 16, 2026 UTC. Work in progress, not published or activated. The current
canonical application remains **2026.09.16.8 / 012ccf7**. This feature follows
[the accepted assessment](PRIVILEGED_AUTHENTICATION_ASSESSMENT.md); its final
acceptance, release and actual enrollment evidence remain outstanding.

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

## Current verification and remaining work

The final authentication/health service run passes **20 checks**: nine broad
privilege/authentication groups, four existing authenticator/access-manager
groups, and seven operational health groups. Fresh **91-migration** installation,
populated upgrade and fixture dump/restore pass. The separate protected-form run
passes **55 checks** across authentication, protected restore, church/calendar,
topic and portal boundaries. The historical Stage2A upgrade case needs the full
gate's special fixture and was excluded from that focused portal run; the complete
gate retains it. These counts overlap and are not a sum of unique checks.

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
The full regression gate is still running against checkpoint `f8810b8`; later
changes have the scoped service and browser checks above. Do not claim the full
gate passed until its final receipt is recorded.

The actual protected production-copy rehearsal completed **11:06:59 UTC**:
90 to 91 migrations, all 121 original-table column fingerprints preserved,
protected replay complete and plaintext removed. The source connection was
read-only. Installed recovery-registry propagation belongs to the same release
and remains pending until the exact production migration history is verified.

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

## Activation and release acceptance

The engineering release is prepared for `enroll`. It must complete the full gate,
exact deployment/canonical/live checks, current migration and installed recovery
registry verification, and private task reconciliation before publication is
claimed. The public release candidate is **2026.09.16.9**. Production remains the
version stated at the top of this report until those receipts supersede it.

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
