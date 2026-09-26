# Saved calendar display implementation checkpoint

Current combined release is verified live in **2026.09.26.1**. See the
[complete release receipt](CALENDAR_REMINDERS_REPORT.md). The display-only
checkpoint below preserves its original 22 September evidence.

Calendar display extends the existing account regional preference owner and
version. It adds Sunday or Monday week start, Agenda or Month default view,
and fixed or device-following viewing zone. Date and time formats keep their
existing values. The same regional writer serves Calendar Settings and Language
and location; a legacy format-only save preserves all calendar display fields.
An identical pending command is retried exactly, competing saves conflict, and
account changes conceal the former account's controls. Export includes these
choices; permanent erasure resets them.

Saved defaults apply to My calendars, direct calendars, church calendars and
event commitments. Explicit URL choices temporarily override defaults. A device
view checks the browser's current zone each time that view opens, including a
copied device-following URL. It resolves the zone before exposing time-based
controls and never writes the detected zone back to account preferences. A fixed
view requires no device-zone navigation. Direct event links retain their existing
explicit-viewer or source-zone behavior. This is not continuous device tracking.

The month grid uses the current authorized agenda projection. Timed events are
placed on overlapping viewer dates with an exclusive end; all-day dates never
shift. Its first column reflects the saved week start. At most three entries per
day render, with a link to the remaining entries in the full agenda. The grid is
keyboard-scrollable within its own region on narrow screens. Busy projections
retain generic titles and omit private details. Colors have text labels.

These choices grant no membership or source permission, change no event instant,
and do not alter following, hidden calendars, sharing, RSVP or notification
consent. Hidden calendars already have the canonical saved-layer owner. Existing
event-change alerts remain owned by notification preferences. Timed reminders
now use the existing notification owner under the [reminder contract](CALENDAR_REMINDERS_CONTRACT.md).
The combined display and personal reminder integration has passed release gates;
external feeds and physical-device acceptance remain separately scoped.

## Observed local evidence

- Thirty focused checks pass: four new calendar display checks, five layer
  checks, eleven calendar checks, seven regional formatting checks and three
  regional preference checks.
- New-session persistence, exact retries, competing sessions, legacy saves,
  all-day and DST placement, owner export and erasure pass. Source records and
  existing notification/layer choices remain unchanged by display saves.
- TypeScript, affected lint, website copy and clean production build pass.
  The build examines 231 runtime traces, 76,845 entries and 574 server JavaScript
  files, without private fixture/environment data in runtime bundles.
- Six new built-browser groups and fifteen existing Settings/layer/regional
  groups pass, with zero browser errors and external requests. New checks cover
  copied device URLs, fixed overrides, owner switches, dirty navigation,
  current Busy redaction and revocation, dense-day agenda access and mobile
  layouts at doubled text. Seven built calendar/profile HTTP checks pass.
- The first browser attempt exposed overly broad implicit select labels, which
  were made explicit. A stale no-saved-defaults assertion was updated for the
  new behavior. Test fixture delivery and share-confirmation inputs were
  corrected without changing application checks or permission rules.
- Full lint finishes with zero errors and 36 existing unrelated unused-variable
  warnings. No dependency was added. Sampled session reads retain two queries;
  Settings samples retain the prior 10-to-12-query range. Calendar page startup
  chunks grow from 163,247 to 163,874 gzip bytes. Direct event startup grows by
  897 gzip bytes; Settings startup is 92 gzip bytes smaller. These are build and
  local query measurements, not a performance improvement claim. Device mode
  needs another route resolution only when the browser and rendered zones differ.

Migration 107 adds four defaulted account columns and bounded database checks.
The original display-only fixture passed at 107 migrations. A separate fresh
combined reminder fixture now contains 110 migrations, including default-Off
consent, an opaque wake-up row, the extended Activity source constraint and an
occurrence modification timestamp.
Production and installed recovery now match all 110 migration checksums. The
combined receipt records full regression, recovery, rollback and live acceptance.
