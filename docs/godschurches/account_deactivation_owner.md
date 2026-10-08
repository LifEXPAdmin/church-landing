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
mounted component's memory. The retained settings frame applies only to the deactivation page.
Reading preferences and Data Saver retain their current independent behavior. Explicit navigation or reload can discard the draft. This is not a
claim of browser heap erasure or persistent recovery after closing the page.

Foreground identity checks gate submission and Google navigation. A response
from an older check cannot authorize a command after concealment. Confirmed
deactivation can navigate to reactivation only after a current foreground check
finds no signed-in account. A replacement login prevents that redirect. An
uncertain response is never automatically resubmitted; the recovery controls
offer sign-in and reactivation in another tab.

## Historical source evidence

[PR30](https://github.com/LifEXPAdmin/church-landing/pull/30) preserves source
`582e1c0fc6540491b09e2f76251f262fac6b020f`. Its original local verification tested
application `28f8b2f2f2b594879c6af8a11467e95a545bb683` with isolated build
`1su82AlO9lUHPb5cLmMCb`: **60 combined service/HTTPS cases** and **49 browser
groups**. Those populations included 15 reaction/reading groups from that older
source. The original report records same-password account replacement and
delayed-response failures on its baseline, then local repair acceptance.

These historical checks are not current website acceptance. The selected
integration uses deactivation and the minimum website session-owner and
retained-parent seams; it does not import the native/reaction ancestor stack.
The original report and evidence remain retained.

## Current integration checkpoint

Candidate **2026.10.08.14**, `account-deactivation-owner-safety`, is prepared for
current verification. No new source, service, HTTPS, browser or live pass is
claimed here. Planned coverage is:

- **65 service/handler cases:** 8 original-owner checks, 20 Google account cases,
  12 Google boundary cases, 11 email-change cases, 11 session-activity cases and
  3 reading-preference cases.
- **9 built HTTPS lifecycle cases:** duty handoff, session/sharing revocation,
  original-owner behavior, concurrent assignment and separate reactivation.
- **40 browser groups:** 12 deactivation, 16 password/email privacy, 6 Google
  credential/proof cases and 6 current display-settings groups.
- **7 controlled Data Saver scenarios**, separate from full application results,
  using the actual component with fictional gallery/image transport.

The assignment race must enroll its fictional operator and obtain a fresh
one-use `change-access` proof before each competing assignment. It checks the
canonical losing reason, so a missing-MFA denial cannot make the race appear to
pass. Both built-server phases in the dedicated hosted profile enforce MFA.
The existing broader runner retains its historical HTTP mode; its direct
lifecycle service test uses an explicit enforced fictional environment and is
not evidence of enforced HTTP acceptance.

Browser evidence must preserve original entries and command ownership across
refresh, concealment, delayed replies and explicit recovery. Google proof rows
and injected same-origin redirects are fictional verifier seams, not real
provider acceptance. Current receiving-baseline reproduction and combined
verification remain required.

## Integration boundaries

No schema, dependency, background job or provider activation is introduced.
Old open forms without the expected-owner header fail closed and must be
reloaded. Duty-handoff and sharing-revocation checks remain canonical. Current
reading, Data Saver and other account flows retain their existing contracts.

The serving baseline is version **2026.10.08.13**. Candidate .14 has no live
acceptance yet. Existing source, review, recovery, deployment and live checks
remain in place. Broad SEC-01 remains open; export, native and real
provider/device work are separate.
