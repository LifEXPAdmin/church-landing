# Calendars, sharing and events

September 10, 2026 · Calendar interface published and verified

## Calendar interface

The local `codex/calendar-interface` working tree adds My calendars, church
calendar layers, monthly agendas, an explicit viewer time zone, event pages,
occurrence/series editing, cancellation, separate publication and sharing,
RSVP and My commitments. Public church events are readable without an account;
account entry preserves known calendar/event destinations. Church menus, public
pages, responsibilities and management tools link to the calendar.

The real JSON boundary checks the configured origin, current session/eligibility,
body size, durable rate limits and current permissions. Private calendar pages
use the production renderer; development diagnostics never load private events.
Busy-only projections apply in JSON and server-rendered content. Agenda queries
restrict the audience before loading/counting event rows so hidden private
appointments cannot fill a shared viewer's event limit.

Forms retain entries after validation, network or service failures. A stale
version requires an explicit refresh/review before another save. Lost account
or resource access refreshes private content. Creation retries return the same
calendar/event and occurrence link. Canceling a final active occurrence closes
its series so calendar archiving remains available.

All 214 applicable regression checks passed (216 total, zero failures, two
expected disabled-delivery skips), including eleven calendar service groups and
four actual HTTP groups in each of development and production. These cover
public/member/busy/private HTML, RSC and JSON, current permissions, stable RSVP
references, origin/body/rate limits, creation retries, stale versions and bounded
Unicode notes. The harness now creates UTF-8 databases explicitly. Synthetic
upgrade, full row/schema restore, fresh migrations and restart passed.

Final lint, production compilation/types and runtime verification passed (85
traces, 6,163 entries and 204 server JavaScript files). All four final production
HTTPS calendar groups passed again with certificate verification after the final
interface polish.

Actual fictional browser journeys passed in two independent sessions: private
appointment creation, explicit busy/detail sharing, separate revocation, public
church event creation, weekly local time across DST, all-day dates in another
zone, RSVP persistence, occurrence-only editing/cancellation and owner-only
conflict hints. An editor revoked with a form still open could not save; the
database contained no attempted event. Invalid input, an injected service failure
and competing RSVP saves preserved recoverable input. Stale saves require loading
and reviewing the latest version, retaining the unsaved selection.

Guest event reading and Join/Back preserved the destination; the guest agenda
included only the deliberately public event. The 320/390/1440-pixel layouts fit
without horizontal overflow, including date/time fields. Native browser
screenshots established the mobile agenda appearance, with light/dark views;
keyboard submission and month/Back state retention passed. Final rebuilt guest
and unavailable-page links have 20-pixel separation. Both browser error logs
were empty. These are browser
viewport checks, not physical-device acceptance.

Application `f0fe0e92a68161d38e67593b62dccd37c3167f63` is live on READY
`dpl_DoMvFu23uHdhaw8RAcg1YJrE3KSD`. Exact canonical serving identity and all
113 live HTTP checks passed at 2026-09-10T09:18:23Z with zero production writes.
Live public post/church lists are empty; populated event reading was verified
with isolated fictional fixtures. Live phone Menu, calendar guest gate,
signup destination and Back navigation passed at 390 pixels with no horizontal
overflow or browser errors. Deployment error logs returned no entries.

The original checkout was fast-forwarded, dependencies installed from the lock
file and Prisma client regenerated. Fictional preview/database processes are
stopped. Later event discussions, volunteer shifts, outbox delivery and physical
pilot acceptance remain open. The foundation checkpoint below is historical and
superseded by these interface results.

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

## Historical foundation verification checkpoint

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
