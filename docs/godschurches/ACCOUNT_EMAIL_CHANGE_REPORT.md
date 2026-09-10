# Verified sign-in email changes

## Implementation — September 9, 2026

The `codex/account-email-change` branch adds a settings request and a separate
confirmation page. Implementation, local verification and production publication
are complete. Actual sender activation and mailbox receipt remain separate work.

## Publication

Application `0b885a7abfd736f45ee6f863ee22c9905c8c4ec5` was pushed to `main`
and became READY on production deployment `dpl_BccPQgGhXJD98qd6wXXHRN8HwJKG`
at **2026-09-10T00:18:53.804Z** (September 9 locally). The deployment metadata
matched that Git SHA, and inspection of `godschurches.com` resolved to this exact
deployment. Seventeen live HTTP checks passed at **00:20:05Z**, including public
routes, the email-change availability page, the post-change sign-in notice,
disabled operations and origin/forged-field rejection. Deployment-scoped error
logs returned no matching entries. No real account or external email was used.

The signed-in owner confirms the current password to request a new address. The
old email remains usable until the owner opens the link delivered to the new
address and confirms the current password again in an authenticated browser.
Opening a link never changes an account. Successful confirmation verifies the new
email, increments credential/access versions, consumes recovery grants and signs
out every session. Passwords, profile fields, church roles and directory contacts
are preserved. An existing account, including a legacy passwordless account,
cannot be merged or replaced through this operation.

`PlatformEmailChange` stores one pending request per owner, with a unique token
hash, normalized recipient, credential version and 30-minute expiry. A new
request replaces older links. Confirmation checks the requesting owner, current
password, token hash, expiry, current credential version and email uniqueness
inside a transaction. The existing shared access gate precedes the owner row
lock. Unique-constraint races roll back with a safe error.

Password changes/resets, account deactivation/reactivation and operator account
status changes invalidate pending requests. Deferred delivery rechecks eligibility
and the current request. Failed older deliveries cannot remove newer requests.
The HTTP boundary derives ownership from the session cookie, checks the configured
origin, allows only the operation's fields and rate-limits requests/confirmation.
Recipient availability and provider latency happen after the neutral response;
no confirmation token or address-availability result is returned to the caller.

The delivery adapter uses its existing bounded/idempotent Resend transport with
a distinct purpose, subject and fragment-only confirmation link. Tokens stay out
of server URL paths and queries. The confirmation component consumes and removes
the fragment, keeps the token in memory and never submits automatically. Error
feedback receives focus; duplicate submissions are blocked while pending.

## Delivery availability

The feature is unavailable while account delivery is disabled. Settings and the
confirmation page explain this without showing a nonworking submission form;
requests return 503 without creating a pending change. This implementation does
not establish a verified sender or prove real mailbox receipt. The provider terms,
DNS, production configuration and an authorized real mailbox test remain in
[ACCOUNT_DELIVERY_REPORT.md](ACCOUNT_DELIVERY_REPORT.md).

## Migration and rollback

The additive `20260909235500_account_email_change` migration creates the pending
request table with an owner foreign key, unique owner/token indexes and expiry
index. Existing account rows are not rewritten. The isolated harness includes
pending rows in backup/restore fingerprints and checks its schema constraints in
fresh and restored databases. No dependency change is needed.

Older application code does not know about pending email changes. Disable new
requests before rollback; retain the table, invalidate pending requests if older
credential-changing code is deployed, and keep the published account-lifecycle
checks. Do not roll back to code that ignores deactivated accounts.

## Verification

- `npm run test:support`: **116 passed, zero failures**. Two additional enabled
  delivery tests intentionally skip in the disabled production-mode pass; they
  pass against the actual development HTTP server and local sink. The seven new
  service groups also passed again after removing test-only lint warnings.
- Current-password, owner, purpose, expiry, replacement and single-use checks;
  concurrent confirmation/request races; real database unique-constraint rollback;
  password/reset/lifecycle invalidation; late provider failure cleanup and neutral
  deferred production-config provider payloads passed with synthetic fixtures.
- Actual development HTTP covered local delivery, inert link GET, foreign-owner
  rejection, confirmation, old-email failure and new-email sign-in. Actual local
  production HTTPS covered disabled availability and unchanged accounts. Existing
  account, church, support and entrance regressions passed.
- Synthetic upgrade, pending-row backup/restore, fresh migrations and schema
  constraints, plus persistence after a new production process, passed.
- Final lint and full TypeScript check passed without errors or warnings. The
  final production build passed its runtime trace check: **53 traces, 3,843
  entries, 122 server JavaScript files**, without a Prisma configuration-loader
  path.
- Actual in-app browser on isolated development HTTP: wrong-password focused
  feedback for request/confirmation, neutral request feedback and cleared inputs,
  fragment removal, keyboard confirmation, sign-out notice, new-email sign-in and
  explicit logout passed. Both forms fit 320/390/1440 px with scroll width equal
  to viewport width; panel widths were 288/358/672 px. The settled 390 px screenshot
  was inspected. Browser logs showed no errors.

The first regression attempt found a test expectation that incorrectly treated
the normal account `updatedAt` change as lost data. The assertion now allows the
timestamp to advance while checking all other retained fields. No application
change was needed for that failure.

All fixtures stayed in the isolated loopback database and local delivery sink.
No real email, account ownership change, physical-device test or intake activation
was performed. Mocked provider responses, actual local HTTP behavior and real
external receipt remain separate claims.
