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
  Missing rows retain opaque recovery fences. Earlier compatible writers that
  change a completion or end an assignment clear consent and create a control.
- Account export includes the owner's retained completion and sharing choices.
  Account erasure clears private notes and disclosure, preserving previously
  completed church service anonymously under the existing retention contract.

The additive migration extends the current retention-control predicates and
adds database bounds and legacy-writer triggers. Apply it before enabling these
application changes. Both history and profile projections are bounded to 25
candidate records; history provides continuation. No new dependency, separate
service-history model or external notification provider was introduced.

## Verification and release state

Implementation and focused service, recovery, actual-HTTPS and browser
acceptance cases are prepared. Runtime verification is pending. This document
does not establish merge, production migration or live acceptance.

The current dependency security gate remains unresolved in the preceding
foundation batch. This feature must pass its own verification and the combined
release gates before publication.
