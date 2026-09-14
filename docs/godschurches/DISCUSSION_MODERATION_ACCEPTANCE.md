# Reasons for church discussion moderation

September 14, 2026 UTC · candidate 2026.09.14.13 · not yet released

The current community moderation specification requires a reason for moderator
discussion closure. An isolated baseline on the preceding runtime confirmed that
an authorized church moderator could close another author's discussion with no
reason. One existing post action/version audit was created, but no reason-bearing
audit existed. Production writes and external sends were zero.

The candidate preserves the existing permission path and requires a structured
reason when the actor relies on church moderation authority rather than author
or publisher authority. Invalid/missing reasons fail before any setting, audit
or receipt changes. Original author controls remain compatible. The same
transaction records the existing post audit and a scoped ChurchAuditEvent with
actor, post, church, fixed reason, prior/new settings, version and date. Exact
requests reuse their original receipt; current authority still precedes replay.

The existing authorized post-management snapshot returns the latest ten matching
discussion decisions. Scope and source access are checked before querying the
audit. Actor names use current community visibility; blocked or unavailable
members receive a generic label. Raw actor IDs, unrelated cases and unrestricted
reason strings are not returned. Dates are explicitly UTC to remain identical
between server and client rendering. The current private snapshot guard conceals
the settings and history together on access changes.

Reasons are fixed choices, with no additional free-text personal information or
source copies. Records reuse the existing scoped operational/security audit
store and its backup/export boundaries. No schema, dependency or worker is added.
Release notes and existing feature guidance are updated within this cycle.

Six new service/transport groups pass, covering missing/invalid reasons, exact
and changed retries, author compatibility, scope and revoked authority, bounded
history and blocked actor labels, and current-account HTTP behavior. All eleven existing
post/editor regressions also pass (17 focused groups total). Types and scoped lint pass. Full regression,
built-browser, recovery, exact release and live/private reconciliation remain
pending. Broader real operator/provider/device prerequisites and final review
remain open.
