# Google account foundation

## Local implementation — September 9, 2026

The `codex/google-account-foundation` branch starts the Google account service
after the published guest-browsing release. This backend foundation has isolated
acceptance complete. It does not enable a Google button, callback route or
production Google accounts.

`google-auth-library` 11.0.2 validates signatures and audiences using Google's
certificates. The adapter additionally checks issuer, authorized party, strict
expiry, issuance time and the bound nonce. Authorization requests use the exact
configured callback, state, nonce and S256 PKCE, with `openid email profile` only.
Provider errors become generic errors; access, refresh and ID tokens are neither
stored nor returned from the adapter. Configuration is off by default.

The additive identity table uniquely binds Google's canonical issuer and subject
to one local account. A ten-minute authorization attempt stores hashes of its
state, browser secret and nonce, plus a validated local destination. Its PKCE
verifier is derived from the browser secret and state without database storage.
The eventual HTTP layer must keep the browser secret in an HttpOnly cookie and
enforce origin and rate limits before starting work.

Successful callbacks consume attempts transactionally. A linked subject gets a
normal database session for its original active account. A provider email change
does not change the site's email or claim another account. A matching unlinked
email requires legitimate linking/recovery, including passwordless legacy users.
New identities receive a browser-bound, one-use onboarding proof; account creation
requires an explicit name, public username and current adult acknowledgment. New
accounts are ordinary believers without church or operator grants. A verified
third-party Google email is not marked as independently verified by the site;
Google-authoritative Gmail/Workspace claims are distinguished.

Linking currently requires an existing active session and current password,
then rechecks that original session and credential version at completion.
Identities cannot be reassigned to another owner. Password-confirmed unlinking
requires a remaining password method, retains the current session with a new
credential version and revokes other sessions/grants/pending email changes.
Both callback and unlinking share the account/church access gate and user locks.

## Verification and remaining work

Nine new isolated service groups use a generated RSA key and the real Google
library signature verifier, with only certificate retrieval and code exchange
substituted. They cover configuration/scopes, forgery/claim validation, browser
binding/expiry, profile/adult signup, email collisions, owner linking, changed
provider email/inactive accounts, concurrency and revocation/unlinking. They all
passed in the first run. All 130 applicable service/HTTP checks passed with zero
failures and two intentional enabled-delivery skips in disabled production mode.
The enabled development delivery cases passed. Synthetic upgrade, backup/restore
including both Google tables, fresh migrations and production restart passed.
Final TypeScript, lint and production build passed; runtime validation checked
55 traces, 3,977 entries and 127 server JavaScript files. The fixture server is
stopped. No new browser UI exists in this foundation, so this result does not
claim browser/provider acceptance.

The dependency audit reports the existing Prisma configuration/deepmerge
development-tool chain; it reports no new Google-library advisory. The existing
runtime trace check continues to exclude the Prisma configuration-loader path.
No unrelated forced dependency downgrade is applied.

Before exposure, finish exact-origin/rate-limited routes, HttpOnly cookie and
callback cleanup, cancellation/provider timeout feedback, the profile/adult UI,
Google-only recent-authentication controls for sensitive account operations and
sign-in-method management. Extend account export for the identity record and
document lifecycle handling. The guest return boundary must remain intact.
Real provider configuration, brand-compliant controls and a consenting actual
Google browser journey, including an external Android browser, remain required.
No real Google login, credential configuration or public launch is claimed here.

References: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
and the [Google Auth Library for Node.js](https://github.com/googleapis/google-auth-library-nodejs).
