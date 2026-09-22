# Calendar settings ownership and readiness

September 22 saved-layer update: `CalendarLayerPreference` now owns private
follow, visibility and color choices per person and source. Calendar Settings
links to those canonical controls without storing another copy. Explicit URL
layers remain temporary, direct source inspection retains current access, and
hiding or unfollowing never changes membership, sharing, RSVP or commitments.
The [saved-layer report](CALENDAR_LAYER_PREFERENCES_REPORT.md) records focused
acceptance, the passing complete gate and verified production release. This supersedes the
absence of a follow or saved-layer owner in the September 18 inventory below;
default display, timed reminders, protected feeds and external sync retain their
separate requirements.

September 22 update: the grouped Calendar Settings folder now binds existing
display, notification, calendar and sharing screens. It stores no preferences
and adds no audience or delivery authority. The profile editor now supports one
selected existing event with current source permission checks; this supersedes
the earlier absence of any profile event binding below. It is not a public
personal schedule. Saved calendar defaults, timed reminders, subscriptions and
external connections remain separate missing capabilities. See the
[folder implementation report](CALENDAR_SETTINGS_LAYOUT_REPORT.md) for current
verification and release status.

September 18, 2026. Audited against the integrated application `25eb4a1`.
This contract maps existing owners and missing capabilities. It adds no controls,
stored preference, permission, service, query or migration. The existing
[calendar acceptance report](CALENDAR_REPORT.md) remains the dated foundation.

## Existing owners and supported scope

| Setting or action | Canonical owner and current behavior | Binding and readiness |
| --- | --- | --- |
| Date and time format | `PlatformUser.dateFormat`, `timeFormat` and `regionalVersion`; `regional-preferences.ts`, `regional-format.ts` and `regional-presentation.tsx`. Account-owned, versioned choices already affect calendar dates and times. | Reuse the existing Language and location control. Do not add another calendar copy of the same preference. Formatting changes neither stored event instants nor audiences. |
| Viewing time zone and month | `CalendarToolbar` in `calendar-presentation.tsx`, `calendar-view.ts` and the calendar page query. The current view carries explicit `month` and `timeZone`; absent zone resolves to UTC. Use device time zone copies the current device zone into the form. | These are URL view choices, not a saved fixed-zone preference or persistent device-following mode. Do not label them saved or automatically following the device. |
| Event and calendar source zone | `PlatformCalendar.timeZone`, `CalendarEvent` and occurrence records; `calendar-commands.ts` and `calendar-time.ts`. Weekly recurrence preserves local wall time and all-day dates stay stable. | Editing a source zone is a calendar/event operation under its existing authority, separate from the viewer's presentation. |
| Default view, first day of week and saved layer choices | No canonical persisted calendar-display preference exists. The current monthly agenda and selected church layers use the current URL. | A versioned display preference owner, supported values, reset/conflict behavior and actual calendar consumption are required before adding saved controls. Existing regional date/time preferences are not evidence of week-start or saved zone support. |
| Church calendar layers | Current permitted calendars and source labels come from `calendar-reads.ts`; `CalendarToolbar` uses GET view choices. | Hiding a layer does not invoke a command, leave a church, revoke a share, cancel an event or withdraw an RSVP. A future saved layer preference must retain this boundary and refresh current access. |
| Whole-calendar availability or details | `CalendarShare` through `share-calendar` and `revoke-calendar-share`. Only an eligible personal owner with a current approved church connection may deliberately confirm BUSY or DETAILS sharing. | Reuse the canonical calendar screen. Whole-calendar sharing covers current and future events; the audience summary must say so. BUSY and DETAILS are separate disclosure choices, not independent global defaults. |
| One event-series availability or details | `CalendarEventShare` through `share-event` and `revoke-event-share`. Owner confirmation and current church access are required. | Reuse the event screen. A series share affects that series, and revoking it does not revoke a separate whole-calendar share. Either active DETAILS source can still permit details. |
| Event title, location, organizer and online link | `eventAccess` and `projectOccurrence` in `calendar-access.ts`. A BUSY projection returns only timing/source and the generic title Busy; private detail fields are absent from the DTO. | Do not add a cosmetic hide-location toggle over a service that still returns the location. A separate location audience requires its own approved canonical disclosure capability. |
| Public or church event publication | `CalendarEvent.visibility` and `set-visibility`; current `PUBLISH_CHURCH_EVENTS` is distinct from `EDIT_CHURCH_CALENDAR`. Personal event publication outside PRIVATE is rejected; explicit shares are separate. | Personal display/profile defaults never grant church authority or broaden an existing event. Source editing and publishing stay in church administration with the selected church visible. Current privileged-authentication checks still apply. |
| Profile calendar visibility | No active profile-calendar module or supported personal public-schedule audience exists. | Keep the registration absent until the profile/calendar visibility owner and source-permission intersection are implemented. Showing a module must not publish or copy private events, shares, locations or group membership. |
| RSVP and commitments | `CalendarResponse`, `calendar-reads.ts`, `calendar-commands.ts`; existing `PostVolunteerSignup` remains the volunteer owner. Reads project the actor's own response, with private conflict hints. | Existing links are supported. No saved personal RSVP-disclosure default exists. Calendar sharing does not substitute for it. See [community preference boundaries](COMMUNITY_SETTINGS_CONTRACT.md). |
| Event alerts and default reminders | Existing notification preferences own event-category Activity/phone choices and current devices. A default timed calendar reminder capability is not implemented. | Link supported notification choices without promising timed reminders or automatic delivery. Do not change notification consent through a calendar view or RSVP. |
| Following, protected subscription and external sync | No canonical calendar-follow record, private subscription-token lifecycle or external calendar connection is implemented. | Keep connection/subscription controls absent until authorization, revocation, sync direction and current status have an owning service. Assistant access to an external calendar is not product OAuth sync. Never put secret subscription URLs in public navigation or reports. |

## Permission and family boundaries

`calendarContext` reads current eligible membership and effective assigned duties.
Shared projections check the personal owner's current eligibility and approved
connection as well as the viewer's current church access. Leaving and rejoining
does not restore ended sharing or commitments. Direct identifiers, stale pages,
view parameters, formatting preferences and profile choices cannot supply those
permissions. Independent calendar/event shares retain their explicit lifecycles.

The current participation capability requires adult eligibility. A future family
or child schedule variant remains absent until its separate policy and protected
disclosure service exist. Adult Settings work does not enable a child variant or
wait for the family launch.

## Verification and remaining work

The existing service checks in `tests/calendars.test.ts` cover busy redaction,
independent shares, edit versus publish authority, membership loss, personal
ownership, current RSVP access, stable occurrence references and private conflict
hints. `tests/calendar-http.test.ts` covers the corresponding HTML, Flight and
JSON boundaries, exact retries and current permissions. Both belong to the latest
accepted broad regression; this documentation audit does not claim a new run.

The capability inventory is complete. Folder layout, persisted display controls,
reminders/subscriptions, profile-calendar disclosure and external connections
remain distinct implementation and acceptance work. Register only functioning
capabilities, retain the canonical screens and their loading/denied/retry/conflict
behavior, and verify each new binding in the isolated browser before release.
The private task record names current ownership reservations and dependencies;
those transient workspace details do not belong in this public contract.
