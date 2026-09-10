# Church positions, responsibilities and access

September 10, 2026 · Published structure foundation; local role-library browser acceptance pending

## Role library implementation — September 10, 2026

The local `codex/church-role-templates` branch extends the published structure
with a searchable 82-title starter library. Each title explicitly references one
of eight versioned recommendation presets. A custom church title starts with the
member/service preset and no additional recommended powers. Managers can edit
the title, description, responsibilities and supported recommendations before
saving. Sensitive access delegation and help-coordinator appointment start off;
reviewed profile authority and unsupported draft-only/welcome tools cannot be
added here. Recommendations do not grant any access.

Eligible approved structure managers manage up to 200 active church-owned titles
from **Structure → Role library**. Names are normalized for clear duplicate
handling within one church. Another church may independently use the same name.
A title can be archived without changing a saved position or its permissions;
the name can then be reused as a new title. Immutable content revisions retain
prior names, responsibilities and recommendations. Updates and archives recheck
current membership/authority and both church/title versions in the existing
serialized transaction. Creation uses a stable idempotency key.

**Add a position** can copy a chosen church title and responsibilities into a new
position instance, retaining its exact title revision through a composite
church-scoped foreign key. Choosing the same title again creates another
position; it does not merge positions, guess a supervisor, assign a member or
apply permissions. Retitling or archiving the library entry leaves existing
position names, duties, parent links, appointments and grants unchanged. Editing
an existing position retains its original revision reference. Published positions
receive only nullable reference columns in the additive migration; their IDs and
existing relationships remain intact.

The library editor preserves failed/stale drafts, previews the latest saved title
before an explicit retry against its current version, retains creation keys,
and confirms discard. Ordinary link navigation and document unload warn about
an open draft; browser-history navigation inside the app remains separate future
navigation work. The layout uses native controls, visible focus/status feedback
and responsive cards. Real role assignment still uses the existing separate
position/access operations. Assignment-owned grants, mandatory Privileges review,
visual canvas, placement/drag/history and integrated chart acceptance remain
subsequent implementation tasks.

The full isolated regression run passed **323 checks: 321 passing, two expected
account-delivery skips, no failures**. This includes the populated additive-upgrade
rehearsal, six new role-library service groups, existing structure/account/calendar/
post/profile regressions, backup/restore, fresh migration setup and actual
development/production HTTP. After replacing native confirmations with in-page
review controls and preserving the new-position reporting draft, all 22 final
production HTTPS portal/structure/entry/guest checks passed again. Lint/types and
build passed; the final runtime audit found 91 traces, 7,198 entries and 223 server
JavaScript files with no private fixture/environment files.

Actual fictional browser navigation reached the library, confirmed its 82-title
catalog and narrowed search, opened a starter with keyboard focus, edited its
recommendations and saved/reloaded the title. The 390-pixel editor was readable
without horizontal overflow. A native confirmation in the original picker then
stalled in-app browser input. It has been replaced with visible page controls,
including deliberate title application, preset/discard/archive review and current
saved-library recovery. Applying a title preserves the chosen reporting line,
returns focus to the position name and disables the picker during a save.

**Browser acceptance remains open.** The old test dialog needs dismissal before
confirming the replacement controls, two-tab conflict recovery, stable network
retry, separate position creation, archiving and remaining responsive journeys.
The browser's documented dialog/close controls could not clear the stalled tab;
a paired owner action records the exact temporary workstation step. This is not
a completed or published role-library checkpoint. No real church records or
permissions have been changed. The live release remains the password-recovery
entry update; actual email activation is a separate owner dependency. Further
permission-service work can build on the verified additive schema while browser
acceptance remains explicitly pending.

## Implemented behavior

An eligible approved member can open their church overview, expandable position
structure, full keyboard/mobile outline, own responsibilities and consented
contact cards. Positions have a name, responsibilities and one primary parent.
They can be vacant or have several assignments; one member can hold several
positions. Unlisted assignments remain occupied without returning the person's
name, account identity or contact fields. Contact cards require a listed eligible
member in the same church and project only their chosen directory fields.
Authentication email is never a contact fallback.

`MANAGE_STRUCTURE` explicitly permits creating, editing, assigning and archiving
positions. Titles, profile categories, follows and ordinary membership grant no
software authority. Creation preserves an idempotency key; every mutation uses
current session, eligibility, membership, capability and transactional version
checks. Composite database references prevent cross-church parents/assignments,
and a database trigger plus service validation reject reporting cycles. A church
can have up to 200 active positions, twelve levels and ten assignments per
position. Archives require child positions to be moved or archived first.

A current access manager can grant another eligible approved member only a
supported permission they also hold. Self-granting and silently replacing an
active grant are denied. Public-profile management continues through reviewed
representative setup. Explicit access revocation rechecks the current grant
version and ends its use in existing sessions. Position appointments are
independent; members may step down from their own appointments. Connection
removal and suspension end appointments, grants and sharing. Rejoining cannot
restore them. Active position duties require handoff or stepping down before
account deactivation.

Listed-member search and pagination use directory display names only. An
unlisted member can voluntarily share a church assignment code from My
responsibilities; the code identifies a church connection and never authenticates
an account. General tree responses do not expose another unlisted member's code.

Private routes stop before reading credentials/data in the development renderer.
Production uses neutral metadata, explicit projections and private no-store API
responses. Mutations enforce origin, session, body bounds and durable throttling.
The overview links working People, Structure and My responsibilities destinations;
calendar, church posts and volunteer areas have honest empty states until their
own modules are implemented.

## Verification status

All 195 applicable isolated regression checks passed (197 total, zero failures,
two expected disabled-delivery skips). Nine structure service groups and actual
development/production HTTP groups cover saved trees, multiple assignments,
consented contacts, scoped delegation, self/cross-church/cycle rejection,
concurrent edits, current-session revocation, removal/rejoin, suspension,
step-down/deactivation, depth/size bounds and member-search pagination. Synthetic
upgrade, full backup/restore with row and schema fingerprints, fresh migrations
and restart passed. The cycle trigger and its function are included in restore
verification.

Final lint, compilation/types and runtime verification passed: 79 traces, 5,739
entries and 189 server JavaScript files, with no Prisma configuration-loader
path. Both targeted production HTTPS structure groups passed again against the
final build with certificate verification, including private HTML/RSC/JSON
projections and denied requests.

Actual fictional browser forms created the Leadership → Outreach → Volunteer
Coordinator hierarchy, assigned listed and unlisted members, and kept Worship
vacant. The consented card displayed only the chosen email. A second browser
session read the saved tree and exercised an explicitly granted edit. Revoking
that permission in the first browser blocked the already-open editor without
removing the position assignment. The member then explicitly stepped down.
Tree/outline switching, reload, Back, keyboard expansion, overview links and
320/390/1440 CSS-pixel layouts passed. All twelve levels remained readable at
320px, with a complete flat outline and no horizontal overflow. Light/dark
appearance was inspected; browser warning/error logs were empty. Fictional
sessions were logged out and verification processes/tabs were closed.

Browser verification used a production Next UI over loopback HTTP with the real
supported-development API boundaries. The separate HTTPS tests exercised actual
production cookie and header behavior. Neither is a physical-device test.

Verification found and fixed the claim validator's old four-scope limit and the
same-route tree/outline query navigation. The claim limit now follows the scope
allowlist; claim activation asserts the new structure permission. Tree/outline
controls use ordinary document links. A logically equivalent PostgreSQL CHECK
expression was written in stable form so strict schema fingerprints survive
backup/restore without weakening the comparison.

No real church position, account grant, message, member import or verification
has been created. Real claim review remains disabled pending the recorded policy
and reviewer-operations decision. Provider delivery, physical-device acceptance
and a real operational pilot remain separate requirements.

## Published release

Application `73ea360cd953edf01047751c9a7acbbb866e4fb2` is live on READY
production `dpl_8UokbVooXAFf9n3tbHHcnb9bEDM9`. Exact serving SHA and canonical
aliases were verified. All 93 live HTTP checks passed at
2026-09-10T07:35:32Z with no production writes. Public post/church lists remain
empty; populated behavior was verified in isolated fixtures. Live 320/390px guest
structure/signup/Back navigation preserved its destination without overflow.
Production error logs returned zero entries.

One initial in-app browser journey reported React #418 (HTML hydration mismatch)
at 07:35:21Z. The page recovered. Reload/repeated navigation and fresh in-app and
Chrome journeys completed without new browser errors. This intermittent
observation is recorded as an open navigation investigation; it is not claimed
fixed and does not establish physical-device acceptance.
