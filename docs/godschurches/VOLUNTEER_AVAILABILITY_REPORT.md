# Volunteer availability and cancellation notices

Implementation in progress, 26 September 2026 UTC. This report does not establish
integration, production migration, provider delivery or live acceptance.

## Scope and existing owners

The [volunteer contract](VOLUNTEER_OPPORTUNITIES_CONTRACT.md) and
[implementation receipt](VOLUNTEER_OPPORTUNITIES_REPORT.md) remain the authority
for applications, approval, capacity, independent shifts and private records.
The new delta adds optional availability to an existing application and explicit
volunteer reminder consent to the existing notification preferences. It reuses
the canonical signup, effective shift time, Activity, outbox and owner reminder
job. An application does not grant church authority or screening clearance.

Availability is a bounded plain-text preference for one opportunity, such as
preferred days, times and time zone. It is not a public diary, an automatic
scheduling rule, a calendar share or a promise to attend a different shift.
Published duties and canonical accepted times retain their existing meaning.
No calendar event, capacity counter or background scheduler is duplicated.

## Availability contract

- The applicant may include up to 500 characters when applying, then update or
  remove the preference on their current pending or accepted application.
  Blank is the default. Existing applications acquire no invented preference.
- Current application readers restrict the text to its owner and currently
  authorized coordinators for that opportunity, with source, account, membership,
  blocks and privileged-duty checks. Public cards and unrelated accounts receive
  no text. Canceled or completed assignments do not expose an active preference.
- Losing source access prevents new nonempty updates. The owner retains an
  empty-only removal path without receiving current source details. Coordinator
  access does not authorize editing someone else's preference.
- The existing application version, exact logical request key and permission
  lock govern writes and retries. Availability changes do not mutate signup,
  capacity, role grants, calendar responses or event time.
- Decline, withdrawal and cancellation remove the stored preference. Account
  erasure and protected recovery also clear it. The current owner export uses
  the same bounded source visibility. History records that the preference changed
  without retaining its previous text in audit or recovery records.

The existing private form guard conceals retained content after account change
or revoked access. The UI states the audience and effect before saving and keeps
non-sensitive values through safe retry/conflict handling. It discourages health,
screening and child information; no sensitive screening collection is introduced.

## Reminder and cancellation contract

RSVP reminders keep their existing consent. Volunteer shift reminders have a
separate default-Off choice, with 15-minute and 60-minute options. Existing
Commitments channel consent remains necessary for external delivery; a timing
preference cannot grant email or push consent. Either reminder source can keep
the shared owner job active without silently enabling the other source.

Canonical signup state and effective independent/inherited shift time determine
the reminder. Delivery must recheck current source access, eligibility, consent,
versions, cancellation, recovery quarantine and time. Completed, canceled,
conflicting, unavailable or already-started shifts cannot produce a new reminder.
Source edits invalidate prior notices; edits after the original due time cannot
backfill a stale reminder. Cancellation notices reuse the existing targeted
assignment/event Activity records with a truthful current cancellation summary.
Actual provider submission and physical-device receipt remain separate evidence.

## Additive storage and compatible writes

The local migration sequence extends existing records:

1. `20260926040000_volunteer_availability` adds the empty application preference
   and two default-Off volunteer reminder consent fields.
2. `20260926040100_volunteer_slot_modified` adds the canonical slot modification
   time. Existing rows start at migration time, preventing retroactive reminders.
3. `20260926040200_volunteer_reminder_contract` preserves the existing Activity
   source-shape rules while permitting the same strict shape for volunteer
   reminders. It enforces availability and consent bounds and adds the slot
   modification trigger for compatible older writers.
4. `20260926040300_volunteer_availability_history` extends the existing audit
   action constraint after the first focused run demonstrated that PostgreSQL
   rejected the new action. Existing version and note bounds remain enforced.
5. `20260926040400_volunteer_availability_scrub` clears the optional text when
   older compatible writers anonymize, quarantine or end an application. This
   prevents an older erasure path from leaving private text after removing its
   owner reference. A matching recovery trigger clears volunteer reminder
   consent when an older recovery writer quarantines notification preferences.

Applied local checksums are preserved across the incremental implementation.
This sequence alone is not production migration or protected-restore acceptance.
No provider credentials, production data, permission grants or delivery settings
are changed by this feature's local preparation.

## Verification checkpoint

Verification and measured runtime evidence will be recorded here after the final
source and combined built-browser checks. The isolated local fixture has applied
the existing calendar migrations and this additive sequence. Integration and
live release remain with the designated release owner.
