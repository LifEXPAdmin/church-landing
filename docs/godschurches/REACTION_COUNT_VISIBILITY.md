# Optional reaction-count visibility

## Implemented contract

The existing browser reading preference controls which Like and prayer totals a
reader sees. Appearance retains its preview, save and display-default controls;
Privacy points to that same editor. The shared count renderer omits hidden
numbers from DOM text and accessible names. It never substitutes a false zero.
This display preference is local to the browser and does not change another
reader's settings or the author's account choice.

A separate account setting hides reaction totals on the owner's personal posts
and comments for every current reader, including the author. It uses the existing
SocialPreferences record, an independent optimistic version, original-account
validation and exact request receipts. Old relationship-privacy requests preserve
this setting. Church-authored speech does not inherit its operator's personal
preference. Each comment follows its own speaking identity.

Server projections return null for a suppressed total on ordinary posts,
comments, prayer acknowledgments, feed and profile activity, profile pins,
availability reads, Like refreshes and nested repost sources. Plain repost
interaction counts follow the original source; quote commentary and its source
follow their respective authors. Private preference fields never enter public
author DTOs. Current source availability, account, church, block and withdrawal
checks remain authoritative.

People can still Like, Unlike, choose I prayed, undo their acknowledgment, and
manage private prayer follow-up. Their own state and mutation versions remain
available. Hiding the prayer total does not revoke another person's consent to
share their name. Comment totals are outside this setting.

The account editor retains the original request and draft through lost responses,
account changes, backgrounding and conflicts. The original editor remains above
the account-keyed application shell; current server identity and foreground
access separately gate its presentation and actions. Guest refreshes preserve
the working copy, and sign-in recovery opens another tab. Returning to the
original account refreshes stale page identity before restoring the editor. It validates the exact next receipt
version and the fresh current choice before reporting a successful save. A
subsequent change from another tab requires explicit reconciliation. The Like
controller rejects stale count refreshes while retaining an uncertain original
request and adopting authoritative own-state updates after confirmed requests.

## Data and recovery

Migration `20261007113500_reaction_count_visibility` adds three preference
columns and extends the existing recovery journal constraints for this owner-bound
record. Defaults preserve the previous visible-count behavior for accounts that
have never made a choice. The account export includes the owner's setting and
recovery state. No new reaction store or dependency is introduced.

The recovery journal stores an opaque version, not the hidden choice. Replaying
an older or missing preference record forces totals hidden until the owner reviews
and explicitly saves a choice. Repeated replay is idempotent and a newer explicit
choice is preserved. Forged ownership is rejected. Additive schema must be applied
before publishing this application. A rollback to an older application that ignores
the preference would expose totals; any rollback must preserve the count-redaction
readers and recovery behavior. Do not drop the preference or journal records as a
routine rollback.

## Local acceptance, 7 October 2026 UTC

Database checks cover default and exact-retry semantics, older privacy clients,
all canonical projections, actor separation, source revocation, exports and
recovery. The isolated mixed-author measurement reads one preference batch for
both one and 24 posts. Observed total queries are 12 and 15, respectively; these
include existing page and comment-preview work and are not a performance
improvement claim.

Controlled actual-component checks reproduce and verify repairs for two races:
a later account change arriving between save and confirmation, and a newer Like
projection arriving while the old Like refresh is in flight. The expanded 27-case
probe also rejects malformed receipt versions, stale parent access and
account-changing frame replacement. These probes are separate from
native browser evidence.

Application `caeff5d12f689308d40f5df2193e8f5dbb2ffb9a`, production build
`UNUHEfl7wT-qJtmlrSGzL`, passed loopback acceptance at 12:37 UTC. All six HTTPS
checks and 20 native Chrome groups passed with MFA enforcement enabled. The
browser cases include 15 count/settings groups and five existing comment-reader
regressions, actual focused account-changing server refreshes, guest recovery,
opening sign-in in another tab, identical uncertain POST retry bytes, prayer and Like
actions, shared settings persistence and a 320-pixel layout check. Captured page
errors and external requests were empty.

The recovery case opens the actual login page in another tab, then restores the
original fictional session cookie. It verifies navigation and draft recovery;
it does not claim credential submission or provider login inside that popup.

All 57 registered checks and the 125-migration populated upgrade and actual
PostgreSQL dump/restore passed on `0ac02e3`. Later changes are confined to the
settings page tree and browser QA; the registered backend, schema and test inputs
are unchanged. The final production build includes copy, type, lint, hydration,
runtime-trace and build-secret checks. Failed test attempts and repaired browser
and fixture defects are retained separately; only the completed final driver is
claimed as fully passing.

The feature is locally verified for integration. No production migration,
deployment, writes or sends occurred. Integration, combined source/security CI,
recovery and canonical live acceptance remain separate release gates.
