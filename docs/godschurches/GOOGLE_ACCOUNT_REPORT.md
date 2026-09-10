# Google account foundation

## Verified production release — September 9, 2026

Application `61ec62510686f881a93d6d742249954938d820db` is live on READY deployment
`dpl_5WuUwEqsubosE4Jx8t41pb1m1rCA`. The exact Git SHA and canonical
`godschurches.com` serving identity were verified. Twenty-nine live HTTP checks
passed at 2026-09-10T02:51:04Z, covering guest reading, account gates, existing
account pages, hidden Google controls and disabled/forged-origin Google requests.
The live browser checked email sign-in, Home and public church discovery at
390 pixels with no errors or warnings. The public lists are still empty;
populated discussions and churches were verified only with isolated fixtures.

Production Google variables are absent, account email delivery remains disabled
and support intake remains false. Real Google Cloud account/project setup and
consenting provider/device acceptance remain open; the completed implementation
and fictional tests do not establish them. The original checkout is synchronized
and its dependencies regenerated. Full roadmap parent acceptance remains open.


## Account interface and privacy verification — September 9, 2026

The `codex/google-account-interface` branch completes the browser integration
above local HTTP checkpoint `9199d7d`. Login/signup offer Google alongside email
only when the server has a valid enabled configuration. A callback never renders
provider credentials. Onboarding explicitly requires a name, available public
username and adult acknowledgment; joining returns to the intended public post
without automatically liking, commenting or joining a church.

Settings show available sign-in methods. A Google-only member can add a password,
confirm removal of other sessions, download their data, change sign-in email or
deactivate using a fresh confirmation for that one action. The separate action
still requires an explicit submission. Linking verifies the existing password;
unlinking requires a usable password backup. Reactivation requires acknowledgment
and does not automatically sign in. Wrong-identity confirmation leaves the
original account and identity unchanged. Email-link proofs survive Google returns
in HttpOnly cookies and also permit choosing password confirmation afterward.

Enabled development testing found that Next.js could serialize its resolved
request cookie store in RSC debug data, despite minimal component props. The
shared server cookie reader now installs a non-enumerable JSON redaction hook
before returning the store. Reads, writes, iteration and HTTP cookie behavior
remain unchanged. Session, portal, support and server-action readers all use it.
The added HTTP regression supplies random session, Google and unrelated private
cookies to HTML/RSC requests, verifies their absence and separately checks that
settings still recognize a valid account. Existing private portal/support
development guards remain in place.

The actual local browser, with fictional database accounts and a separate
simulated provider, exercised signup/return, independent sensitive confirmations,
password addition, email change, linking/unlinking, deactivation/reactivation,
cancellation and server-action logout. An account export was downloaded and
independently parsed. Settings fit 320, 390 and 1,440 pixel widths; login fits
320 pixels, with a 44 pixel Google touch target. No browser errors or warnings
were returned. Twenty enabled development HTML/RSC privacy checks passed.
All 156 applicable isolated regressions passed with zero failures and two
intentional disabled-delivery skips, including 32 cookie-privacy requests in each
of development and production. The initial new test incorrectly expected a
normal page status for the guest Settings redirect; its corrected assertion
checks the intended Join destination as well as private-value absence. Twenty
additional enabled production HTTPS privacy checks passed with a trusted fixture
CA and verified Google controls. Lint, TypeScript, migration/restore/restart and
the final build passed. Runtime validation covered 58 traces, 4,226 entries and
139 server JavaScript files, without the Prisma configuration-loader path.
Fixture servers are stopped. This verified implementation is ready for publication
with Google disabled; the exact live release is recorded separately below.

The Google button is the unchanged official light pill PNG, rendered at its
original aspect ratio, from Google's
[preapproved sign-in assets](https://developers.google.com/identity/branding-guidelines).
No real Google transport, account, consent or external email was used in these
browser tests. Real provider configuration, Google browser/device acceptance,
back-cache restoration and 200% text zoom remain unverified. Google stays hidden
on production until its provider setup and acceptance are complete.


## HTTP integration verified locally — September 9, 2026

The `codex/google-http-boundary` branch extends verified local account controls
`83f4f1e`. Exact-origin POST operations now start login, link and action-specific
confirmation, complete onboarding/reactivation, expose minimal account options
and cancel/unlink. All operations use durable rate limits. A separate GET
callback validates the bound attempt and immediately redirects without rendering
provider parameters. A login started anonymously cannot replace an account that
was signed in during the redirect.

Short-lived browser, onboarding, reactivation, recent-confirmation and email-link
cookies use HttpOnly, SameSite=Lax and host-only Secure names on HTTPS. No raw
proof is returned in page data or JSON. Email-link preparation checks the current
owner and pending link before preserving it across Google confirmation; the
separate email-change action still verifies and consumes both proofs. Existing
sensitive account endpoints accept an explicit Google confirmation method only
with the server's cookie, and successful use clears the confirmation cookie.

Ten new boundary groups passed using actual Request/Response handlers, the real
signature verifier and substituted certificate retrieval/code exchange. All 153
applicable checks passed with zero failures and two intentional disabled-delivery
skips. Real development and production HTTP checks prove disabled Google routes
create no attempts/sessions and strip callback parameters. An initial test
incorrectly required an exact cache-header string; it now checks the required
no-store directive while allowing Next.js's additional privacy directives.
Lint, TypeScript, migration/restore/restart and the final production build passed.
Runtime validation covered 57 traces, 4,123 entries and 136 server JavaScript
files, with no Prisma configuration-loader path. These tests do not claim a real
Google redirect or browser acceptance. Google remains local and unpushed;
interface integration and real provider setup follow.

## Recent authentication verified locally — September 9, 2026

The `codex/google-reauthentication` branch extends local foundation `6030ba3`.
Five-minute confirmation proofs are tied to the active owner, original session,
credential version, linked Google identity and one named action. Only a fresh
callback for that same linked subject can create a proof. The requested action
is performed separately; successful service use consumes the proof in the owner
transaction. Replacing a proof invalidates its predecessor. Session or identity
removal cascades to proofs, and credential-version changes invalidate them.

The existing password services now also accept this internal proof for password
change, other-session revocation, private export, email-change request/confirmation,
deactivation and unlinking. HTTP password fields reject proof objects; cookie and
interface integration still follows. Unlinking requires a structurally usable
backup password, so a Google-only account cannot strand itself. An owner export
includes its Google issuer/subject/link date without pending attempts or tokens.

A deactivated linked Google identity receives a browser-bound reactivation proof,
not a session. Separate explicit confirmation applies the shared verified
reactivation transition; suspension, changed credentials/identity, expiry,
wrong browser and replay remain denied. Prior roles/sharing and sessions are not
restored, and another sign-in follows. Google transport has a 15-second deadline
across exchange/certificate requests. Provider-token details stay out of errors.

Nine additional service groups cover these paths, bringing Google coverage to
18 groups. All 139 applicable isolated checks passed with zero failures and two
intentional disabled-delivery skips. Lint, TypeScript, synthetic upgrade/restore,
fresh migrations, restart and the final production build passed. Runtime checks
covered 55 traces, 3,977 entries and 127 server JavaScript files. The fixture is
stopped. Public Google controls and real-provider/browser acceptance remain
pending. Production remains
the published guest-browsing release, with both Google slices local and unpushed.

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
sign-in-method management. The service-level identity export and lifecycle work
is complete in the recent-authentication slice above. The guest return boundary
must remain intact.
Real provider configuration, brand-compliant controls and a consenting actual
Google browser journey, including an external Android browser, remain required.
No real Google login, credential configuration or public launch is claimed here.

References: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
and the [Google Auth Library for Node.js](https://github.com/googleapis/google-auth-library-nodejs).
