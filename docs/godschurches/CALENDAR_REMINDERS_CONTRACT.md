# Personal timed calendar reminders

22 September 2026 UTC. Implementation contract for the remaining calendar
preference work. This is not a release or delivery receipt.

Reuse notification preferences, Activity, the existing generic phone outbox,
protected consent journal and deployed notification-work consumer. Calendar
Settings links to these canonical choices; it must not store another reminder
preference or enable a phone channel by saving a display setting.

The initial supported choice is Off, 15 minutes before, or 60 minutes before
timed events with the person's own Going or Maybe response. Off is the default.
The opt-in applies to existing and new future responses whose reminder time is
after the choice and response were saved. There is no catch-up for a reminder
time already passed when opting in, responding or moving an event. All-day events,
volunteer-only commitments and following a calendar do not acquire reminders.
These limits must appear beside the choice. All-day reminder clock rules and
volunteer-specific notices belong to their own supported capability.

Each notification needs current eligible account, current response, uncanceled
timed occurrence and current event-detail access. Busy-only access is insufficient.
The occurrence modification time must precede the reminder time, independently
of sibling edits and erased editor audit history. The exact source version and
calculated reminder time must still match at
Activity/read/delivery. Turning reminders off or changing the lead time invalidates
incompatible pending reminders. Phone delivery also needs the existing dated
Commitments phone opt-in and a current device. Quiet hours remain independent;
never submit a late phone reminder after the event starts. Outbox expiry and
provider retention are bounded by that start instant; quiet hours that extend
beyond it cancel the delivery. No new email channel,
external calendar subscription, provider or recipient is enabled.

Use an opaque, versioned wake-up record per opted-in account. The record carries
no event title, location or contact details. Bounded processing uses current
canonical responses in time/ID order, advances past denied sources, and records
Activity through its existing idempotent writer. An event is not duplicated by
queue retries, overlapping workers, an uncertain publish or a later unrelated
notification save. Preference/RSVP/event changes wake the current plan. Existing
nightly maintenance recovers unpublished or expired work and brings distant
events into the queue's supported delay window. Queue payloads contain only an
opaque identifier, kind and version. Scheduling is best effort and never promises
a physical device received a notification.

Use the current notification consent version and protected journal. A stale
restored choice stays off pending deliberate review. Erasure removes private
preference and wake-up metadata. Restored records cannot bypass current account,
source, consent or response checks. Export includes the person's saved reminder
choice, without another person's private event details.

Acceptance includes exact retry and conflicting saves, new sessions, dated
consent, existing versus newly changed responses, UTC/DST source instants,
all-day exclusion, dense batches, early/late/repeated queue deliveries, source
edits/cancellation/revocation, inactive accounts, quiet hours, channel opt-outs,
recoverable dispatch failure, protected restore/erasure, no real sends in
fictional tests, a deployed no-user-data queue probe, and an explicit physical
delivery limitation. Keep this work open until the implementation and release
gates have actual receipts.

The current [queue SDK reference](https://vercel.com/docs/queues/sdk) permits a
seven-day retention and delay window. Reuse the repository's shorter dispatch
horizon with retry room; do not infer limits from older bundled skill text.
