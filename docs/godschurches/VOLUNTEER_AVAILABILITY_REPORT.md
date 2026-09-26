# Volunteer availability and cancellation notices

Tested handoff for release-owner integration, 26 September 2026 UTC. This report
does not establish production migration, provider delivery or live acceptance.

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

### Integration and rollback floor

The release owner merged the tested handoff into the current account security
baseline on 26 September 2026. Combined regression, production migration,
installed recovery and live acceptance remain pending at this source checkpoint.

Migration-110 client compatibility establishes older database reads and writes,
not continued volunteer reminder behavior. The older RSVP-only planner can
remove the shared owner job when RSVP reminders are Off, even when the new
volunteer choice is On, and its worker does not resolve volunteer sources.
A rollback promising continued volunteer reminders must retain the combined
preference, planning, worker and notification-source implementation. An older
application rollback therefore cannot claim that capability remains available.
Keep all five additive migrations, including migration 115's older-writer
erasure and recovery scrubs. Do not use destructive down migrations.

## Runtime cost and build evidence

Compared with `20d81d7`, the implementation adds no package or lockfile changes.
Availability extends existing bounded application reads: pages contain at most
25 rows, fetch one extra row for pagination and include at most 20 history events
per row. Its projection adds no per-card query. Existing owner-application reads
already perform source and eligibility checks per row. Export adds only the
signup state/completion relation within its existing bounded query.

Reminders reuse the single persisted owner reminder job, existing queue, outbox,
dispatch and recovery. The combined RSVP/signup due query returns at most 11
candidates, processes at most 10 and may issue one next-time query returning one
candidate. The shared due-time cursor handles different lead times and retains
legacy RSVP cursor keys. The reminder resolver accepts at most 50 same-owner
events and fetches at most 50 signups. Fanout remains 20 recipients per batch;
job dispatch retains its 100-row bound and concurrency of 8. There is no new
scheduler, provider or job table.

The runtime review found an avoidable activity scan in the initial handoff.
Commit `9a7c424` replaces it with one application primary-key lookup selecting
only its owner and signup IDs after successful coordinator acceptance or
cancellation. The callback dispatches that exact recipient's existing job, including
on retry. Other mutations retain the actor/fanout handoff without this lookup.

These are inspected application bounds, not measured database query plans.
The due query may still scan and sort an owner's active commitments before its
limit. Nested Prisma relations and authorization contexts can issue multiple
queries. The reminder resolver's application/opportunity selections could also
be narrowed further to avoid loading unused scalar fields. No SQL timing, load
test or runtime speed improvement is claimed.

The local production build of `ab4a610` passed at 04:33:50 UTC on 26 September
2026, taking 48.480 seconds wall time. Its runtime check inspected 231 traces,
77,509 entries and 574 server JavaScript files. The build security check inspected
329 public files using three fictional supplied secret keys with no findings.

| Route family                     | Next First Load JS | Measured gzip asset bytes |
| -------------------------------- | -----------------: | ------------------------: |
| Serve                            |             158 kB |                   157,800 |
| Opportunity and own applications |             158 kB |                   157,799 |
| Settings and subsections         |             195 kB |                   195,495 |

The gzip figures sum each route's unique manifest assets, compressing each at
level 9 and including shared chunks. Next reports 103 kB shared by all routes.
These are local build sizes, not network transfer or hydration timings. A matched
base build was unavailable, so these figures do not establish an exact feature
byte delta. Functional suite duration is also not an endpoint-latency benchmark.

## Source and verification

Implementation commit `0aca17f` was reconciled with published base `20d81d7` by
merge `6554705`. Commit `fcbadd5` corrects a quarantined anonymous fixture, and
`9a7c424` makes the exact-recipient handoff described above. Commit `ab4a610`
adds spacing between the availability actions and corrects the browser harness;
it changes no service or migration behavior. The last runtime source is
`ab4a61025bb591a363606d5f032a272face74bc9`.

- All 21 new availability, reminder and cancellation checks passed on service
  source `9a7c424` at 04:25:44 UTC. The Node runner took 224.079 seconds, with no
  failures, skips or cancellations. These include actual isolated PostgreSQL
  constraints and privacy triggers, owned export/erasure, protected recovery,
  independent shifts, separate dated consent, 13 equal-due sources over a bounded
  mixed cursor, stale-version/access suppression, quiet hours, queue retries and
  injected opaque push delivery. The final handoff check additionally covers
  exact-recipient retries, ordinary mutations and erased or missing owners.
- The 88 affected checks cover applications, shifts, existing RSVP reminders,
  notifications, participation and actual HTTP rendering, retention/restore,
  account export and linked Needs. All passed across the initial run and targeted
  reruns on reconciled source `fcbadd5`. The initial run passed 83; four HTTP checks
  could not connect to the absent local server and one restore check selected
  PostgreSQL 16 tools against the PostgreSQL 17 server. Starting the built
  server, selecting matching tools and setting the production-render assertion
  mode resolved these fixture setup failures. The retained final HTTP/export
  rerun passed 9 checks; both restore checks also passed.
- The fresh production build, TypeScript, scoped ESLint, authored-copy check and
  whitespace checks passed. The exact runtime source also passed the
  [Linux source-security workflow](https://github.com/LifEXPAdmin/church-landing/actions/runs/36218164517),
  including full lint, source and migration-guard checks, known dependency
  advisories, registry signature/provenance checks and reachable-history secret
  scanning with redacted output.
- All 12 built-browser groups passed on `ab4a610` at 04:35:07 UTC, with no browser
  errors or external requests. They cover optional application, saved private
  availability, applicant/coordinator versus unrelated/anonymous access, exact
  request replay after a lost response, real validation and version conflict,
  removal/re-addition, approval without duplicate capacity, separate Off/15/60
  reminder choices, account switching, coordinator revocation and withdrawal.
  Screenshots cover 320, 390 and 1280 pixels, including enlarged text at 320;
  controls remain available without horizontal overflow. The final action row
  separates Save and Remove while wrapping on narrow screens.

Browser setup/QA corrections included supplying the isolated browser-runtime
module path, locating a prefilled textarea by its correct accessible textbox
name, waiting for the retry request to settle and using the existing preference
owner key. These failures and the final successful run are retained privately.
The affected checks are not a fresh full-project regression; the designated
release owner must verify the combined release before closure.

## Migration and recovery rehearsal

The isolated PostgreSQL 17.11 rehearsal passed 21 checks at 04:14:49 UTC on the
unchanged migration source in `0aca17f`. It applied the first 110 migrations,
seeded fictional records and then applied all five additive migrations. Original
columns and rows matched across all 149 tables, including 16 populated tables.
All 115 actual migration-ledger checksums matched source. Availability defaulted
to empty, volunteer consent remained Off and no reminder was backfilled.

An actual Prisma client generated from the older 110-migration schema could
read and write the upgraded database. Old slot edits advanced the modification
timestamp. Old anonymization, quarantine, decline and withdrawal writes scrubbed
unknown availability, and old recovery followed by a preference save could not
revive volunteer consent. These transactions rolled back without changing the
original fingerprints. Invalid bounds and malformed Activity source rows were
rejected by the database.

A baseline backup restored into a fresh fictional database and then upgraded
successfully. A separate upgraded backup restored with every current column,
all 115 checksums, four relevant constraints and three enabled triggers intact.
The first attempt stopped before upgrading because its backup executable was
older than the server; the matching installed version completed a fresh run.
This proves a local fictional-data rehearsal, not production recovery, an
encrypted backup installation, a schema down migration or a complete older
application browser run.

## Corrections and release gates

The first focused runs exposed the missing new application-history action in
the SQL constraint and an implicit timezone conversion between legacy shift and
occurrence timestamps. Both product defects were corrected. The history update
is additive migration 114; effective shift timestamps now explicitly interpret
legacy UTC storage before combining timestamp types. Independent review then
found two older-writer privacy gaps, addressed by migration 115's availability
and consent scrub triggers. Invalid public/anonymous fixtures and the guest
HTTP-boundary assertion were also corrected, with failed-run receipts retained.

The release owner must integrate the branch, run required combined regression,
reconcile and apply migrations 111 through 115 with production recovery evidence,
then verify deployment readiness, canonical-domain assignment, serving identity
and live behavior. Local acceptance does not satisfy actual provider submission,
physical-device receipt, child/screening policy or pilot evidence. This feature's
preparation made zero production writes and zero provider sends. No permission
grant, delivery consent or provider configuration was widened.
