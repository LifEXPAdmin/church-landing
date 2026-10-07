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
The boundary checks the received Host and effective protocol against configuration.
Next.js can place its internal listen address in request.url behind a proxy; that
internal address is not the public host. Forwarded-host alone cannot substitute
for the received Host. The boundary rejects recognized account cookies even when they are empty or
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
`account_changed`. A wrong current password for MFA confirmation is 400 validation
and preserves the valid bearer session. Unexpected server failures use 503 `unconfirmed`, without
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

Application source `d44adceb0586e1c7dcfa6ce6cb8dab6f0edbdddd`, production build
`hDekz_MT_3klWnep7sDPC`, passed the isolated verification run on 7 October 2026.
The current source passed 14 native contract/service checks and 26 session/HTTPS
integration checks. The latter includes four native HTTPS cases under production
settings with delivery disabled, nine session-rotation regressions, nine account
session regressions, and the same four native HTTPS cases with an explicitly
enabled fictional MFA sink. The enabled phase requires its declared availability;
it cannot silently pass by exercising the disabled branch.

Another 55 applicable checks passed at the initial `df8f9e0` checkpoint: ten
shared wire contracts, five cookie cases, seven lifetime-policy cases, eleven
activity cases, ten privileged-authentication cases and twelve Google boundary
cases. Their tested source and services are unchanged by the subsequent native
boundary repair. Initial native checks also passed, but are superseded by the
14 current native checks. The first real HTTPS run failed all four native cases
because Next.js exposed its internal listen address in request.url. The corrected
boundary checks received Host and effective protocol; current real HTTPS checks
pass. Both the failed evidence and repair are retained privately.

Type checking, focused lint, website copy, build hydration/runtime trace/security
checks and an ES2022-only compile with no DOM or Node types passed. No new
migration or dependency is required. The tests are discoverable by the existing
complete support harness; this feature run is targeted and is not a new passing
complete-support or combined-release gate. Owned fixture server, HTTPS proxy and
PostgreSQL processes closed, with their three ports verified unavailable.

Native-specific coverage includes mixed/invalid credentials, expected-account
binding, pure session reads, coalesced activity, expiry while waiting on a lock,
shared web/native rate budgets, current-session logout, delayed old logout,
canonical revocation/password/deactivation/deletion, factor enrollment and exact
retry, MFA isolation across sessions, one-use purpose and changed authority,
recovery/replacement retirement, and recovery after an after-commit notice
scheduling failure. A wrong current password for MFA preserves the valid session.

Final independent review and the private ready-for-integration receipt follow
this checkpoint. The implementation is not merged or live. Actual native device
storage/UI/lifecycle acceptance, actual provider delivery, native OAuth and the
combined release remain separate gates. No production migration, write, provider
activation or deployment occurred in this local verification.
