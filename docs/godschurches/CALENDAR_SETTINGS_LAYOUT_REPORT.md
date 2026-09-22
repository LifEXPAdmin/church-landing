# Calendar Settings folder

September 22, 2026. Implementation, release and scoped live acceptance are complete. The starting verified application is `ede1335ba73a79ed631303c502602e0d951dd97a`.

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

## Production acceptance

Main `aae3a4e988a020ac40d58f68c3f7996756e1edc7` is READY in deployment
`dpl_6wPwy8rq65y9eK2Ptm2Umxpo31E4`. Independent canonical-domain lookup
and the serving endpoint both match `godschurches.com`, product `2026.09.22.3`,
verified from 05:40 to 05:42 UTC. The hosted build confirms no pending migration,
231 runtime traces, 76,750 entries and 572 server JavaScript files.

All 11 live anonymous route/API/browser checks and six protected health checks
pass. Browser errors and blocked mutation attempts are zero. Successful exact
deployment error and fatal queries from 05:40:41.768 to 05:42:03.907 UTC return
zero rows. All 147 production table/column fingerprints remain unchanged. All
105 migration checksums match repository, production and installed recovery
registry; no migration or data rollback is required. Existing protected backup
and installed restore evidence remains dated in the volunteer release receipt.

Verification application writes, grants and provider sends are zero. There is
no claim of physical-device testing or authenticated production-member editing.
The selected folder task is complete; the parent retains saved defaults, timed
reminders, subscriptions, profile-calendar and external-connection gates.
Private task and knowledge records were reconciled with actual results.
