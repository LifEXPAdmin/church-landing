# Active sign-ins and session revocation

## Implemented and verified — September 9, 2026

Account settings now provides an owner-only active sign-in list and an explicit
**Sign out other sessions** action. It requires the current password on every
revocation, retains the current authenticated session and removes only other
sessions belonging to that account. Labels are approximate browser/platform
categories. Dates identify creation/expiry, not recent activity or a verified
physical device. The current session is always shown, followed by at most 20
others with an accurate total.

`lib/platform/account-sessions.ts` rechecks the authenticated session under the
same account row lock used by session issuance and password changes. Revoked,
expired, suspended and stale-credential-version sessions fail closed. The request
boundary derives ownership from the cookie, rejects supplied owner/target fields,
enforces the configured origin and existing durable rate limits, and returns
private/no-store responses. The list contains only approximate labels, dates and
the current-session flag; it returns no session IDs, hashes, raw user agents,
passwords or private email.

The client loads the list on request and presents explicit success/failure
feedback with keyboard focus. It clears stale displayed data after revocation
or an uncertain response and offers a fresh read. Existing password-change,
logout, account recovery and church/support boundaries remain unchanged. No
schema, migration, dependency or production identity change is required.

## Actual verification

The Node24 `npm run test:support` harness passed **85 tests**: the existing 78
plus seven new session groups in `tests/account-sessions.test.ts`. Coverage
includes bounded safe projection, current-session retention, other-owner and
credential/grant preservation, invalid session states, competing revocations,
production HTTPS login/revocation with next-request rejection, private HTML/RSC,
forged owner/target/origin attempts and durable wrong-password rate limiting.
Synthetic upgrade, full restore, fresh migrations, new-process persistence,
production build/type checks and runtime traces also passed. Final lint and a
fresh production build after the browser run passed: 51 traces, 3,684 entries,
116 server JavaScript files and no Prisma configuration-loader path.

Initial runs exposed two overly strict assertions: the middleware adds
`private` to `no-store`, and RSC Flight references the client component instead of
rendering its text. The assertions were corrected to verify actual cache/privacy
contracts and rendered HTML. The final complete run passed all 85 checks.

A separate local development browser run used fictional data and independent
Codex in-app and Chrome cookie stores. Registration and both real browser sign-in
forms worked. The list displayed both sessions. A wrong password gave a visible
failure and left both usable. Correct password confirmation revoked the Chrome
session: its next settings load redirected to sign-in. The current in-app session
still listed itself alone and survived a full reload. Keyboard activation and
320/390/1440px reflow passed; the 320px controls were visually inspected. No browser
error logs were returned. The remaining synthetic browser session was logged out
and the test tabs were closed.

The browser run used isolated loopback HTTP in development. Production-server
security behavior was separately exercised over locally verified HTTPS. No
certificate interstitial was bypassed. Actual password-manager vaults, physical
devices, Safari and a new real production-account journey were not tested.

## Scope and continuation

This completes the bounded session-controls implementation within the account
foundation. Full account acceptance remains open for actual verification/recovery
delivery, verified email ownership changes, export/deactivation/deletion and the
other specified controls. Google integration remains separate. Someone who knows
a valid password can sign in again after session removal; the UI points to password
change for that case. Real church/support intake is not opened by this feature.

The preceding entrance release and its exact deployment/live verification are
recorded in [ENTRANCE_REPORT.md](ENTRANCE_REPORT.md). Session publication details
belong in the next release checkpoint after deployment identity is verified.
