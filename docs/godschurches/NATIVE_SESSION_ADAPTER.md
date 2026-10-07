# Native account and session adapter

## Current scope

The native password and authenticator adapter is in local implementation and
verification. It is not yet merged or deployed. It extends the accepted
[web and native API contract](WEB_NATIVE_API_CONTRACT.md) without changing the
existing browser routes, account schema, dependencies or provider enrollment.
The mobile clients and their secure storage remain separate consumer acceptance.

The adapter issues the same opaque, random 32-byte session credential used by
the canonical account service. Only its SHA-256 lookup hash is stored. Native
password sign-in creates a separate session row; it does not copy a browser
cookie or that browser session's MFA proof. The database does not label a session
as web or native. Possession of a valid credential remains authority for that
session, irrespective of where it was originally issued. This adapter is a
separate transport, not a second identity or permission system.

## HTTP contract

All paths below are under `/api/platform/v1`. Requests use the configured account
origin over HTTPS, except isolated loopback development. Native requests have no
Origin or browser Fetch Metadata headers. There is no permissive CORS response.
The boundary rejects recognized account cookies even when they are empty or
invalid, malformed or combined Authorization values, and all query parameters.
Clients must not add a fake Origin or copy a browser cookie.

| Method and path | Credential and input | Result |
| --- | --- | --- |
| POST `/auth/password` | No existing credential or expected-account header. JSON `email`, `password`. | Bearer token, authenticated public identity and session lifetime. |
| GET `/session` | Optional single `Authorization: Bearer <token>`. Optional `X-Expected-Account` consistency check. | Guest without a credential, otherwise authenticated public identity. An invalid supplied credential always fails. |
| GET `/session/activity` | Bearer and required `X-Expected-Account`. | Current server time, idle deadline and absolute expiry. No renewal. |
| POST `/session/activity` | Bearer, required expected account, JSON `activity: "foreground"`. | Coalesced foreground renewal, within the original absolute expiry. |
| POST `/session/logout` | Bearer, required expected account, empty JSON object. | Revocation of this authenticated session only. |
| GET `/authenticator` | Bearer and required expected account. | Current eligibility, duties, factor state, notices and assurance for this session. |
| POST `/authenticator` | Bearer, required expected account, exact command schema below. | Historical command receipt and, where appropriate, private enrollment or recovery material. |

Native JSON contracts are in `lib/platform/native-auth-contracts.ts`. The server
uses strict allowlists through `encodeNativeResponse`. Consumer decoders tolerate
additive fields, require the original expected account, and reject contradictory
envelope and embedded identities. Password issuance has its own discovery
decoder. Session discovery uses the existing `decodeApiSession` contract.
Password bytes are preserved; email normalization remains in the account service.
No client actor, token, credential-method flag or account ID in a body supplies
authority. Ordinary commands have a 16 KiB request ceiling; activity and logout
are limited to 128 bytes. Body shapes reject extra fields.

Every success and boundary error is private and non-cacheable for browser and CDN,
varies by Authorization, Cookie and X-Expected-Account, and sets no session cookie.
The adapter never clears browser cookies on denial. Unsupported methods return
405 with `method_not_allowed` and Allow. This adds that code to the v1 vocabulary;
the existing validation code remains 400. Invalid/expired credentials use 401
`unauthenticated`; a valid session for a different expected account uses 401
`account_changed`. Unexpected server failures use 503 `unconfirmed`, without
logging request credentials, bodies or internal exception details.

## Lifetime and concurrency

Password attempts use the existing login operation, normalized email subject,
rate secret and trusted deployment IP policy. Moving between web and native does
not obtain another sign-in budget. Session creation rechecks password and
credential version under the canonical account lock. Password changes, resets,
confirmed email changes, revocation, suspension, deactivation and deletion keep
their existing effect on all affected sessions.

`withOwnedSession` binds the actual session to its transaction and retains the
permission-gate-before-account-lock order. Expected account checks run inside the
authorizing transaction, before sensitive work or receipt replay. Identity reads
select only public account ID, name and username, never a database row or password
hash. Services that already own a transaction are not wrapped in another one.

Activity reads never extend sign-in. Foreground activity uses server time after
the account lock and the existing conditional update; an expired or deleted row
cannot be recreated or refreshed. There is no refresh token, sliding absolute
expiry, background polling renewal or client-supplied clock. Concurrent activity
is coalesced by the canonical session policy. Logout takes the permission gate
and account lock, verifies the expected owner, and deletes only its current row,
cascading its proofs. Repeating logout on an invalid session is a denial, not a
request to revoke another or newer sign-in.

## Authenticator and recent authentication

Commands require a canonical UUID v4 request key and the expected factor version.
They use the existing account budget, replay fingerprint, factor storage, proof
and notice outbox. Supported exact shapes are:

- `mfa-start`: currentPassword.
- `mfa-confirm`: code.
- `mfa-challenge`: code and an allowed purpose.
- `mfa-replace`: currentPassword and code.
- `mfa-recover`: currentPassword and recoveryCode.

All shapes also require operation, requestKey and expectedVersion. Authenticator
codes are six digits. Purposes remain privileged-work, change-access,
export-metrics, redact-support and send-announcement. MFA availability still
depends on the existing mode and essential security delivery configuration.
Native requests cannot bypass either gate. The adapter schedules the existing
security-notice dispatcher after a successful command.

Enrollment/replacement/recovery require the canonical current-password check.
Native Google recent authentication is explicitly unavailable. A client flag,
browser proof or arbitrary credential object cannot replace that check.
Assurance binds the actual session ID, credential version, factor version,
authority digest, purpose and expiry. Assigned duties are not granted by setup.
Changing authority or factor generations invalidates assurance; sensitive
purpose-bound confirmation is consumed once. An exact command retry can return
its historical receipt only while the canonical replay conditions still hold;
it neither extends proof expiry nor proves that current state is unchanged.

Enrollment secret and recovery codes appear only in the appropriate no-store
authenticated command response. Status reads and logs contain neither. Consumers
must conceal that material immediately on account/session changes and must not
persist it in ordinary caches, navigation URLs, analytics or diagnostics.

## Native consumer responsibilities and provider gate

Secure platform storage, account-scoped local state and lifecycle behavior are
required mobile acceptance. Before every request, capture the account and local
credential generation. Before applying any response, confirm both still match.
An account ID alone cannot distinguish two successive sign-ins to the same
account. A late login response must match its initiating sign-in attempt; late
logout or denial must never clear a newer credential. Retained drafts stay with
their original owner. An uncertain MFA command retries its identical body and
request key only in the original session, or reconciles status without silently
submitting a different command.

Store the token only in the platform credential store. Send it only in the
Authorization header to the configured HTTPS origin, never a URL, log, exception,
client bundle or third-party request. Clear owner-specific cached UI on account
changes and follow the session activity policy while foregrounded. Physical
device storage, interruption, sign-in ordering and retained-work acceptance must
be demonstrated by the consuming apps.

Native OAuth is not enabled or advertised by this adapter. The current Google
web client, HttpOnly PKCE attempt and web callback remain unchanged. A future
native flow must first specify its registered native client/audience and exact
redirect, external-browser state and PKCE ownership, one-time exchange, account
switch/cancellation behavior and secure credential handoff. It must not accept
arbitrary ID tokens or reuse a browser callback with relaxed checks. Actual
provider registration and activation are separate gates. Passwordless Google
accounts use the existing website until that native flow is implemented and
verified.

## Verification status

The pure contract suite currently passes 14 checks, including the original ten
v1 cases and four native credential/command/identity cases. Bounded early review
corrected canonical request-key grammar, unsupported TypeScript parameter syntax,
response identity binding and method-error consistency before runtime testing.

Focused database tests, real HTTPS routes, browser login/CSRF regressions, build,
security checks and final independent review are still pending. The new tests
are discovered by the existing complete support harness. Local targeted evidence
does not replace combined release and live acceptance. No production migration,
write, provider activation or deployment is part of this implementation checkpoint.
