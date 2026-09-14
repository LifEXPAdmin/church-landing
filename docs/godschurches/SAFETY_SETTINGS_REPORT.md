# Safety settings and private list verification

## Current Safety and private-history acceptance — September 14, 2026

The existing deployed Safety overview now explains contextual reporting and
links to the canonical private report history. This completes the earlier
missing contextual-entry and reporter-history criteria. The stale Safety
browser assertion was corrected to follow the real history link and verify
that an ordinary member receives no reviewer entry. No runtime or schema
change was necessary.

Fresh verification: five Safety browser groups, eight contextual-report browser
groups and ten reporting service tests passed, with zero browser errors. These
cover owner-only lists and receipts, private-note/export redaction, pagination,
inactive-account labels, failed unblock and exact retry, account concealment,
source conflicts/revocation, no report prefetch, real context links, lost response
and quota recovery. One initial quota check used mismatched isolated fixture
secrets; aligning the server and script fixture configuration made the complete
suite pass. Production secrets and configuration were unchanged. Scoped lint
and the diff whitespace check passed.

Product `2026.09.14.3`, application
`ebf45fc445ec36a50fc03a855551c6f6a8d04383`, remains on READY deployment
`dpl_6KpUY2PKNK5XT7TQuBVQF5zwoa8Z`. The current canonical serving identity,
guest private-API denial/no-store behavior and authenticated Chrome navigation
from Safety to the actual private-history empty state were rechecked. Production
application writes: **0**. All report/block mutations used isolated fictional
actors. This is current verification of existing live behavior, not a new release.

Global comment/content filtering, family restrictions and personal keyword
filtering still lack the separately accepted capabilities. Physical phone and
parent operational acceptance remain unclaimed. Earlier evidence below is history;
the historical missing-reporting gate is superseded.

September 12, 2026. See [Safety scope](SAFETY_SETTINGS_CONTRACT.md).

Safety explains the distinct effects of blocking, mute/snooze and mention/reply
choices and links to existing management and Help. The canonical blocked/muted
library adds bounded name/username search over the current owner's records before
20-row pagination, preserving explicit query and cursor through navigation and
sign-in. Unavailable accounts have neutral labels; hidden names are not searchable.
An explicit unblock confirmation explains that connections are not restored.
Existing commands, versions, access checks and exact-body retries are unchanged.

## Verification

Four focused search service groups pass: owner isolation, pagination without
duplicates, username search, literal wildcard handling, mute/snooze conjunction,
neutral inactive targets, input rejection and muted-church search. Ten existing
social foundation groups pass, including bilateral direct-read/action/count
policy, private drafts and versioned retries. Twenty-two Settings/navigation/
release tests pass; the release-content checks were repeated after final notes.

Five built Safety browser groups pass: real Settings/Help links and empty guidance,
23 matching accounts across two pages, query/cursor preservation, unavailable
labels, cancel/confirm, failed unblock and identical retry, conflict rejection,
failed list concealment/recovery, account replacement, private guest denial,
sign-in return and 320/390/1440px doubled text/keyboard access. Four existing
relationship privacy/library groups also pass after updating the old test's
Settings destination to the current detail route and its explicit unblock step.

The immediate simulated account replacement after privacy conflict resolution
can require the displayed **Retry settings** action. The regression verifies old
values are concealed before retry and the replacement account's actual defaults
are then loaded. It does not claim that particular refresh is automatic. This
reuses the established error-recovery path; it never displays a permissive value
as a fallback for a failed private read.

No browser errors. Types, scoped lint and production build pass. Runtime tracing
verifies 121 traces, 10,292 entries and 300 server JavaScript files, excluding
private fixtures/environment files. All mutations are isolated fictional fixtures.

## Release status and remaining scope

Product `2026.09.12.16`, application `a5eac27559abc655658d07f8f0d598038d99c09c`,
is live on READY deployment `dpl_96vxCDgVJLwiEyZtm1587X1WzKH6`. Independent
canonical assignment and serving identity match. Thirteen live checks at
14:48:22 UTC passed with zero application writes or browser errors. The 14:29
preflight verified all 30 migration checksums and the protected
backup/restore with zero application writes or migrations. No provider, schema
or production account/permission change is part of this milestone.

Reporting directly from post/reply context and personal moderation-report history
remain gated by the absent moderation intake/history authority. Generic support
is not labeled as a report, and no moderation evidence is exposed. Keep those
criteria, parent integration and physical owner acceptance open. Supported
blocked-list review and unblocking can be verified independently of that gate.
