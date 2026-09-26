# Personal calendar reminder implementation checkpoint

26 September 2026 UTC. Local implementation, not a production receipt.

The notification preference owner now supports Off, 15 minutes before or
60 minutes before a person's timed Going or Maybe events. Calendar Settings
links to that owner and retains the existing saved calendar layers and regional
display preferences. The interface explains exclusions, dated consent, quiet
hours and best-effort delivery. Display saves never enable a notification channel.
The [contract](CALENDAR_REMINDERS_CONTRACT.md) defines the supported scope.

Scheduling reuses the existing durable notification consumer, Activity source,
phone outbox, current-access checks and protected consent journal. One opaque
versioned wake-up row per opted-in account is processed in bounded batches.
Retries do not duplicate Activity or phone intents. Opt-out, withdrawal, source
changes, loss of access and account restrictions are rechecked before delivery.
Phone expiry is capped at event start, including provider retention and quiet
hours. Recovery clears stale restored consent pending deliberate review.

An occurrence-specific modification timestamp prevents a late edit from
backfilling an overdue reminder without suppressing another occurrence's valid
reminder. Its database fallback also timestamps writes from a compatible older
application during rollback. The cutoff does not depend on an editor's erasable
audit history. No dependency or new external provider was added.

## Local verification

The focused combined runs pass 51 checks across reminder, notification consumer,
outbox, integration, calendar, display, saved layers and release content. Thirteen
new reminder checks cover dated consent, exact retry, stale writes, dense cursor
batches, failed and racing queue dispatch, current access, source revocation,
quiet-hour expiry, source instants across DST, lifecycle recovery, export and
erasure. Two additional defects were reproduced before correction: a sibling edit
suppressed a valid reminder, and an audit-based cutoff admitted a late reminder
after editor audit erasure. Both now have passing canonical-source regressions.

TypeScript, website copy, full lint and the built application pass. Lint retains
36 existing unrelated warnings and has no errors. All 26 built-browser groups
pass, including five new reminder journeys and the existing display, Calendar
Settings, saved layers and regional settings journeys. Browser errors, external
requests, provider sends and production writes are zero. Five built HTTP checks
pass for rendering/privacy, source operations, identity and origin defenses.

The account-switch browser expectation checks deliberate concealment before
reloading the new account. A test-side missing local recovery-journal
configuration was corrected without changing the application consent boundary.
Visual inspection then reproduced an unstyled month picker: the server component
concatenated a style export across a client boundary, placing a function's text
in the class attribute. Shared control constants now live in a neutral module;
the server reads the actual strings and existing clients retain their exports.
The built browser check asserts visible input dimensions, border and block layout.
All 26 browser groups and five HTTP checks pass again on the final build. A
browser timing correction waits for the account-change result rather than the
earlier blur concealment before leaving the dirty form. Both failed attempts are
preserved. The final change is limited to shared presentation constants and their
calendar import; services, permissions, schema and recovery are unchanged.

The complete regression initially exposed a historical fingerprint assertion
that included the new display columns. The harness now compares original fields
and separately checks the four new migrations' defaults and original-column
fingerprints. Its corrected uninterrupted complete run remains in progress.

The final encrypted production restore rehearsal passes a local 106-to-110
migration upgrade, preserving all 148 original table fingerprints over their
original columns and replaying protected controls. Production was read only.
Eight compatible-rollback checks pass against the previous built release: old
pages and writers remain usable, foreign/guest access stays denied, new settings
survive old preference writes, and the database timestamps old-runtime edits.
Returning to the current runtime retains the saved choices and rejects overdue
edited reminders after audit erasure. The old runtime cannot process the new
queue kind; durable work resumes with the current consumer and current deadlines.
No destructive schema rollback was used.

## Measured runtime cost

Deduplicated startup JavaScript includes ancestor layouts. Compared with the
previous built production source, compressed calendar-list/detail code grows by
660/659 bytes, event detail by 929 bytes and Settings by 736 bytes. Including its
notification lazy chunk, Settings grows by 1,158 bytes. Associated CSS grows by
38 bytes. No dependency was added.

A local fictional sample records one preference SELECT for a default-Off wake,
without creating a job. Current-source resolution uses twelve SELECTs for both
one and ten reminders, plus transaction boundaries. Processing ten due reminders
through the existing per-event canonical writer records 229 statements, including
217 SELECTs and ten Activity inserts, in about 75 ms locally. The bounded batch
preserves each writer's current authorization and notification checks. These are
local measurements, not production latency or a performance improvement claim.
Dispatch selects at most 100 plans with concurrency eight; missing-plan recovery
handles at most twenty per invocation. The worker processes at most ten due
responses and the read resolver accepts at most fifty sources for one owner.

Full regression and exact deployment/live acceptance remain open. No task
completion, production migration or live reminder delivery is claimed.
