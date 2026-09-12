# Private reporting implementation receipt

## Contextual UI candidate — 12 September 2026

The report page, owner receipt/history views, More links on posts/comments/
profiles/churches, Menu and Safety links are implemented locally. Forms reuse
the checked social transport and unsaved-work guard. Source labels are fetched
only when opened; no body or media snapshot is copied. Exact pending bodies,
conflicts, Retry-After, account replacement and explicit discard are handled.
Patch notes and Explore describe reporting as conditional, with new intake off
until reviewer operations are ready.

Seven enabled browser groups passed on the final local production build: contextual
targets/optional details/actual receipts, lost responses and account switching,
source-version and church revocation, Back/links/discard, comment and church
claim routing, actual quota expiry, and guest/privacy/layout checks. Widths
320/390/1440 passed; screenshots were inspected and there were no browser page
errors. The report form chunk and report requests were absent before opening
Report, including while More was open. A test timing race was corrected to wait
for the real lost-response completion before checking persistence.

The complete release gate passed all 86 discovered test files: 545 executions,
543 passes, zero failures and two development-only delivery skips in the
production phase. Its preview was intentionally interrupted after completion.
Types, production build and runtime trace verification pass; lint has zero
errors and 37 existing QA warnings. Final built-browser verification passes
18 groups: seven enabled reporting, two disabled reporting, four existing compact
action and five comment-reader groups. The compact-action test now checks both
Report and Follow in keyboard order. No new runtime dependency was added.

The fresh encrypted production backup has restored successfully and rehearsed
32→33 migrations, preserving all 75 original-table column fingerprints; new
report/decision/reviewer-grant counts are zero. Production has not been migrated
or deployed for this candidate.
The current serving release remains the audit-repair version below. Browser
checks are automated Chrome, not new physical-phone evidence.

## Foundation checkpoint — 12 September 2026

Local implementation on `codex/continuous-medium-social` adds four canonical
report targets, source-version checks, owner-only receipts/export, scoped review
decisions/audits and per-account activity limits. It reuses the social receipt
and permission gates. See [the contract](COMMUNITY_REPORTING_CONTRACT.md).

Fresh isolated checks: 34 service/regression tests passed, including the private
draft reply-audience suite, social relationship/comment protections and shared
read/exclusive-write behavior. Seven HTTPS checks passed with fixture report
intake enabled (four reporting and three Like/identity regressions). Ten HTTPS
checks passed with intake disabled (four reporting and six account-export
checks). Types and production build passed; lint has no errors and the same 37
existing fixture/QA warnings. Initial test diagnostics were corrected and the
affected checks rerun; no failing result is counted as acceptance.

Migration `20260912211625_community_report_foundation` adds two report/audit
tables, report enums and one explicit operator capability. It has been applied
only to an isolated database; the resulting schema matches the Prisma schema.
The production database remains at 32 migrations. No production reviewer grant,
report write or intake activation was performed. No new client dependency or
per-card request was added by this service checkpoint. No performance gain is
claimed for the new reporting functionality.

This is a verified local foundation, not full moderation completion or a live
report UI. The current live application remains `2026.09.12.23`, application
commit `4a11762`, with its separate audit-repair release receipt. Report intake
and private receipt UI are the next integration slice. The next application
release still requires the complete regression and backup/migration/release
gates. Real intake requires reviewer operations and retention/erasure policy;
broader moderator console, source enforcement, appeals and message-specific
participant evidence remain unfinished. Physical-device observations from prior
releases are unchanged.
