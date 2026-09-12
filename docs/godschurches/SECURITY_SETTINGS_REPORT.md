# Security settings and confirmation returns

## Existing authority and current increment

Security uses the account service's existing usable-password and linked-Google
metadata. The shared projection runs inside the current owner/session transaction;
only booleans leave the service. Hashes, provider subjects and proof tokens are
excluded. Provider configuration is a separate availability gate. Missing method
metadata is a failed read, never evidence that a password exists or recovery
completed. The underlying credential service remains authoritative for every action.

| Current account state | Settings behavior |
| --- | --- |
| Usable password | Existing current-password confirmation and supported account actions. A linked, available Google method can be chosen under its existing contract. |
| Google only, provider available | Existing Google confirmation for the specific action; adding a password does not ask for a nonexistent current password. |
| Google only, provider unavailable | Read-only status and session review remain available. Sensitive controls give existing email-recovery guidance and cannot submit a password form. |
| Legacy account with no usable method | Read-only account/session controls and truthful recovery availability. No client-created password, verification, account claim or privileged bypass. |

Security shows actual password, Google, email verification and recovery
availability, with links to current sessions and methods. Requesting email recovery
is distinct from completing verification. MFA, passkeys and configurable security
alerts remain unavailable pending their separate services and activation gates.

Google confirmation returns are selected by the existing server-validated action
purpose: Password, Devices and sessions, Data export, Deactivation, Sign-in email
or Connected sign-in methods. Email confirmation retains its separate confirmation
page and bound HttpOnly cookie. The request whitelist gains no client destination
field. Proofs retain owner/session/credential-version/purpose/expiry and one-use
checks; a callback alone never performs the protected action. Expired confirmation
requires a new proof and returns to the same detail. Linked-method callbacks now
return directly to the existing methods screen.

Signed-in recovery returns to Security; verification returns to its account detail.
Unavailable recovery/verification states retain their own heading and explanation.
No schema, provider configuration, permission or production identity change is
included. See [account integration](ACCOUNT_SETTINGS_REPORT.md), [Settings](SETTINGS_CONTRACT.md)
and the [Google contract](GOOGLE_ACCOUNT_REPORT.md).

## Verification checkpoint

Four method/context groups, twelve Google boundary groups and eighteen Google
service groups passed. Tests use actual transaction and signed-token verification
with isolated fictional identities and substituted provider transport. They cover
method privacy, changed/revoked access, existing sensitive actions and an expired
proof followed by a fresh proof returning to the intended detail. Actual Google
Cloud configuration, provider consent and physical device acceptance are separate.
Product `2026.09.12.12` is verified locally and live. Seven built
browser groups passed, including unavailable/unknown metadata, passwordless and
provider-disabled controls, actual verification-state refresh and two explicitly
simulated enabled-provider UI cases. The real signature/boundary groups above
separately enforce expiry and purpose. Five Account browser regressions also pass;
current session preservation and uncertain-revoke recovery remain intact.

Twenty Settings/navigation/release groups pass. Types, scoped lint and production
build pass: 121 traces, 10,292 entries and 300 server JavaScript files. Phone/desktop
320/390/1440px doubled text, keyboard and screenshots were checked without browser
errors. No actual provider redirect, production email, account change or device
acceptance is inferred from the isolated simulations.

Application `246e6f758656bbdb9acceb85613dacaa62006e14` is serving on READY
deployment `dpl_F7rEWec2e8XZFoaFJBT1aNQ8dLdW`; the independently read canonical
assignment matches. Ten read-only live checks at 13:00:32 UTC passed with zero
application writes, browser errors or scoped runtime error rows. Exact product
and commit, release notes, Explore links, protected Settings routes/context,
recovery/verification navigation and preserved private photo/draft gates were
checked. Fresh backup/restore and all 30 migration checksums passed before push;
no production migration, identity, provider or permission change was needed.
