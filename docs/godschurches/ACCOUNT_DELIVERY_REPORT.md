# Account email delivery implementation

Updated September 9, 2026. Branch: `codex/account-delivery`, based on published
main `ab14cf9ba258517ce76a1f24be55b0fd9eff3fc3`.

## Recovery entry clarification — September 10, 2026

The current candidate on `codex/account-recovery-activation` is based on published
calendar revision `745917ae45116c59e1a4aed8ca8f52a081665861`. Sign-in and signup now
use the requested **Forgot password?** label and preserve the existing recovery
route. The surrounding guidance uses the same validated delivery-availability
reader as the recovery page. Components receive only a boolean; sender keys and
configuration are never passed to the client. Missing/invalid sender configuration
continues to show unavailable recovery. General Help points to the actual status
on the recovery page instead of hardcoding an indefinitely disabled sender.

The Mac's authenticated repository and hosting access work. Fresh project
inspection found only the existing database integration, no Resend resource or
sender environment variables, and `ACCOUNT_DELIVERY_MODE=disabled`. The existing
provider setup screen still requires its owner to accept the Marketplace/Resend
terms. No provider agreement, paid plan, DNS change, real email, password reset
or account-data change is part of this clarification. Actual sender receipt and
existing-account recovery remain open under the activation steps below.

Verification completed locally: 218 distinct checks, 216 passing and two expected
disabled-delivery skips, with no unresolved failures across the sweep and corrected
remaining runs. All 17 remaining development checks and 70 production HTTPS checks
(68 passing, two skips) passed. Additive/fresh migrations, backup/restore, account
restart, final lint/types/build and runtime checks passed. The build has 85 traces,
6,163 entries and 204 server JavaScript files; an additional trace audit found no
private fixture/environment files. No schema or dependency change is included.

The new test was corrected to check rendered text in HTML and the client
component's availability prop in RSC. An isolated resume initially used the later
social fixture, whose new capability enum values are incompatible with the
published calendar client's operator read. The remaining 35 portal checks passed
against the matching calendar fixture. These were verification corrections, not
production account changes. The existing recovery checks prove expiry, one-use
reset and old-session invalidation separately from real inbox receipt.

Publication is being verified. The exact label/destination and enabled/disabled
wording are covered without exposing sender credentials.

## Current delivery result

Transactional recovery and verification delivery is implemented through Resend.
**Real email delivery remains disabled.** Production inspection found
`ACCOUNT_DELIVERY_MODE=disabled` and no configured transactional sender or Resend
key. Simulated provider acceptance is not actual inbox receipt. Full account
recovery acceptance remains open until sender configuration and an authorized
mailbox test are complete.

All **91 isolated service/HTTP checks passed**, including six new delivery test
groups, the actual Next.js post-response sink flow, production builds/type/runtime
traces, upgrade/restore/fresh migrations, and the account-session restart tests.
Lint passed. This release changes backend delivery behavior; no interface or
physical-device test result is claimed.

## Published release

Application commit `5fc6d3fea4975655067687ee4bdf832edd178445` is on main and live
on production deployment `dpl_J11qS8MCY126MTQc7DGoX1zc9o5C`, READY at
`2026-09-09T22:33:50.253Z`. Exact Git SHA and the canonical
`https://godschurches.com` alias were verified. Fifteen live HTTP checks passed
at `2026-09-09T22:34:54Z`, covering public/account routes, anonymous session
rejection, forged-origin rejection and all four disabled recovery/verification
operations. No production account or external message was created. The optional
provider remains unconfigured and disabled; this is publication of the tested
integration, not activation of email recovery.

A documentation-only follow-up may redeploy the same application code. The
commit and deployment above identify the exact application release tested here.

## Behavior and boundaries

- The account route registers Next.js `after()` work. Account lookup, grant
  creation and provider requests run after the neutral web response. Existing,
  absent and rate-limited addresses receive the same accepted response; provider
  latency cannot change that response. Exact-origin, body-size and durable
  rate-limit checks still run before scheduling work.
- Mail contains a plain-text, purpose-specific link on the configured account
  origin. The secret remains in the URL fragment, never the path or query.
  Opening the page does not consume the grant. The user must submit the form.
- Requests go only to the fixed Resend HTTPS endpoint, with redirects refused.
  There are at most two attempts, each with a 10-second timeout and a one-second
  retry delay. Transient errors retry with the same payload and hashed-grant
  idempotency key. Permanent provider errors do not retry.
- Only an accepted response containing a provider message ID counts as provider
  acceptance. Final failure deletes that newly created grant and logs only
  `account_delivery_failed` plus the account request reference. Existing grants,
  credentials and sessions are unchanged. No email address, raw grant, API key or
  provider response is logged by application code.
- Suspended accounts cannot receive or consume grants. Eligibility and current
  email are rechecked under the existing user lock. Reset/verification purposes,
  30-minute expiry, hashed storage, single use and credential-version checks are
  preserved. Recovery does not implicitly verify email; verification does not
  sign in or grant church authority. Legacy passwordless accounts still require
  a valid delivered grant to set a password.
- No schema, migration, dependency, external email, analytics or support-intake
  activation is part of this implementation release.

This callback is **not a durable queue**. Process termination can interrupt
delivery; an accepted API result cannot guarantee a delivered email. Ambiguous
provider failures are retried with the same idempotency key, then the grant is
invalidated if acceptance remains unknown. A late email can therefore contain an
unusable link; the user must request a new one. Bounces, spam filtering and
provider outages still require operational checks. No webhook receipt tracking,
dead-letter queue or inbox-placement claim is implemented.

## Configuration and activation

Keep the currently serving production mode disabled until these steps are
complete. Existing `MAILERLITE_*` variables belong to the retired marketing
integration and do not enable transactional recovery.

1. Connect the intended Resend account. Verify the sender domain using the DNS
   records actually supplied by that provider; check the domain reports verified.
   Keep open/click tracking disabled for account mail. Use a dedicated sender on
   the canonical site's domain or a subdomain, not the provider's test domain.
2. Configure `RESEND_API_KEY` as a server-only sending credential and
   `ACCOUNT_EMAIL_FROM` as a bare email address. Never put either in a
   `NEXT_PUBLIC_*` variable, a repository file, browser state or a report.
   Preserve the current HTTPS `ACCOUNT_ORIGIN` and rate-limit secret.
3. Validate the configuration before switching mode: `resend` requires HTTPS,
   a nonlocal canonical origin, a same-site sender and a syntactically valid key.
   Vercel preview/development scopes refuse real delivery. Missing/invalid
   configuration fails closed, so a mistaken activation can also make account,
   church and support mutations unavailable; revert mode if validation fails.
4. Obtain an owner-controlled test recipient authorized for an actual email.
   Test both purposes with isolated account records first. Confirm receipt,
   sender, link destination, absence of tracking rewrites, expiry, one successful
   consumption and rejection on reuse. Confirm password reset revokes sessions
   and verification alone changes no password or church access. Record receipt
   separately from provider API acceptance; keep private evidence private.
5. Set production `ACCOUNT_DELIVERY_MODE=resend` and redeploy only after the
   required sender/receipt validation. Check the exact serving commit and alias,
   recovery page availability, neutral API behavior and safe error logs. Perform
   the authorized live account check without importing fictional records into
   production. Update public Help and account guidance to match the enabled
   state, then record the actual delivered-email result and any remaining limits.

To disable: restore `ACCOUNT_DELIVERY_MODE=disabled` and redeploy. Recovery and
verification requests and consumption return the honest unavailable state;
ordinary password login remains available with valid base configuration. Never
enable the isolated file sink in a production or preview deployment.

## Verification

`tests/account-delivery.test.ts` uses only a disposable loopback PostgreSQL
database and a fake provider transport. It covers configuration rejection,
purpose-specific payloads, retry deduplication, bounded error handling, deferred
known/unknown/limited request behavior, failure cleanup and safe logs, and
suspended-account issuance/consumption. It cannot establish real Resend access,
DNS verification or receipt.

The existing `tests/account-http.test.ts` runs through the actual Next.js route
and waits for its fictional recipient's sink entry after the response. It proves
the lifecycle callback executes, link previews stay inert, reset succeeds once
and old sessions fail. The full harness also retains expiry, competing reset,
verification, passwordless-legacy recovery, account sessions, church/support
privacy, migrations and restart coverage.

## Implementation references

Provider payload and retry behavior follow the official
[Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email)
and [idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).
Response-lifecycle handling follows the official
[Next.js after documentation](https://nextjs.org/docs/app/api-reference/functions/after).
Sender setup must follow the current
[Resend domain verification guidance](https://resend.com/docs/dashboard/domains/introduction).

## Next action

Connect and verify the real sender and complete the authorized mailbox receipt
test. Keep full recovery/account acceptance open until actual results are
recorded. Email ownership changes, account export/deactivation/deletion and safe
Google linking remain separate account-foundation work.
