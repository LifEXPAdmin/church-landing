# Authenticator settings acceptance

September 18, 2026 UTC. Local acceptance is complete; integration and verified
release remain open. This extends the existing canonical authenticator screen
and [published native MFA capability](PRIVILEGED_AUTHENTICATION_IMPLEMENTATION.md).

## Supported controls

Security continues to link to `/platform/account/authenticator`. Enrollment,
verification, challenge, replacement and recovery use the existing owner-bound
service and exact-retry forms. Confirmation comes from the server only after a
valid code. Settings neither generate nor validate factor material.

Acknowledging recovery codes clears the displayed codes and moves keyboard focus
to a readable status. The status says the codes are hidden, without claiming that
the website saved them or that an external copy was verified. It is local component
state, clears for replacement and is not written to navigation, storage or analytics.
Existing time limits, background concealment and changed-sign-in retirement remain.

Turning protection off is explicitly unsupported. The accepted service permits
replacement with a current factor or unused recovery code plus fresh primary
confirmation. No disabling endpoint, password-only bypass or additional permission
is introduced. Loss of both credentials still requires trusted identity review.

## Fresh verification

- Fourteen service checks across privileged authentication, authenticator vectors
  and access management pass. They cover owner/session and purpose boundaries,
  verified enrollment, replacement, one-use codes, protected recovery, notice
  failure, export privacy, erasure and other sign-in methods.
- Eight enforcement-mode browser groups pass against the production build.
  Added checks reject a deterministically invalid enrollment code without marking
  the factor confirmed or creating codes/notices; verify acknowledgment focus and
  code removal; inspect browser storage, history and outbound requests before and
  after Return/Back; and verify unchanged factor data and unsupported disabling.
  Existing real QR decoding, lost-response retry, separate confirmation tab,
  enlarged layout, recovery and account-switch checks also pass.
- The separate enrollment-mode browser group passes: setup remains explicit and
  existing assigned access remains available without an invented factor or proof.
- Browser page errors are zero. Phone and desktop screenshots at doubled text
  were reviewed; screenshots contain no setup key, recovery code or password.
- TypeScript, scoped lint, copy validation, diff checks and production build pass.
  Runtime validation finds 223 traces, 74,692 entries and 556 server JavaScript
  files, with no private fixture/environment material. A focused review's two
  test refinements were incorporated and the final eight groups rerun successfully.

The fictional database has 100 applied migrations and a matching regenerated
Prisma client. HTTPS and the email transport are isolated; no real provider
credentials, recipient sends, enrollments or production data were used. There is
no migration or configuration requirement for this delta. It adds one local
boolean and focus ref, no requests, queries, timers or dependencies. No measured
speed improvement is claimed. A redundant full regression was not rerun for this
bounded presentation change; combined integration checks remain the release owner's
responsibility.

Real responsible adults must still privately enroll, retain recovery codes and
verify normal duties, another-sign-in challenge, recovery readiness and essential
notice delivery before broader enforcement. These local checks do not satisfy that
separate activation gate or physical-device acceptance.
