# Privileged adult authentication assessment

September 16, 2026 UTC. Assessment of the original privileged-adult requirement
against the current native account service, optional Google adapter and access
manager authenticator. The current application is **2026.09.16.4 / 7f7d5da**,
READY and canonical in **dpl_3HQzyqU1K1UyVdGwsf8R8yyhEEDA**. This document
does not enable broader MFA, change a grant, enroll an account or replace login.

## Findings

The original requirement calls for stronger authentication for guardians and
organization administrators, a TOTP/passkey-ready adapter, recovery codes,
step-up checks, and enrollment/recovery/bypass acceptance. SMS alone is excluded.
The focused implementation requirement also excludes new custom cryptography.

Primary authentication is the repository's password/database-session service.
The optional Google adapter validates issuer, subject, audience, expiry and nonce
through `google-auth-library`; its returned identity does not carry a verified
authentication-method or provider-authentication-time assertion. Its purpose-bound
recent-authentication record confirms an account action, not a second factor.
The actual public login response on this date reports Google unavailable. A prior
local environment snapshot is recorded separately and is not current-provider proof.

`admin-access.ts` requires both fresh primary credentials and a consumed TOTP for
new platform/support grant changes. Only an existing `MANAGE_ADMIN_ACCESS` holder
can enroll through that interface. It preserves exact retries, current grant and
factor versions, eight one-use recovery codes, encrypted setup and protected
restore retirement. This is a locally implemented RFC 6238 adapter using Node
cryptographic primitives; it is not an external MFA-provider integration.

`adminAuthority`, support, effective church grants and topic moderation do not
establish a general second-factor requirement. The existing grant-management gate
therefore does not cover the privileged duties below. Four current isolated
authenticator regressions pass, including encryption/account-substitution checks,
replay rejection, recovery and revoked authority. Those checks establish the
limited existing implementation, not broader coverage.

A read-only production inventory at **05:42:51 UTC** finds one nonrevoked community
report-review grant, no support/direct church/role-contribution grants, no topic
communities/moderator memberships and no authenticators. Counts describe stored
grants, not a fresh expansion of every effective permission. No identity, secret
ciphertext or recovery value was selected. Production writes are zero.

## Enrollment policy by actual authority

Use current capabilities and their source generations, never profile role labels,
position titles, membership alone, a public founder name or a client assertion.
Believer, Exploring Faith, Church, Creator, Business and Builder profile choices
remain unrelated to privileged authentication.

| Authority | Required enrollment and challenge policy |
| --- | --- |
| Platform operators | Every active capability in `OperatorCapability` requires verified adult eligibility and confirmed MFA before using its privileged surface. This includes product-feedback management, metric view/export, operational health, account lookup/management, audit, access management, church establishment/listing/claim/access review, relationship-owner assignment and community-report review. Access changes and sensitive exports additionally require fresh purpose-bound step-up. |
| Support staff | `RESPOND`, `ASSIGN` and `REDACT` require confirmed MFA before private case access or action. Assignment never satisfies the challenge or widens case scope. Redaction requires fresh purpose-bound step-up. |
| Church duties | All effective `ChurchCapability` grants require confirmed MFA for their privileged use: welcome hosting, connection review, coordinator appointment, profile/access/structure management, calendar editing, event/post publication, post moderation and volunteer management. Both direct and position-derived contributions use the same gate. Access/appointment changes require fresh purpose-bound step-up. Ordinary church membership remains independent. |
| Topic owners and moderators | Ownership or current moderator membership requires confirmed MFA for moderation/administration. Ordinary topic participation stays under its existing account and audience rules. |
| Founder announcement sender | The configured, eligible sender requires confirmed MFA and fresh step-up for the existing explicit recipient-preview/send operation. This adds no authorization to send an actual announcement. |
| Guardians and future organization types | No guardian/child account or future business/ministry authority is activated here. Their eventual privileged boundary must require this policy before enabling those duties. Profile labels alone create no duty or MFA requirement. |

Enrollment is owner-bound and requires fresh primary authentication. A newly
assigned privileged adult can reach a minimal enrollment screen without reading
private operational content. Enrollment creates no role. Existing adults must
complete a controlled enrollment rollout before broader enforcement activates;
this assessment does not silently lock out the current reviewer.

## Recovery and bypass policy

An authenticated provider assertion must bind issuer, subject, account, current
session, credential generation, factor/recovery generation and intended purpose.
The application must validate it server-side and recheck current authority.
An ordinary privileged window expires after ten minutes without sliding refresh;
sensitive changes require a separate, one-use proof no older than five minutes.
Changing account, grant generation or factor invalidates the relevant proof.
Exact command retries may return their original receipt but cannot authorize a
different mutation. Browser flags, ordinary cookies and submitted role names
cannot manufacture assurance.

Password sign-in, Google sign-in, password reset, email change, provider linking,
session replacement and account reactivation must all reach the same privileged
gate. Recovery of the primary account does not remove or satisfy the second
factor. Ordinary account access and unsent personal work remain available through
their existing protections while privileged work needs a challenge.

Factor replacement needs an enrolled factor or a one-use recovery code in addition
to fresh primary authentication. Retire old factors/codes and privileged proofs,
revoke other sessions, confirm the replacement, and retain an opaque audit.
Losing both factor and recovery codes requires a documented trusted identity
review and independently authorized handling before any recovery path is enabled;
email verification, a support reply,
knowledge questions or a requested role cannot bypass it. No reviewer may grant
themselves access through recovery. Recovery and factor-change notices belong in
the same implementation cycle, with a tested available channel before activation.
Secrets, raw codes and provider tokens stay outside logs, exports and ordinary UI.
Protected restore must quarantine restored factors/proofs rather than revive them.

## Provider boundary and remaining implementation

The current service has no provider-backed broad MFA enrollment/challenge/recovery
integration. Preserve the native primary-account adapter and existing data; do not
replace accounts or require Google for ordinary sign-in. Do not expand the local
TOTP implementation into another custom cryptographic system to satisfy a
provider-integration requirement.

Google now documents optional `amr` and `auth_time` claims, requiring a published,
verified app and enabled additional claims. They describe the Google session,
can be absent, and do not force a fresh Google authentication event. They cannot
be assumed from ordinary consent or ID-token issue time. The current adapter
requests neither claim. These are potential provider inputs, not proof of this
application's enrollment, fresh step-up or recovery acceptance. See
[Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
and [Google Security bundle](https://developers.google.com/identity/siwg/security-bundle).

The existing broad-MFA implementation action must resolve the compatible provider
binding, enrollment access and recovery capability before activation. Provider
selection, adapter implementation and isolated verification are unfinished
engineering work, not an external blocker by themselves. Reuse the existing
account adapter and evaluate supported provider/library capabilities before
assuming a new subscription or account migration is required. The no-custom-
cryptography requirement still applies. Actual provider configuration access and
the privileged adult's own factor enrollment must be verified before enforcement;
neither has been demonstrated for broad MFA. No subscription, provider account or
paid service was created. Existing Google activation alone would not satisfy the
complete enrollment, fresh step-up and recovery requirements.

Required finishing work remains with that same feature: provider adapter,
owner-bound enrollment/recovery UI, server gates across every listed authority,
fresh step-up, essential notices, protected recovery and staged activation.
Verification must exercise every primary sign-in path, direct API/SSR access,
role/factor loss, stale account and proof replay, interrupted enrollment, lost
responses, concurrent recovery, restored backups and retained ordinary access.
Provider/device enrollment evidence is separate from isolated test assertions.

The recovery and factor-change policy is consistent with
[OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
This is a bounded gap assessment and implementation contract, not an independent
security audit or a claim of complete privileged-MFA enforcement. The separate
permanent-deletion scopes can be reconciled against their already published
acceptance without waiting for future provider enrollment.
