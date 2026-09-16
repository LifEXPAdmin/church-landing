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

## Current verification and remaining work

Eight focused checks pass on a fresh isolated fixture with **91 migrations**,
populated upgrade preservation and an actual fixture dump/restore. They cover
library vectors, key protection, owner enrollment, forged requests, fixed expiry,
authority changes, another session, consumed step-up, concurrent recovery,
retired codes and retained personal access. Type checking and website-copy
validation pass at this intermediate checkpoint. No production writes occurred.

Two earlier failures are preserved privately: Node's strip-only TypeScript runner
rejected a parameter-property declaration, and the existing factor constraint
rejected the new quarantined empty-secret state. Both were repaired before the
passing focused run. This is not full regression or real-device evidence.

Still required within this feature: complete the privilege-surface and alternate
sign-in audit, source/HTTP/browser bypass and recovery tests, complete regression
and restore acceptance, notice failure/maintenance checks, polished challenge and
return flows, runtime-cost review, release notes, protected backup and recovery
registry integration, exact deployment/canonical/live verification and private
task reconciliation. Actual adult enrollment and enforcement activation require
their own evidence and are not implied by the engineering tests.
