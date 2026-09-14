# Reasons for church discussion moderation

September 14, 2026 UTC · 2026.09.14.13 · verified production release

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

Seven new service/transport groups pass, covering missing/invalid reasons, exact
and changed retries, author compatibility, scope and revoked authority, bounded
history and blocked actor labels, current-account HTTP behavior, and confirmation
of a previously committed no-reason request across the release. A new unreasoned
change is denied; no historical reason is fabricated. All eleven existing
post/editor regressions also pass (18 focused groups total). Types and scoped lint pass. The final production build and local runtime
trace inspection pass: 146 traces, 3,278 entries and 370 server JavaScript files,
with no fixture, environment file or Prisma configuration tooling included.

Twenty-four built-browser groups pass: seven discussion moderation, nine author
content-note/editor and eight retained-reader privacy groups, with no page errors.
They cover required reasons at 320/390/1280 pixels, exact lost-response recovery,
author reopening without a new reason, account replacement, revoked authority,
current history and actor concealment after a block. Narrow-screen form and
history captures were inspected. The browser fixture is separate from the full
regression database. A premature preview attempt was cleaned up before testing;
a media regression correctly rejected the wrong working directory and passed
from its fixture-owning checkout with the isolation guard unchanged.

Measured against the preceding production build, unique discussion-route
JavaScript including shared layouts grows by 1,810 raw / 535 gzip bytes (level 6
per file). Home and profile raw sizes are unchanged; their compressed output
varies by minus two bytes. A local query diagnostic observes 15 statements for a
personal public post, 17 for an unaudited church post and 19 with one or twelve
stored decisions. The history query is absent for the personal post; each church
case performs one history query and returns at most ten decisions (2,615 JSON
bytes in this fixture). These diagnostics are not hosting latency/capacity claims.

The encrypted production recovery rehearsal completed at 16:54:02 UTC. All 49
migration checksums match, all original columns in 92 tables are preserved,
protected replay completes and the plaintext restore is removed. Production was
not modified.

The complete gate on runtime b8820e0 passes all 127 discovered files: 783
executions, 781 passes, two expected development-only delivery skips in the
production phase, zero failures or cancellations. It covers synthetic upgrades,
fresh migrations, restore, service/HTTP behavior, development and production
HTML/RSC over verified local HTTPS, process restart and production builds. The
additional legacy receipt regression passes separately on 93b75bf; final browser
acceptance uses 989bb2c. Changes after the runtime checkpoint are tests and
reports.

Application 3912a5081653ff0172f37c17790c885f2e33b8a4 is READY in deployment
dpl_7nwnLrSNkABY52KiR6eLWUnvfMu7, with independent godschurches.com assignment
and matching serving version/build. The provider build completes at 17:22:03 UTC,
reports no pending migrations, and passes its runtime trace check: 146 traces,
15,160 entries and 370 server JavaScript files without forbidden tooling or
private fixture/environment files.

Fourteen public live groups and four secured aggregate health groups pass with
zero browser page errors or test application mutations. Current signed-in owner
post controls retain their original open discussion and eligible-viewer choices,
without a new required moderator reason. No real settings, moderator grants or
content were changed. New moderator actions and their reason history were tested
in isolated built-browser fixtures; real church moderation acceptance is not
claimed. Deployment-scoped error/fatal log reads both succeed with zero rows.
The installed recovery registry and retention source match the current 49
migrations. Live health has no alerts; eligible account-manager grants,
suspensions and account-access decisions remain zero.

Repository code, release guidance and current state are reconciled. Matching
private task and specification updates have succeeded and exact fresh readbacks
preserve the prior scope and completed receipts. Broader task closure remains
gated by its actual operational and dependent prerequisites. Broader real operator/provider/device prerequisites and final review
remain open.
