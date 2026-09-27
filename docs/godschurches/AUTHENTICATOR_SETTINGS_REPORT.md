## Authenticator private presentation locally accepted, 27 September 2026 UTC

Version **2026.09.27.28**, application source
`84d5f7be809743408fad62d3ff6faf2cff0f8147`, is implemented and locally tested.
It is **not merged or live**. The serving batch remains **2026.09.26.27**;
this finished feature is retained for the next compatible release batch.

Before editing, the unchanged application reproduced password, setup key and QR
retention in concealed DOM, all eight recovery codes retained after offline,
and setup still visible after `pagehide`. The server also serialized its complete
authenticator snapshot. The isolated baseline reused the previously verified
compiled application after runtime-source equivalence checks; no fresh baseline
build is claimed.

The route now sends only owner and opaque session identity, a public refresh key
and the requested public purpose. Private factor/status/notice data comes from a
fresh no-store read. Blur, offline, pagehide and hidden-document transitions remove
private fields, setup material and notice markup. A late read cannot restore them.
Same-address navigation rechecks access without replacing the mounted command
owners. Each operation retains its original draft and exact uncertain request
through factor changes, including a lost confirmation whose save is already visible.
Another owner or a different sign-in for the same owner cannot reveal those retained
values after revalidation. Restoring the original session permits recovery.

Setup and recovery material is bound to its receipt version; a late response from a
replaced factor cannot display an old key or QR. Challenge receipts do not reassign
that binding. Existing ten-minute clearing, explicit code acknowledgment, accessible
focus, one-use confirmations and service authorization remain intact. No dependency,
endpoint, schema migration or provider capability was added.

Fresh acceptance comprises **19 browser groups**: ten focused privacy/recovery,
eight existing enforcement-mode flows and one staged-enrollment flow. They include
real local HTTP writes, exact lost-response bytes, unchanged factor/replay notice
counts, actual offline behavior, different-account/session denial, original-session
recovery, purpose/field retention, late superseded results, QR decoding, protected
work in another tab, replacement, code acknowledgment, no private browser storage,
and 320/390/desktop layouts with enlarged text. The 320-pixel acknowledgment capture
was inspected. **Sixteen service checks** pass: authenticator four, privileged
authentication ten and release content two. Browser errors are zero.

The **40.719-second production build** `vUVkSDDT5C69e7JfKdiI6` passed compilation,
types, hydration, 231 runtime traces with 76,308 entries and 575 server JavaScript
files, and build security. Focused lint, copy and source-security checks pass.
All 115 migration sources are unchanged. QA-only follow-ups corrected an expected
service count, an injected error envelope, a nonexistent fixture identifier, the
reload control's new button role and fixture path resolution. Their initial failed
runs are not counted as acceptance. Application source did not change after the build.

All writes, enrollment, security notices and recovery were confined to fictional
local fixtures with a local provider stub; production test writes, real sends and
production MFA activation are zero. Source, fixture databases, screenshots and
acceptance receipts are preserved. The shared large-build reservation was released.
This is DOM presentation protection, not heap/OS-snapshot erasure or real-device
acceptance. Same-owner cookie replacement without a lifecycle/read recheck remains
an existing transport limitation: POSTs check owner and existing server session
contracts, not an added view-key header. Legacy inline MFA, other account forms,
real owner enrollment, broader security gates and operator acceptance remain open.

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
