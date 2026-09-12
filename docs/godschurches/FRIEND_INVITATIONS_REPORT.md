# Personal invitation verification

September 12, 2026. Released product version 2026.09.12.3.

Application `4fb52ed12e8eab94b786fdf572fce3da0ffa9434` is published in READY
deployment `dpl_fYMmbx1ueDJAa7mjW1JpJswVEoq1`, assigned to the canonical domain.
The serving release identity and 14 live read/browser groups passed at 03:28 UTC,
with no application mutation requests, browser errors or deployment error rows.
Migration `20260912031500_friend_invitations` brought production from 27 to 28
complete checksum-matched migrations. All 69 existing tables retained their
original-column row fingerprints; both new tables started empty. One schema
migration was applied, with zero application row writes. The protected encrypted
backup and restore rehearsal passed before the migration.

Menu opens My QR code for a signed-in account, with an explicit standing-consent
step before issuing a 30-day personal invitation. Guests keep the general website
QR. Copy, native Share and PNG use the same current server-issued URL. The actual
rendered code remains square at phone widths; download rechecks owner and revocation.

A newcomer explicitly chooses whether to connect. Accepted consent belongs to the
new account, survives verification in another browser and completes only after
normal verified adult eligibility. Existing members explicitly Connect. Friendship
uses both canonical follow edges and a consent record, with no new church, contact
or private-content access. All current unfollow, block, suspension and deactivation
paths invalidate the connection/pending acceptance. Old callbacks and receipts
cannot restore removed friendships. Failed connection writes roll back both edges
without rolling back successful email verification or adult eligibility.

Review repaired the legacy community unfollow omission, safe-return route omission,
phone QR stretching, and unresolved-request navigation handling. Existing lifecycle
HTTP assertions were updated for the already-shipped lazy comment API; they still
verify disappearance and restoration of permitted content, counts and old sessions.
No private-draft reply-permission behavior was changed.

Verification:

- 13 invitation service cases: explicit consent, opaque/purpose-safe reads, both
  directions, concurrent/exact retries, changed-body conflicts, signup decline,
  cross-browser verification in either eligibility order, duplicate signup,
  expiry/rotation/revocation, bilateral blocks, removal callbacks, deactivation,
  suspension/deletion, export-token exclusions and injected second-edge failures.
- 22 existing social/post/search service cases; populated 28-migration upgrade,
  dump/restore of records and constraints, and no writes to production.
- 16 account lifecycle/export/invitation HTTPS checks using the isolated server.
- Seven personal-invitation browser groups and ten shared-sharing/browser groups:
  real registration/signin/adult forms, independent-browser verification boundary,
  confirmed profile status, lost-response exact retry, wrong account, revoke,
  square on-screen/PNG QR decoding, 320/390px layout, keyboard/Back and enlarged text.
- 13 navigation/release-content tests; lint/types/build/runtime tracing.
- Protected PostgreSQL 17 production backup restored locally; the candidate
  migration preserved all original columns and row fingerprints in 69 tables.

Production-mode local preview disables external mail. The independent-browser
verification check invokes the actual verification boundary in the isolated test
process with no recipient cookie. This proves server-bound completion, not real
email delivery, a physical camera scan or owner acceptance. No personal code was
issued for a real person during QA. Open `/platform/invitations` to enable your own.

Photo activation, approved church content and the full physical/owner rehearsal
remain separate open requirements. The private release receipt retains the exact
deployment, backup, migration and browser evidence.
