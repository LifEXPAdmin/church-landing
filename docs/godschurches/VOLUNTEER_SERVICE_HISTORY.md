# Volunteer service history

## Behavior

Church volunteer organizers can confirm that an accepted volunteer assignment
was completed. The volunteer independently chooses whether to show each confirmed
record on their member profile. Records start private, including existing timed
completions migrated from the earlier system. Confirmation is not a credential,
screening result or hours claim. The displayed date is the confirmation date.

Timed and instant roles retain their canonical `PostVolunteerSignup` receipt.
Untimed accepted roles keep completion on `VolunteerApplication`; they do not
invent calendar events or a second signup. Completion does not release capacity.
A reasoned correction clears its profile consent. A subsequent confirmation
requires a new sharing choice.

Volunteers manage records at `/platform/serve/history`. Coordinators confirm
accepted applications from the existing applications page, and direct roles from
`/platform/serve/roles/[id]`, linked from the authorized roster. These private
pages use the existing account-bound snapshot guard and original-request retry
controls. The member profile shows only currently authorized shared projections.

## Permission and persistence contracts

- Assignment, completion and sharing revisions are distinct. Completing or
  correcting advances the assignment and both service revisions. Changing
  sharing advances only the service revision.
- Strict commands validate original account, current authority, source access,
  revisions and immutable request identity before replaying a saved receipt.
  An organizer cannot opt a volunteer into profile sharing.
- Need-linked completion still requires both the current Need coordinator and
  volunteer organizer permissions. Its existing completion path uses the same
  canonical receipt and control journal.
- Current organizers can correct an existing receipt after the volunteer loses
  source membership. The correction and its exact retry retain actor authority
  checks. Application and roster reads expose only a redacted correction receipt,
  concealing former applicant names, answers, history and source links. They offer
  no new completion, general application action or sharing. Once corrected, an
  unavailable application disappears from that correction-only queue.
- Sharing requires current confirmed service and source access for both the
  volunteer and profile reader. Generic member previews assume no church rights.
  Guest profile behavior is unchanged. Application answers, availability and
  private notes never enter the profile projection.
- The owner can withdraw consent after source access is lost. Private history
  then uses minimal unavailable-source metadata. Retained page snapshots are
  invalidated when the underlying sharing or authority changes.
- Completion journals opaque controls for the volunteer owner as well as any
  actor controls. If protected storage is unavailable, the committed receipt
  returns HTTP 202 with a pending-protection message; exact retry protects the
  existing receipt without another completion.
- Recovery controls quarantine stale service disclosure without changing
  assignment state, completed capacity or the original completion timestamp.
  Historical application and linked Need completion notes are scrubbed only for
  the matched owner record, including historical Need action spellings. A repeated
  older control preserves newer deliberate confirmations and unrelated history.
  Missing rows retain opaque recovery fences. Restored rows cannot offer a new
  confirmation until reconciled; withdrawing consent preserves that quarantine.
  Earlier compatible writers that change a completion or end an assignment clear
  consent and create a control. Deliberate reconfirmation of a reconciled receipt
  removes protected historical notes before saving its fresh note.
- Account export includes the owner's retained completion and sharing choices.
  It checks the owner's matching source controls as well as persisted quarantine
  flags, suppressing stale sharing markers and protected completion history even
  before an older restored row is reconciled. It preserves canonical timestamps,
  assignment state and revisions without mutating the exported records.
  Account erasure clears private notes and disclosure, preserving previously
  completed church service anonymously under the existing retention contract.
  This includes linked Need completion notes authored by an organizer about the
  erased volunteer.

The additive migration extends the current retention-control predicates and
adds database bounds and legacy-writer triggers. Apply it before enabling these
application changes. Both history and profile projections are bounded to 25
candidate records; history provides continuation. No new dependency, separate
service-history model or external notification provider was introduced.

## Verification and release state

The local application at `babbe6b385c08de105e93e2c9d60e42d10ffac07`
passed production build `3Nh6AXp_b-6yikFFJdsjA`, full types, lint with no
errors, source/copy checks, and hydration, runtime-trace and public-build
guards. No dependencies were added.

There are 140 applicable passing service, migration, recovery and actual-HTTPS
cases, with source-bound evidence reused only for unaffected behavior:

- `babbe6b`: 21 recovery cases, five export service cases, and eight actual
  completion/export HTTPS cases.
- `50c6a69`: 50 unchanged core, application, participation and Need cases.
- `ea33008`: five unchanged participation/profile HTTPS cases.
- `b10c1b43`: 51 unchanged migration, availability, shift, notice, reminder,
  profile and retention cases.

The populated migration test upgrades all 125 predecessor migrations, preserves
original columns in 165 tables, and verifies an actual PostgreSQL dump and restore.

Nine Chrome browser groups pass against `ea33008`, production build
`oBh_FtgdMMiLXjBuefTAE`, over trusted local HTTPS. That UI and browser source
remain unchanged by the subsequent export and quarantine repair. They cover
private defaults, same-document account replacement
and return, trusted native tab blur, organizer completion, malformed and lost
receipts with exact retry, authorized profile disclosure, narrow large-text
layout, keyboard withdrawal, retained profile invalidation, correction and
reconfirmation, and the actual redacted former-member correction flow. Captured
narrow and desktop screens were inspected. The browser reported no JavaScript
errors or external requests.

Verification reproduced and repaired historical-note recovery/erasure defects,
preserved organizer correction after membership loss and the existing Need
permission denial, and fixed a saved-receipt UI refresh suppressed by a changed
access generation. Request settlement still requires the original authorized
generation before clearing local work. The subsequent read refresh preserves
the pinned account and concealed-page boundaries. Five additional failing cases
at `0446d3f` established restored-export and legacy-quarantine note defects before
the final backend repair; all pass in the complete recovery suite at `babbe6b`.

These checks used isolated fictional data. They do not establish physical-device,
privileged-MFA, production migration or live acceptance. Owned fixture processes
are stopped. Integration and the combined release remain open.

The current dependency security gate remains unresolved in the preceding
foundation batch. This feature must pass its own verification and the combined
release gates before publication.
