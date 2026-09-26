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
36 existing unrelated warnings and has no errors. All five new built-browser groups pass with zero browser errors, external
requests, provider sends or production writes. Existing calendar and regional
browser regression is in progress. Its account-switch expectation now checks deliberate concealment
before reloading the new account. A test-side missing local recovery-journal
configuration was corrected; it did not change the application consent boundary.

The encrypted production restore rehearsal has passed a local 106-to-110
migration upgrade, preserving all 148 original table fingerprints over their
original columns and replaying protected controls. Production was read only.
The final trigger clock and full clean fixture are being verified before the
complete regression, compatible rollback, runtime measurement and release gates.
No task completion, production migration or live reminder delivery is claimed.
