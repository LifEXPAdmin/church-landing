# Official church setup and representative claims

September 10, 2026 · Published and verified

## Behavior

The shared church journey now offers private representative setup for a new
church, an existing community listing, or additional access to a managed church.
Existing records retain their church ID, public page and history. A new church
stays unpublished until independent approval and explicit representative
activation. No account category, title or email address grants church powers.

Eligible accounts can save unfinished authority and public-profile drafts,
return after signing in again, preview public information, and keep optional
ministry/position/calendar/welcome preparation notes. Preparation notes do not
create appointments, invitations, events or posts. Those structured tools remain
separate implementation work.

Private review contact supports phone, email, video or another accessible method.
The submission records claim-specific consent, requested permissions, and a
snapshot of the submitted authority and profile details. Account downloads
include owned setup drafts and prior submitted snapshots, with explicit
projections and the existing size limit. Staff evidence and other accounts'
information are excluded.

## Authority boundaries

`REVIEW_CHURCH_CLAIMS` is an explicitly assigned operator capability. Initial
verification and disputes require that scope. A church administrator holding
`MANAGE_CHURCH_ACCESS` may review routine additional-access requests only for
their own church and only for permissions they currently hold. No self-review
is permitted. Reviewers must independently establish a trusted church channel
and record a minimal source reference, confirming person/role, check date,
decision and reason. A claimant-provided number or public website alone is not
proof. Reviewer evidence remains restricted.

Approvals do not issue grants immediately. Activation rechecks the claimant's
current eligibility and credential version, reviewer authority, policy version,
approval age, current church management version and active affiliation. It then
atomically creates or updates the approved connection and exact reviewed grants.
An existing pending or approved affiliation elsewhere is never transferred.
Competing initial approvals cannot both activate against the same management
version. New matches appearing after a new-church review require a fresh check.
Existing public information changes only with explicit public confirmation and
the reviewed canonical version. Active profile managers can subsequently save,
preview and explicitly publish profile edits on the same church page.

Every issued grant records its originating claim. Ending a claim revokes only
grants still attributed to it; an independent later reassignment clears that
attribution. Current sessions lose permission on their next request. Public
representative status derives from currently eligible, effective management
grants and their approved claim. Suspension, connection loss or revocation
removes the verified-management badge without exposing any reviewer identity.

Private routes use production rendering, neutral metadata and no-store response
boundaries. Development pages stop before reading private account or claim data
so framework diagnostics cannot serialize it. POST routes enforce origin,
current session, body limits, durable throttling and transactional version checks.

## Operational gate

The recorded manual-verification policy remains a proposal. Production claim
submission, decisions and activation remain disabled by default. Private draft
preparation and voluntary withdrawal remain available to eligible accounts.
Enabling review requires both `CHURCH_CLAIM_REVIEW_ENABLED=true` and
`CHURCH_CLAIM_POLICY_VERSION=manual-review-v1`, an approved operating policy,
and explicitly appointed independent reviewers. An enabled flag alone cannot
grant a reviewer role. No real reviewer or church grant was bootstrapped by
fixture tests.

The implemented proposal accepts independent checks from the previous 90 days
and requires activation within 30 days of approval. Changing reviewed authority
requires a new submission; changed credentials or management state require a
fresh review. These settings are part of the reviewable proposal, not evidence
of an approved real-world verification process.

## Verification checkpoint

The full isolated suite passed all 182 applicable checks (184 total, zero
failures, two intentional disabled-delivery skips), including migrations,
backup/restore, process restart and real development/production HTTPS boundaries.
The final eight claim-service groups passed again after the authority-draft
privacy and activation-version changes. Two final production HTTPS groups also
passed with certificate verification, covering creation, review, activation,
revocation and private HTML/RSC/JSON. The release build checks 71 runtime traces,
5,181 entries and 171 server JavaScript files without a Prisma configuration
loader. Final lint/types/build checks passed.

Actual fictional browser journeys passed sign-in return, search, unfinished
save/reload/resume, accessible email review without a phone/building/domain,
private preparation, independent approval, explicit activation, scoped queues,
profile save/preview/publication, keyboard submission, Back and revocation.
A previously open editor could no longer save after access ended. The public
church retained its ID and meeting information while its verified badge was
removed. Guest claim entry preserved the church target without exposing private
contact, preparation or review information. Measured 320/390/1440px layouts had
no horizontal overflow; light and dark appearances were inspected.

Browser and production HTTP verification caught a missing church name in the
public preview; it is now rendered explicitly, including beside activation.
Unsubmitted revisions after a needs-information decision are owner-only until
resubmitted, and optional preparation notes never enter reviewer projections.
Profile publication follows a separate saved preview. A development test was
corrected to distinguish static component source from rendered badge content.
Old-tab prefetch errors occurred only against an intentionally stopped local
preview origin; fresh final pages returned no application errors.

No real claims, messages, calls, verification evidence, church grants or public
fixture content have been created. Physical-device and real operational pilot
acceptance remain separate.

## Production publication

Application `a0ede60daa74cab6a8a12cadb9e6a59285cbe35d` is live on READY
deployment `dpl_A746vaUDxw3umTnjPEzd4hqsfPC6`. Exact canonical serving
identity was verified. All 71 live HTTP checks passed at
2026-09-10T06:22:30Z, including guest HTML/RSC claim gates, anonymous and
forged-origin denials, public navigation and disabled-provider behavior. Public
post and church lists remain empty, so populated detail journeys were verified
with the isolated fictional fixtures described above. No real record was written.

Live 320/390px church setup, contextual signup return and Back navigation passed
without horizontal overflow. No deployment error entries were returned. Real
claim review remains disabled pending the policy and reviewer-operations decision.
Structured roles and the organization tree are the next implementation work.
