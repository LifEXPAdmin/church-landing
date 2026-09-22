# Calendar Settings folder

September 22, 2026. Local implementation and acceptance are complete; production release is
pending. The starting verified application is `ede1335ba73a79ed631303c502602e0d951dd97a`.

The folder groups personal display, reminders and alerts, calendars and
subscriptions, and schedule sharing. Registry entries reuse existing date/time
formats, notification preferences, calendar views and commitments. Busy-only
availability and full event details have separate navigation rows preceded by
an audience explanation. Each canonical calendar or event retains its actual
audience, confirmation, version, retry and current-access controls.

No schema, persistence, permission, provider or dependency change. Current URL
views are not saved defaults. Missing timed reminders, subscription and external
connection services have explanations without inactive controls. The existing
selected profile event is distinguished from full personal schedule sharing.
Settings adds no calendar query or mutation. Existing identity rechecks, search,
return navigation, loading, error and retry behavior remain in the workspace.

Required acceptance: affected Settings and calendar service/HTTP checks, built
browser navigation and audience verification, accessibility and narrow layout,
TypeScript, lint, copy and production build, then exact serving identity,
canonical assignment, live checks, migration state and production write review.

## Local verification

All 40 affected service and Settings checks and five actual calendar HTTP checks
pass. The four focused built-browser groups pass: audience-first grouping,
truthful availability, 320/390/1280 widths with doubled text, keyboard entry and
Back focus, every canonical destination, actual busy/detail sharing and
revocation, search, signed-out entry and account isolation. Browser errors and
external requests are zero. No production data was used in these fixtures.

TypeScript, scoped lint, copy and the clean production build pass. Build review
verified 231 traces, 76,843 entries and 573 server JavaScript files without private
fixture/environment leakage. The hydration repair remains 173,096 bytes with
SHA-256 `2b7c5f99a8710e52520e7d0dc25c9fb65fd7c06e0a1d6cfee97276e0a452a3b7`.
Five changed runtime sources match the built candidate. Canonical calendar,
regional, notification, recovery, schema and dependency owners are unchanged.
The prior 199-file volunteer gate remains a dated baseline; it is not claimed
as a new full run. The previous application reads the same saved representation,
so this presentation-only release requires no data rollback.

Initial harness failures are preserved: two calendar-navigation tests rejected a
missing isolation environment before data access; the corrected isolated run
passed. Browser assertions initially assumed a generic scope badge and the first
Sign in link, instead of checking the actual personal explanation and bounded
calendar account-entry link. Those assertions were corrected without application
changes. The broader Settings suite first lacked the local certificate for its
intercepted request, then lacked a known fictional serving identity for its
update-notice test. The preview configuration was corrected. All six broader Settings groups now
pass, including lost-response exact retries, conflict review, unsaved-work and
update protection, loading/retry recovery, church-duty refresh, account switch,
keyboard search, enlarged text and guest entry. All ten built-browser groups
pass; no application change was required for these harness corrections.
