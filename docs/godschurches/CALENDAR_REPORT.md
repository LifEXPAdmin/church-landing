# Calendars, sharing and events

September 10, 2026 · Foundation verified locally; interface and publication pending

## Foundation scope

Personal calendars have one account owner and start private. Church calendars
have a church owner and use current approved membership and explicit grants.
`EDIT_CHURCH_CALENDAR` permits draft/calendar editing. `PUBLISH_CHURCH_EVENTS`
separately permits publication to church members or the public. Editing an
already published event requires both powers; publication alone does not permit
rewriting its contents. Organizational titles confer neither permission.

An owner may deliberately share a personal calendar or selected event series
with an approved church as busy-only or full details. Each sharing choice has
its own version/revocation. Ending a whole-calendar share leaves independent
event shares intact, and ending an event share leaves a separately granted
calendar share intact. Responses are explicitly projected; busy-only entries
contain timing and an opaque event reference, without titles, notes, locations,
online links, organizers or authentication contacts. Shared source names use
only the owner's current opt-in same-church directory name, with a neutral
fallback for an unlisted member.

One-off events and weekly series use stored IANA zones and local date/time
fields alongside occurrence instants. All-day events preserve date strings and
an exclusive end date. Weekly occurrences retain local wall time through DST.
Skipped or repeated local times are rejected with the affected date and zone;
they are not silently shifted. The implementation uses
[`@js-temporal/polyfill`](https://github.com/js-temporal/temporal-polyfill)
0.5.1 and Temporal's explicit
[time-zone disambiguation](https://tc39.es/proposal-temporal/docs/timezone.html).

Occurrences retain stable IDs through edits. Individual edits and cancellations
affect one occurrence; a series change explicitly confirms the scope and any
replacement of individual edits. Previously canceled occurrences remain
canceled. This first version keeps an existing series' occurrence count stable;
changing its length requires canceling/creating a separate series. Series are
bounded to 52 weekly occurrences, event spans to 31 days and agenda windows to
93 days. Personal/church owners have up to twenty active calendars, with 500
active series per calendar. A range exceeding 1,000 occurrences requires a
shorter range or fewer selected layers, rather than silent truncation.

RSVPs reference an occurrence once per account and survive time changes and
separate sessions. Canceled events reject new responses. My commitments shows
current accessible responses and an owner-only overlap hint against their own
private appointments and confirmed visible commitments. Busy-only shared
commitments remain Busy. Conflicts do not name private appointments. A person
can withdraw their own response after access changes.

Connection removal ends dependent shares and church-related commitments;
rejoining restores neither. Deactivation ends personal sharing and active
responses while retaining private calendar records. A private account download
includes owned calendars, events/occurrences, sharing choices and the user's
response records, excluding other attendees and church operational records.

## Verification checkpoint

All 203 applicable full regression checks passed (205 total, zero failures,
two expected disabled-delivery skips). Eight focused calendar groups covered
private/busy/detail sharing, separate edit and publication powers, both DST
transitions, all-day viewer dates, recurrence edits/cancellation, retries and
competing saves, current-session revocation, removal/rejoin, conflicts and owned
export. A final additional lifecycle group passed: deactivation ends sharing and
responses, and reactivation preserves private appointments without reviving
those permissions or commitments. It also verifies that a shared source label
uses only an explicitly chosen directory name.

The complete harness passed synthetic upgrade, full row/schema backup and
restore, fresh Prisma migrations, restart, production compilation/types/runtime
and all existing actual development/production HTTPS account, church and support
regressions. Final TypeScript and lint checks passed. This foundation has no new
HTTP route or UI yet; calendar-specific API/browser acceptance remains next.
It is committed locally and is not published as a usable calendar feature.

The new dependency adds only Temporal 0.5.1 and JSBI 4.3.2. Fresh npm audit reports
the same three existing high tooling-package entries (`prisma`, `@prisma/config`
and `deepmerge-ts`), with no new package advisory and zero critical entries.
The existing runtime configuration-loader exclusion remains in the build checks.

The additive migration includes exclusive account/church ownership, foreign
keys, unique event requests/occurrence ordinals/responses, bounds and positive
versions. All seven new tables are included in the full row/schema backup and
restore fingerprints. Mutations and private reads use the existing shared
transaction gate and current-session eligibility. Audit records preserve IDs,
actions and versions without copying appointment content.

No real calendar record, Google Calendar synchronization, invitation, reminder
or external notification has been created. Event/shift integration and durable
notification delivery remain in their later assignments. A browser simulation
will not establish physical-device or real-provider acceptance.
