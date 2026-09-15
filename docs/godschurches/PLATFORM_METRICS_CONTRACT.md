# Platform growth and optional measurement

September 15, 2026 UTC. The core is released as **2026.09.15.7**, application
**944d382d12742deec0aa36071dc30ffc444399d8**, READY and canonical in
**dpl_4ppv8oT9ZRKMBA4xeDiicHhQ1TcF**. See
[the final core acceptance](PLATFORM_METRICS_ACCEPTANCE.md) for exact live,
regression, recovery and cost evidence. Earlier candidate entries below preserve
implementation history. Feedback-owned integration and actual privileged
production report acceptance remain open. No production metric grant is inferred.

## Source owners and definitions

The current requirement is platform totals and minimal first-party measurement.
The existing waitlist analytics remain historical. Post reading-time, publisher
Insights, session replay, private prayer habits, faith scores, attendance and
contact scraping are not introduced. Legacy observability remains content-free;
purpose-limited attendance remains a distinct future requirement, not an RSVP.

`metric-policy.ts` owns the metric dictionary and allowlisted categories.
`metric-time.ts` uses the existing Temporal dependency and calendar validation:
America/Chicago is the initial reporting zone, custom periods are at most ninety
calendar days, inclusive dates resolve to exclusive real timezone boundaries,
and current partial periods compare with an explicitly labeled complete preceding
calendar period. Counts are never scaled to invent a full current period. Exact
D7/D30 observations mature only after the entire target calendar day ends.

Operational account creation and present state come from PlatformUser. New email
and Google creation paths set an immutable original-method field. Existing rows
remain Unknown; linking Google never rewrites the method or adds a registration.
Erased and explicitly excluded test/automation accounts are outside the current
population. Suspended takes precedence over deactivated, so each account occupies
one state. This population includes accounts still completing verification; use
measurement separately requires verified, policy-eligible adults.

A versioned baseline and per-day state-transition buckets contain no account,
case, content or event identifiers. Each edge leaves one state and enters another.
Requesting deletion first deactivates an account; subsequent erasure leaves the
deactivated state and does not subtract from enabled again. Exclusion/reinclusion
are explicit edges. Old state transitions are not reconstructed from current
state. Anonymous operational count buckets persist separately from personal raw
measurement. Current-source counts can restate after exclusion or deletion;
recorded creation-time totals must be labeled separately.

The report derives successful ordinary action categories from canonical
current source records, aggregate them on the server, and return no target IDs or
bodies. Retired/withdrawn/ineligible sources cannot remain a reported action.
Automatic acknowledgments do not count as a substantive support response; source
case types and waiting-inclusive duration definitions stay separate. Ratings and
shown-exposure results use the shared 30/31 contract, and remain unavailable until
the feedback owner supplies actual eligible source records.

## Optional measurement and coverage

`PLATFORM_MEASUREMENT_ENABLED=true` makes the explicit choice available; it does
not opt anybody in. `PLATFORM_METRICS_ZONE` defaults to America/Chicago and must
match the recorded configuration. A mismatch pauses collection/reporting for a
reviewed new version and baseline. Existing daily buckets cannot be relabeled by
changing an environment variable. No zone-changing UI is introduced.

PlatformMeasurementChoice stores the current versioned choice and coverage state.
Default: off. Declared referral and coarse device/browser sharing are separately
optional within enabled measurement. There is no full user-agent, page URL,
referrer, precise location, post ID or content field. Active platform/support
operators and explicitly excluded accounts do not produce optional use signals.

The intended browser signal is a trusted foreground interaction at selected
ordinary navigation surfaces. Private prayer, reading, writing/upload, account
recovery and admin operations are excluded. It is a limited coverage signal, not
proof of attention or a count of all visitors. An idle lookup on these surfaces reads the current choice without delaying rendering.
Only trusted foreground navigation interactions can write; no background timer writes
activity. The separate settings page supports current-state reload, retained unsaved
choices and exact unconfirmed retries. No choice is inferred from using the site.

One daily fact is keyed by account, collection version and reporting-calendar day.
The service requires a current consent version and the previously read server
foreground cursor. Same-cursor concurrent tabs and exact retries cannot advance
an observation again. There is no client event timestamp or acting-account field.
Accepted signals are at least sixty seconds apart. A use session begins after
thirty minutes without an accepted foreground signal. Only the last three session
starts, all within ninety days, are needed by subsequent optional-prompt eligibility.
This is not an authentication-session identifier or fingerprint.

Only a first opt-in on the signup calendar day, after the configured collection
start, can enter a measured signup cohort. Later changes to optional dimensions
preserve that uninterrupted cohort. Withdrawal and re-enabling begin new coverage
and never manufacture a fully measured signup cohort. Historical onboarding starts
are unknown; completion/skips require an observed start in current consent.

## Privacy, expiry and restoration

Withdrawal removes all optional daily facts, session starts, onboarding times and
referral/device choices. Changing device sharing off also clears existing coarse
categories. The database repeats these protections on trusted direct withdrawal,
account deactivation, suspension, erasure or test-account exclusion. The current
consent preference can remain as an off state, without old use facts.

Account export includes only the owner's current choice and retained optional
facts; expired session/onboarding facts are filtered even before cleanup runs.
Account erasure removes the optional choice and daily records. Quarantined backup
restoration clears every optional fact and disables restored choices with a new
version before traffic may resume. It cannot resurrect consent withdrawn after
the archive was made. Anonymous operational buckets are distinct recovery data. After complete protected
replay, restoration creates a new version and current-state baseline. An archive
cannot reconstruct every lifecycle event since its snapshot; replay-time state
changes are never presented as complete historical changes.

The existing retention worker performs bounded batches of 1,000 expired daily
rows and 1,000 accounts' session/onboarding facts. Raw use facts last at most
ninety days. Expiring a stale foreground cursor increments the choice version so
an old initial-cursor request cannot revive its expired observation. Optional
cleanup failure is reported but does not stop essential account/message erasure.
Reports must independently ignore expired rows. Current consent preferences are
not an indefinite log of previous usage or choices.

## Reporting and export boundaries

Growth is a new section in the existing private admin area, gated by the existing
VIEW_PLATFORM_METRICS capability. EXPORT_PLATFORM_METRICS remains separate and
must recheck current authority for every aggregate export. Metric access grants
no private case/profile drilldown. The existing requester/moderation queues keep
their own narrower permissions.

Every card/table carries definition, source, interval, zone/version, collection
start and refresh/coverage state. Missing, partial, suppressed and immature are
distinct from zero. Weekly/monthly actors are server distinct counts across the
whole interval. Small detail categories suppress the complete complementary
breakdown so another visible category cannot reveal a hidden count by subtraction.
Restricted overall startup counts can still show their actual small totals.

Use existing CSV cell escaping, shared filtered/suppressed report data and an audit
receipt. Export contains no raw account IDs, private source text or individual
religious behavior. Release annotations identify actual versions and do not imply
causation. Tables must match the charts and remain usable with keyboard and narrow
screens. The required interface belongs to this feature cycle.

## Current isolated evidence

Six additive candidate migrations bring the isolated fixture from 63 to 69.
Schema/client generation and types pass. Six mathematical tests cover DST,
partial/bounded dates, exact-day maturity, lifecycle balancing, rating/exposure
arithmetic and complementary suppression. Five actual PostgreSQL/service/HTTP
tests cover 6-email/4-Google counts after four links, excluded fixtures, 9-existing/
8-enabled/1-deactivated lifecycle counts, concurrent foreground cursors, consent
replays/withdrawal/restart, dimensional withdrawal, rejected private fields/guests/
cross-site/mismatched identities, paused/staff/suspended accounts, ninety-day expiry
and clearing restored optional choices. These eleven passes are foundations,
not full feature acceptance or evidence of production collection.

The candidate now has aggregate source queries and the frozen A2 cohort, Growth
cards/chart/tables and overview integration, measurement settings, narrow
foreground and observed-onboarding attachment, privacy disclosure, and separately
permitted CSV exports. A downloadable CSV always has its own hash-bearing audit
receipt; retries cannot replay a stale private snapshot or produce an unaudited
current file. The same complete complementary suppression applies to report and
export, including action categories, creation methods and optional dimensions.

A retained prior-day fixture exposed a timezone conversion defect. UTC source
columns now receive explicit UTC text bindings instead of a driver timestamp
cast through the database session zone. The aggregate cohort is also checked
under Los Angeles and Tokyo database session timezones. Five expanded isolated
tests pass: actual 10/8/6/4/2 cohort queries and 80/60/40/20 percent outcomes;
current successful-state timestamps; separate export capability/revocation/hash
receipt; owner-only export/onboarding/withdrawal and native savepoint recovery;
unique cases and substantive authorized human response. Three staged maintenance
and actual protected database restoration checks pass, including removal of
restored optional choices and the new lifecycle baseline. These are local results;
full feature acceptance is still pending. Failed setup, fixture and UTC-boundary
attempts remain in private evidence rather than being counted as passes.

An additional actual-source regression checks two existing church activations:
management rises without new directory listings, reapproval does not invent a
first activation, and unavailable topic owners cannot inflate active/new spaces.
Six report tests now pass. The encrypted production-copy upgrade from 63 to 69
preserves all original columns in 107 tables and completes protected replay.
The production source remained read-only. The historical gate now compares new
default fields separately, verifies no invented methods/consent/source timestamps,
and requires exactly one empty baseline in a fresh schema.

Eight final production-preview browser behavior groups pass, followed by runtime
and service-cost checks with no browser errors: 320-pixel/keyboard mature reports;
actual filtered CSV and matching audit hash; date presets and empty, partial,
suppressed, immature and failed report states; reconnect and revocation; default-off
choices and retained edits; trusted navigation and cross-device conflicts; exact
interrupted withdrawal retry; and identity/access concealment. Date presets reset
the form, the maximum date uses the reporting zone, and narrow table values retain
whole words inside their keyboard-scrollable region. All 27 additional public,
private-denial, release-guide, privacy and renderer preview probes pass.

Seven warm local samples have median/max timings of 12.647/13.771 ms for Growth,
3.592/5.590 ms for overview and 1.700/1.730 ms for saved choice. Respective response
sizes are 10,088, 558 and 297 bytes; command ranges are 15–16, 13–14 and 11–13.
These small fictional source fixtures do not establish production capacity.

The staged full gate covers all 155 discovered test files. The original successful
upgrade, restoration, fresh-schema, build/restart and service stages are retained;
the remaining 88 files pass after correcting the schema-only recovery fixture's
missing configuration baseline. The actual production trigger correctly fails
closed without that baseline. Final-source production rebuild passes. This is
staged verification, not a claim that failed attempts were clean passes. A further
focused test covers all six real source categories and their canonical withdrawal,
current church access, hidden reply ancestors, and prayer/repost exclusion. Its
initial fixture connection and missing event-version attempts are retained.
Final types and focused lint pass.

The subsequent configuration, exact canonical release/live checks and installed
recovery verification passed; see the final core acceptance linked above. Feedback-owned
intake/exposure/ratings integrate in feature 31, then shared acceptance. Real
operator, provider, host and physical-device prerequisites remain in their
existing tasks. No production metric grant is inferred or created by QA.

## Successful source times

Current follow, RSVP, volunteer and church-connection records now carry the
start of their current successful state. Changing an unrelated field or replaying
the same state does not move the timestamp. Withdrawing clears it; a later real
transition begins a new timestamp. Existing rows remain Unknown. Original post
publication, comment creation, people-follow creation and event-creation audit
records retain their source ownership. No source ID or body is added to optional
measurement storage. Private-source eligibility, current parent visibility, topic
recovery, calendar shares and actual appointment contributions are rechecked in
aggregate queries.

A day crossing the raw retention boundary exposes only its still-retained last
observation until cleanup trims its expired first observation. Completed/skipped
onboarding timestamps are expired independently, even after their earlier start
has expired. The worker remains bounded, and reports/exports filter expiry before
worker cleanup. Onboarding start means displayed getting-started hints under
current choice; finish/save-for-later is deliberate, and requires no profile,
photo or church membership. Its optional write uses a savepoint inside the native
idempotent command so failure cannot undo the member's actual choice.

Assigning current platform or support operational access clears prior optional
member measurements and ends that signup coverage. Ending the duty never opts
the person back in. A dedicated database withdrawal normalization clears the
complete off-state shape before constraints, including device/referral choices
and the foreground cursor. An expired cursor cannot be returned or replayed as
a new observation while maintenance is pending.
