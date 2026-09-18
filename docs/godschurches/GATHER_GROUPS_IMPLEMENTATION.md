# Gather groups implementation checkpoint

18 September 2026. Local acceptance is in progress. No Gather migration or runtime
is deployed; the live application remains the verified pantry release.

The adult group contract is saved in `GATHER_GROUPS_CONTRACT.md`. Groups reuse
canonical posts, comments, private drafts, polls, reports, appeals and event links.
Current adult membership, church authority, named invitation and leadership
consent govern access. Roster visibility starts private. Group drafts have an
immutable destination. Archiving stops participation while retaining permitted
history. Pins, selected answers, reply locks and scoped moderation share existing
records. Signed read acknowledgements cover visible positions only, preserve
unseen reply-page gaps and do not change following. Account closure, export,
erasure, generic notifications and protected access restoration are integrated.

The isolated database applies all 99 migrations. Twenty-two focused group service
and HTTP tests pass. Eighteen draft-controller tests pass after repairing separate
group-draft creation, including preservation of dirty, uncertain, concealed and
saved work. Current-access rejection on exact retries, bans, revoked church
authority, invitation blocking, older protected restore, report scope, private
ballots, moderation and event permission intersections are covered.

Nineteen production-mode browser scenarios pass: guest entry, group creation,
public About privacy, membership request/approval, roster consent, private
questions and polls, canonical selected answers, pins, actual visible read
progress, independent event access, outsider denial, retained-page revocation,
named invitations, leadership acceptance/revocation, owner transfer and archived
history/reopening. An unconfirmed answer save survives a sibling poll refresh
until its exact retry is confirmed. Separate browser acceptance verifies actual
password sign-in return and a saved public draft remaining intact when a new
private group draft starts. Pantry and Needs browser regressions pass.

Four additional browser checks cover explicit church group authority, topic
links, church filters preserved through searches, separate church and group
membership, and revoked church management at 320 pixels with enlarged text.
Five moderation browser checks use an accepted group leader without platform
operator powers. They exercise a single decision after a lost response, private
author notices, a consented appeal with exact retry, scoped reviewer replies,
role revocation and concealed retained pages after an account switch. Archived
management keeps its history and content-report navigation reachable.

A real server/client form-constant import fault was repaired. Repeated lost-reply
acceptance reproduced stale membership after a successful save. Removing the
additional Groups loading boundary passes twelve repeated exact-retry cycles;
the speculative shared navigation-timing change was reverted. Pending requests
stay mounted through sibling refreshes. Test label, certificate, fixture field
and premature automated navigation failures remain separately recorded. Final
repeat acceptance includes ordinary Back behavior and the latest archived-state
explanation, release copy and draft changes.

The staged full regression uses service baseline `90bd80d`. Synthetic upgrade,
fresh migrations, full restore, development/production builds, server restart and
explicit HTTP suites passed. Historical fingerprint comparisons were corrected
to compare original columns; migration 99 separately checks every original column
of all 140 tables and asserts no inferred group, consent or destination data.
Old activity and notification category expectations were repaired for Groups;
the historical pre-Needs form omits all later categories. The Gather report
fixture explicitly enables its local intake flag and restores it afterward.
Remaining discovered
tests are continuing on the unchanged baseline build. A final delta gate covers
the client draft/controller changes separately. Full acceptance is not yet claimed.

Encrypted production-copy upgrade and protected recovery passed 98 to 99
migrations with all 140 original table/column fingerprints unchanged. Production
was not modified. Installed production recovery still covers the live 98
migrations and must be updated after an accepted release.

Bounded reads preserve identical projections on isolated fixtures: twenty group
cards use 6 SELECTs instead of 102 for guests and 17 instead of 113 for members.
Twenty discussion rows use 25 instead of 44. Median local times are approximately
43.4 to 3.45 ms, 47.2 to 8.0 ms and 38.8 to 29.4 ms. These are isolated
measurements, not production latency claims. Commands keep fresh authorization;
reused authority lookups exist only within one bounded read transaction.

The candidate includes release notes and feature instructions. Exact final build,
remaining regression, canonical deployment, live privacy/runtime verification,
installed recovery and private task reconciliation remain open. Real ministry
pilots, physical phones and youth/family readiness are separate evidence.
