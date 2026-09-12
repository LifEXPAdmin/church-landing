# Safety settings and private list verification

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
