# Private saved calendar layers

Local implementation and acceptance checkpoint, 22 September 2026 UTC.
Production remains the separately verified event privacy navigation release until
the release receipt below is completed.

## Behavior and ownership

My calendars saves the signed-in person's follow, visibility and color choices
for an available source. A missing record preserves the previous effective
followed/shown/default-color behavior. An explicit unfollow remains a stored
choice and removes that source from the saved overlay. Hiding is independent of
following. Available calendars remain discoverable for refollowing or direct
inspection. Choices apply to each existing bounded page of available calendars.

The current month/layer URL remains a temporary view. Saving a source choice
returns to the saved view with month, zone and applicable cursor retained, and
clears the temporary selection. A direct source or church page remains an
intentional current-access view. Decorative palette colors accompany visible
source names and labels; colors never convey permissions or event status alone.
Calendar Settings and help link to the canonical source controls.

CalendarLayerPreference is the sole per-person/source owner and will also supply
later saved display work. No source, event, role, membership, response, volunteer
commitment, notification choice or external subscription is copied or changed.
The existing current-access reader is shared by save and read operations. Busy
projections retain their allowlist, and revocation removes source details on
refresh. Saved choices never grant access.

## Persistence and lifecycle

The additive calendar-layer migration creates one uniquely indexed owner/calendar
record with a version, bounded palette and exact request identity. Existing
CalendarForm handles unsaved edits, current account pinning, version conflict,
uncertain responses and retry. Retries recheck current source access and cannot
repeat a write. Competing saves serialize under the existing portal transaction.

Account export includes only the owner's preference metadata; other calendars'
content and internal request identities are excluded. Account erasure removes
these choices, and calendar deletion cascades its now-useless preferences.
The existing opaque protected-control journal handles CALENDAR_LAYER. If a
newer receipt meets an older or missing row after restoration, recovery turns
following and visibility off, resets color and requests owner review. Replay is
idempotent, never recreates an erased owner or deleted source, and never replaces
a newer explicit owner save. Journal kinds and account constraints retain all
previous cases.

## Observed checks

Five new isolated service checks pass, covering default preservation, a second
sign-in, source immutability, independent preferences, exact retry, concurrent
conflict, invalid input/account identity, Busy/full access and revocation,
protected recovery, export and erasure. The first combined run passed 23 of 24;
its one failure was an incorrect 404 assertion for an existing 403 revoked-agenda
contract. Correcting the test made all five new checks pass; application behavior
was unchanged.

Four built HTTPS browser groups pass: saved hide/color and new-sign-in behavior;
unfollow from a temporary view and lost-response retry; reachable labeled controls
at 320, 390 and 1280 pixels with 200 percent root text; revoked open forms and
account-switch concealment. The first browser run's three complete groups passed;
its final selector matched a correctly concealed error instead of the visible
access-change notice. The corrected selector passed all four groups without an
application change. Browser errors and external requests were zero. Evidence is
fictional local acceptance, not physical-device or real-member editing evidence.

TypeScript, copy checks and the production build pass. The build retains the
verified hydration repair and 231 runtime traces without private fixture material.
An encrypted verified-TLS production backup was restored locally, upgraded from
105 to 106 migrations, and passed protected replay. All 147 original table/column
fingerprints match; plaintext restoration files were removed. Production was not
modified by the rehearsal.

## Runtime review

No dependency or extra browser request was added. Private listings use one bounded
preference batch for at most 20 calendar IDs; a private detail read uses one unique
owner/calendar lookup. Agenda color presentation uses already-authorized data.
Compared with the prior built release, route client chunk counts remain 12 for
calendars, 13 for events and 14 for Settings. Measured Node gzip output changes
by 30 to 32 bytes on calendar/event routes and 572 bytes on Settings. No speed
improvement is claimed. Existing pagination, source redaction and snapshot guards
remain in place.

## Acceptance still open

The complete support regression gate and affected existing browser/HTTP suites
are running. Final source review, compatible rollback evidence, exact merge,
production migration, installed recovery registry, READY deployment, independent
canonical assignment, serving identity, live checks, data fingerprints and private
task readback remain required. This checkpoint does not mark the feature released.
Saved calendar default views, reminder delivery and private subscription links
retain their separate source and acceptance work.
