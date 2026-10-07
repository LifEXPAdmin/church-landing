# Deactivation account ownership and recovery

## Behavior

A deactivation form belongs to the account that opened it. Its command and
Google confirmation start send that original account in `X-Expected-Account`.
The server rejects a missing, empty or different owner before using credentials,
creating a confirmation attempt or changing account access. The check runs inside
the existing account transaction, after the current session and user are read
under the access locks. Trusted internal lifecycle calls retain their existing
interface; the browser boundary always requires an explicit expected owner.

Successful deactivation still revokes every server-side session and existing
sharing through the canonical lifecycle service. Its response sets no cookies.
An invalidated cookie may remain in the browser until sign-in replaces it, but
it cannot authenticate. This prevents an older response from erasing a newer
login or its Google cookies. Reactivation remains a separate explicit operation
and does not restore sign-in or previously revoked sharing.

The form retains its original password and acknowledgment through access checks,
account changes and refreshed server rendering. Fields are removed from the
rendered controls while access is uncertain; their values remain only in the
mounted component's memory. The retained settings frame is shared with reading
preferences. Explicit navigation or reload can discard the draft. This is not a
claim of browser heap erasure or persistent recovery after closing the page.

Foreground identity checks gate submission and Google navigation. A response
from an older check cannot authorize a command after concealment. Confirmed
deactivation can navigate to reactivation only after a current foreground check
finds no signed-in account. A replacement login prevents that redirect. An
uncertain response is never automatically resubmitted; the recovery controls
offer sign-in and reactivation in another tab.

## Verification checkpoint

The unchanged baseline reproduced both failures with isolated fictional users:
an original form could deactivate a replacement account sharing its password,
and a delayed committed response could erase the replacement login and redirect.
No real account or provider was used.

The current focused service checks pass:

- Eight expected-owner and transaction-race cases cover missing, empty and
  different owners; preservation of an unused Google proof; confirmation start;
  and session revocation, expiry or credential rotation while waiting for the
  real database gate.
- Twenty existing Google account cases and twelve Google boundary cases preserve
  purpose, session, identity, expiry, replay and separate reactivation behavior.
- Eleven existing credential-change cases preserve password and email flows.
- Nine built HTTPS lifecycle cases preserve duty-handoff denial, full session
  and sharing revocation, concurrent assignment safety and separate reactivation.

The production build and source gates pass. Browser acceptance is still in progress.
The browser harness covers native focus, actual server refreshes, account
replacement, exact draft recovery, delayed committed replies, uncertain outcomes,
small screens and Google-only confirmation. A seeded recent proof is a trusted
test-verifier seam, not real Google provider acceptance.

## Integration

No schema, dependency, background job or provider activation is introduced.
Old open forms that do not send the expected-owner header fail closed and must
be reloaded. Preserve the existing account duty-handoff and sharing-revocation
checks. Run the focused lifecycle/browser checks against the combined release
and retain the separate dependency, deployment and live-acceptance gates.

This checkpoint is not yet a tested handoff or a production release.
