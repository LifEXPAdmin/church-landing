# Interchurch help Activity classification and grouping

## Behavior

Canonical private ministry-help updates now appear under Church Needs in
Activity. Updates for the same offer form one group; another offer remains a
separate group. They also appear in All and no longer fall through to Reports.
Counts represent the existing events, without creating or rewriting history.

The repair adds the missing `INTERCHURCH_HELP` branches to the category and
grouping SQL in `lib/platform/activity.ts`. Its group key matches the canonical
notification source's `interchurch-help:<offerId>` contract. A missing source ID
falls back to the individual event ID. No migration or dependency change is
required.

The existing source authorization, generic summary, exact destination, Needs
preference, owner checks and read-boundary behavior remain authoritative.
Unavailable sources retain minimal owned history without a summary or link.
Explicit group read changes only that offer's events through the captured
boundary. Manual unread retains earlier read and delivery evidence and does not
create another outbound notification.

## Reproduction and service verification

Before the repair, a real PostgreSQL test created two accepted offers through
the canonical commands. Their four notification events produced zero Needs
groups instead of two. The expected assertion failure was retained privately.

After the repair, all four new service/request-boundary cases passed:

- Needs and All grouping, separate offers, exact counts and generic destinations,
  Reports exclusion, and independent group reads.
- Captured group-read boundaries, a later arrival with a backdated timestamp,
  exact retry, changed-account rejection, and manual unread preserving history.
- Lost pair authority producing one unavailable group without private details.
- Needs mute and unmute suppressing and restoring presentation without deleting
  source history.

The eight existing Activity tests and four existing notification-center tests
also passed. These include pagination through concurrent arrivals, read-all
boundaries, current source loss, account ownership, preference suppression,
exact replay after a newer read choice, and independent message read status.
The new request-boundary test calls the handler in process; it is distinct from
actual HTTPS and browser acceptance.

The focused runner consumes an explicitly owned, already migrated fictional
fixture and never manages another worker's database or application lifetime:

```sh
node scripts/test-interchurch-help-activity.mjs <owned-fixture-directory>
node scripts/test-interchurch-help-activity.mjs <owned-fixture-directory> --regression
```

`--baseline` selects only the original category/grouping reproduction. Applied
to the repaired source, that case is expected to pass.

## Application acceptance

Production build `fzxhp0Ul6yNBxLG1jknB2` passed with Node 24.20.0, including copy,
types, hydration repair, runtime traces and public-build security checks. The
build controller caught a browser-driver-only edit during the build. All other
1,560 recorded inputs were unchanged; the application was reused only after
verifying that exact difference. The original input receipt and final driver
hash were retained. No application source changed after compilation.

The three existing Activity HTTPS checks passed against that exact build. All
five browser scenarios passed with no page errors or attempted external
requests:

- Two separate Needs groups with exact counts at 320 and 1440 pixels.
- At both widths, the selected offer opens, Back retains the Needs filter, and
  explicit read/unread changes only the selected group. Opening alone does not
  mark a group read.
- A committed response is dropped; a byte-identical retry preserves an update
  arriving after the captured boundary and the other offer's unread events.
- A stale source becomes a minimal unavailable group without a private link or
  contact detail.
- Account replacement settles on the new owner's empty Needs view without old
  links or counts.

Both viewport screenshots were inspected. Focused ESLint and whitespace checks
passed. Final independent source/evidence review found no material issue. All
owned application, TLS and database processes were stopped and their ports
verified closed. This fictional local acceptance does not establish integration,
deployment, provider delivery or physical-device acceptance.

## Integration

Apply the focused change to the matching canonical interchurch-help branch.
Keep the repaired classification and grouping together. The change uses existing
notification events and read controls; no event backfill is needed. Any inherited
policy proposal still requires its own explicit acceptance. The release owner
must verify the combined batch, hosted security checks and canonical live
behavior before closing release acceptance.
