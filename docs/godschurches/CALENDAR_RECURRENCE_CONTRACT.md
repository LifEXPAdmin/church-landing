# Calendar recurrence contract

October 7, 2026. This is the engineering contract for the missing monthly
extension. It changes no running calendar behavior. The monthly choices below
are new decisions for implementation, not previously shipped capabilities or a
claim that an owner selected each pattern. Controls, persistence, response
consequences and runtime acceptance remain separate implementation work.

## Preserve the installed calendar

The [calendar report](CALENDAR_REPORT.md),
[time helpers](../../lib/platform/calendar-time.ts),
[calendar commands](../../lib/platform/calendar-commands.ts) and
[calendar tests](../../tests/calendars.test.ts) establish the baseline:

- One-off and weekly events keep an IANA zone, local endpoints and persisted
  occurrence instants. Weekly wall time stays fixed through daylight saving.
  Ambiguous or nonexistent local endpoints reject the entire expansion.
- All-day events keep date strings and an exclusive end date. Another viewer's
  zone does not change which dates contain the all-day event.
- Existing weekly rules use an inclusive last-start date, at most 357 days from
  the first start and 52 occurrences. Local event spans remain at most 31 days;
  agenda requests remain at most 93 days. Existing calendar and result limits
  still apply. A limit error must not silently truncate a result.
- Occurrence IDs survive edits and retain response references. Individual
  changes are exceptions. Series edits require confirmation; replacing active
  exceptions requires an additional explicit choice. Canceled rows stay
  canceled. Existing series edits keep their occurrence count.
- Current source permissions govern reads and writes. Private conflicts remain
  private, busy-only access reveals no event details, and an owner can withdraw
  their response after losing access.

Do not rewrite this weekly implementation or silently reinterpret old records
as a monthly rule. Later integration must also preserve the prepared event
capacity handoff's current-authority checks, material-change reconfirmation,
explicit waiting consent and withdrawal behavior. That newer source is not in
this checkout; its recorded acceptance is a dependency to reconcile, not fresh
source verification here.

## Monthly rule and bounded expansion

The first extension repeats **every month**, with exactly one of these explicit
selectors. Interval values other than 1, multiple weekdays, last-weekday rules,
yearly rules, arbitrary RRULE input and open-ended repetition are outside this
contract. The interface should say “Every month”, without an inactive interval
picker or an implied promise of advanced patterns.

| Selector | Meaning | Missing candidate |
| --- | --- | --- |
| Numbered date, 1 to 31 | The same numbered day in each candidate month | Skip a month that lacks that date. |
| Last day | The actual final date of each month | Every candidate month has a result. |
| Nth weekday, first to fifth | One ISO weekday, Monday to Sunday, at the chosen ordinal | Skip a month without that fifth weekday. |

A seed on the 28th, 29th, 30th or 31st never implies Last day. The first entered
start date must be valid and match the selected pattern. Reject a mismatch with
the field and correction described; do not move it to a convenient date.
Selecting a pattern is deliberate, including the choice to skip missing dates.
An explicitly entered February 29 in a non-leap year is invalid input, even
though an absent generated February 29 may be skipped.

The canonical rule needs a version, monthly kind, selector and its bounded
parameters, the original anchor month/date and a required inclusive `until`
date. Local start/end templates, all-day state and the IANA zone remain owned by
the existing calendar service. The persistence work must choose one canonical
representation and a legacy-weekly adapter, not competing client/server rules.
Reject mixed weekly/monthly fields, unknown selectors and unsupported intervals
instead of falling back to one-off or weekly behavior.

The new monthly rule reuses the existing 357-day last-start horizon rather than
expanding the scheduling budget:

1. Require `firstStartDate <= until <= firstStartDate + 357 calendar days`.
   The comparison uses local dates, not elapsed hours. No count-only or “never”
   end condition is accepted.
2. Inspect at most 13 candidate calendar months, starting with the anchor month.
   Compute each month independently from the anchor year/month and its offset.
   Resolve its selector before comparing the candidate start date to `until`.
   Missing dates produce no occurrence, ordinal, cancellation or response row.
3. Emit at most 12 monthly occurrences within this horizon. Retain the shared
   52-occurrence ceiling and existing database ordinal bounds as additional
   guards. Validate the input and bounds before writes; exceeding any bound
   fails the whole operation rather than stopping early and reporting success.
4. Require at least the matching first occurrence. A short finite range may
   yield only that occurrence; the preview must say so. Canceled occurrences
   do not free slots or extend the rule.
5. Keep every generated monthly local endpoint in 2000 through 2099. A span
   crossing that range is rejected. The existing `2100-01-01` query-window
   sentinel is not an event date or an expansion permission. Validate endpoints
   only for emitted candidates: a terminal candidate after `until` is not an
   occurrence and cannot invalidate an otherwise valid finite schedule.

For each valid candidate, carry the original start clock and the original
end-date offset plus end clock. For example, a start at 23:30 with an end the
next day at 01:00 remains that overnight wall-time interval in another month.
Do not independently clamp the end's day of month. All-day spans carry their
positive count of local dates with the same exclusive end. Preserve the
31-local-day limit, and require the resulting end instant to follow its start.
An event may end after `until`, which limits starts rather than duration.

Resolve both endpoints in the saved IANA zone with strict rejection of gaps
and overlaps. One invalid later candidate rejects the whole create/edit, with
its date, zone and failing endpoint identified. Do not skip a DST-invalid
meeting, choose an offset, silently shorten the series or shift its clock.
UTC durations may change across DST while intended local endpoints remain fixed.
Month generation must never use repeated constrained date additions:
[Temporal date addition](https://tc39.es/proposal-temporal/docs/plaindate.html#dateaddduration-temporalduration--object--string-options-object--temporalplaindate)
can clamp January 31 to February 28 and cause later dates to drift.

The missing-date rule resembles [RFC 5545 recurrence generation](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.3.10),
but the retained DST rejection differs from its generated-time omission rule.
This bounded product contract is not a claim of full RRULE or iCalendar support.

## Identity, edits and existing commitments

Persist occurrence IDs once during the existing idempotent creation transaction.
Reads must not regenerate rows or infer an ID from the current display date.
For monthly records, retain the original anchor month slot and selected local
date independently of any later occurrence exception. A skipped month is not
an instance. Emitted ordinals can order rows, but ordinal equality alone cannot
prove that two patterns describe the same meetings.

| Change | Required outcome |
| --- | --- |
| Title, description or other permitted detail edit | Keep existing IDs, current authorization and expected-version checks. |
| One occurrence's time or date | Keep that occurrence ID and mark its exception; clear all recurrence inputs for this operation. |
| Monthly series clock, end-span or zone edit | Keep the frozen original start-date slots and IDs; preview all affected active dates and obtain existing series/exception confirmation. Validate every endpoint before writing. |
| Monthly selector, anchor, frequency, interval, finite range or all-day/timed mode change | Require a separate new series, even if the emitted count happens to match. Do not relabel ordinals or move responses to new slots. |
| Replace active individual exceptions | Require the existing explicit replacement choice; canceled instances remain canceled and unchanged. |
| Cancel an occurrence or series | Preserve IDs and history, reject new commitments, and use current cancellation owners. No automatic replacement meeting. |

The monthly restrictions do not retroactively change the existing confirmed
weekly edit behavior. A one-occurrence edit may move its displayed date without
changing its original identity, consistent with the distinction made by
[RFC 5545 recurrence identifiers](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.8.4.4).
Later implementation must compare monthly rule identity before the current
count-and-ordinal update loop; equal row counts are insufficient.

A new series starts with new occurrence IDs and no inherited RSVP, reserved
party, waiting position, promotion offer, consent, attendance or delivery
receipt. Creating it does not cancel or republish the old series automatically.
Use existing explicit creation/cancellation/publication actions and their exact
retry receipts. A failed creation leaves the old series intact; retry must not
create duplicate new series. Do not copy private sharing or grants implicitly.

For a genuine edit, retaining a response's historical identity does not establish
renewed consent to changed attendance terms. Reconcile the prepared capacity
owner's material-change and reconfirmation rules before runtime integration.
Keep explicit waiting consent, party size, capacity, current eligibility and
withdrawal ownership authoritative. A date change must not create an attendance
record or promote a waiting party by itself.

All affected cards must read the current occurrence. Reuse existing notification
source/version keys and current audience checks so exact retries do not produce
duplicate eligible notices. Suppress withdrawn, canceled or inaccessible
sources as their owners require. A new occurrence has a new delivery identity;
old sent notices or scheduled reminders are not copied. This contract adds no
outbound provider, reminder schedule or automatic invitation.

## Worked acceptance examples

The following UTC values use the installed 2026c time-zone data. Future legal
zone changes may change those values; saved local intent remains authoritative.
Existing helper results were checked independently with Python `zoneinfo` and
Node `Intl`. Monthly rows are expected arithmetic for future implementation,
not evidence that the current application accepts monthly rules.

| Case | Input and expected result |
| --- | --- |
| Weekly spring service | America/Chicago, Sunday 09:00 on March 7, 14 and 21, 2027. UTC starts are 15:00Z, 14:00Z and 14:00Z; local starts remain 09:00. |
| Weekly autumn service | Same zone/time on October 31, November 7 and 14, 2027. UTC starts are 14:00Z, 15:00Z and 15:00Z. |
| Missing local time | March 14, 2027 at 02:30 in Chicago has no instant. Reject even when it is a later generated occurrence. No partial series is stored. |
| Repeated local time | November 7, 2027 at 01:30 in Chicago could be 06:30Z or 07:30Z. Reject ambiguity rather than selecting one. |
| All-day abroad | Save `[2027-11-07, 2027-11-08)` in Chicago. Persisted instants span November 7 05:00Z to November 8 06:00Z, or 25 hours. Show November 7 only in Chicago and Tokyo. |
| Numbered 31st | January 31, 2027 through December 31. Emit January, March, May, July, August, October and December 31. Skip February, April, June, September and November. Never turn March into the 28th. |
| Explicit last day | Same range. Emit January 31, February 28, March 31, April 30, May 31, June 30, July 31, August 31, September 30, October 31, November 30 and December 31. |
| Fifth Monday | Start March 29, 2027; end November 30. Emit March 29, May 31, August 30 and November 29. A missing fifth Monday is not the fourth or last Monday. |
| Leap date | Numbered 29, January through March 2027: January 29 and March 29. The same months in 2028 also include February 29. Explicit Last day gives February 28 in 2027 and February 29 in 2028. These are separate bounded monthly schedules, not a yearly rule. |
| Overnight month end | Chicago Last day, January 31 23:30 to February 1 01:00, 2027. January instants are February 1 05:30Z to 07:00Z. The February candidate ends March 1 01:00; its end does not drift to March 3. |
| Exclusive midnight | January 31 23:30 to February 1 00:00 appears on January 31 only in Chicago; a timed event's Tokyo date may differ. |
| All-day month crossing | Numbered 30, seed `[2027-01-30, 2027-02-02)`, until March 31. The first span occupies January 30, January 31 and February 1 in either viewer zone. Skip February; the next span is `[2027-03-30, 2027-04-02)`. Both retain three dates. |
| Monthly year boundary | Last day, seed `[2099-11-30, 2099-12-01)`, until December 31. Reject the whole monthly schedule because its included December span would end January 1, 2100. With until November 30, the single November span remains valid. |
| Same count, different rule | A four-row fifth-Monday series cannot become another four-row pattern by reusing its ordinals. Require new series IDs and no transferred responses. |
| Moved and canceled instances | An individually rescheduled occurrence retains its original slot/ID and responses. A canceled sibling stays canceled through later confirmed series edits; neither creates another slot. |

## Implementation acceptance and verification boundary

The dependent implementation must demonstrate:

- Parser and actual transaction rejection of mixed rules, invalid seeds, missing
  ends, unsupported intervals, exact-boundary and over-boundary requests,
  generated endpoints beyond 2099 and late DST failures. Failed operations
  leave no partial rows, responses or notification sources.
- Deterministic, bounded expansion of the examples, no date drift, no duplicate
  IDs after exact retries, no expansion on read, unchanged weekly fixtures and
  the existing private/busy/detail projections and 93-day query bounds.
- Stable IDs and current version checks for genuine edits; explicit exception
  replacement; preserved cancellation; a new series for changed monthly rule
  identity even at equal counts; no implicit commitment or consent transfer.
- Real controls with a plain-language pattern, zone, inclusive end, emitted
  count and skipped-month preview. Distinguish “this occurrence” from “series”.
  Invalid input retains edits and names a corrective field; stale saves require
  reviewing current authority and versions.
- Actual response/capacity, lifecycle, notification, migration/restore, HTTPS and
  browser acceptance against the integrated owners. Existing outbox evidence
  does not prove a new recurrence source or real delivery.

The source work must include the weekly-only schedule/parser and editor DTOs,
occurrence-only command normalization, series matching, schema constraints,
`recurring` projections, calendar form and event summary. Existing response,
reminder, attached-post, group and volunteer consumers must continue using the
same persisted occurrence IDs. Reconcile their current owners before editing.

For this documentation change, the actual existing helper examples, independent
date arithmetic and source/contract review are the verification: 12 existing
expansion probes (seven successful schedules and five expected rejections), 14
existing month-view calls, 25 monthly `Intl` comparisons, 22 existing-endpoint
`Intl` round trips and enumeration
of 74,250 matching monthly seeds across 2000 through 2099. The latter verifies
the 357-day, 13-candidate and 12-emission arithmetic, not a new runtime engine.
No monthly runtime, database migration, complete calendar regression, browser
test, native device or live-release acceptance is claimed. Do not deploy merely
to publish this contract.
