# Church positions, responsibilities and access

September 10, 2026 · Local verification complete; publication pending

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
