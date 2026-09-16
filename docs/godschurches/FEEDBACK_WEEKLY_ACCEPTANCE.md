# Weekly feedback review and shared reports

September 16, 2026 UTC. This is an **unreleased feature-31 checkpoint**, following
[selected follow-up](FEEDBACK_FOLLOWUP_ACCEPTANCE.md). The full feature gate,
protected upgrade, deployment and exact canonical live checks remain ahead.
Actual operator, notice, provider and physical-device prerequisites still apply.

## Complete-feature verification checkpoint

The exact `be2b46a` production preview passes all 35 browser groups across
private feedback, prompts, reviewed ideas, chosen follow-up, weekly review and
Growth, with no browser errors. Its final runtime trace check passes 187 traces,
43,205 entries and 476 server JavaScript files; the repaired renderer is unchanged.
The first browser attempt stopped before application checks because the isolated
database restarted on its default port. The corrected fixture port is now checked
before preview startup; the original failure log is retained.

A protected production-copy rehearsal upgrades 69 to 84 migrations, preserves
all 111 original-table fingerprints and completes protected-control replay.
The first complete gate passed 492 checks with two expected disabled-delivery
skips before an Activity category assertion failed. Its expected list omitted
the new Feedback category. The related notification-preference assertion had
the same omission. Both expectations now include the category; 28 focused
Activity/comment/notification checks pass. No runtime guard was changed. Preserve
the failed gate and rerun the entire fresh-fixture gate before publication.

The second fresh-fixture gate passed the corrected Activity integration and
completed the upgrade, restore, both builds, actual HTTPS restart and 100 fully
passing distinct files (697 checks plus two expected skips). The next ideas
suite passed ten scenarios but exposed one fixture dependency: public-idea
reporting relied on an inherited reporting-enable flag. Its fixture now sets
the reporting configuration explicitly. The corrected scenario also proves
disabled intake creates no report, then accepts the same request once enabled;
it passes with inherited feedback/reporting/measurement flags removed. No
application source changed. Retain the successful stages and run the corrected
suite plus the 62 remaining discovered files against a rebuilt production
server on the same isolated database. This is staged coverage, not an
uninterrupted final gate; publication remains pending.

## Implemented behavior

Growth and its separately permitted CSV read persisted feedback metadata. Means
and distributions exclude rating-free submissions. Cases and distinct people
remain separate. Prompt coverage follows the displayed-exposure cohort, includes
later retained responses through refresh, and excludes unseen reservations,
expired evidence and withdrawn or restricted use. Lost attribution is explicitly
Unattributed. Ordinary optional-choice edits preserve consented older exposures.
Current and preceding intervals share reporting-calendar and suppression rules.

Restricted overall startup totals remain visible. Small detailed rating/source
categories suppress complementary cells using distinct people, not messages.
Reports label no-data, limited-response and partial retention coverage. No case
identifier, private content or operator note enters the CSV. A direct staff
resolution now counts as the first substantive response. Returning accounts are
measured users created before the interval with retained use within it; this is
distinct from exact-day D7/D30 cohorts.

The weekly view uses completed Monday-to-Sunday weeks, including DST, and checks
native case authority before counts and source links. Manual tags and duplicate
groups are transparent, overlapping themes. Group summaries do not expose a
shared group's potentially private title or an unauthorized member's subject.
Counts distinguish original submissions, retained replies, cases and people.
Bounded lists show problems, repeated suggestions, currently unresolved high/urgent
bugs and cases reopened after resolution. Actual release entries supply context.

Weekly notes are private to their author and require current product-review
permission. Three learning fields and one canonical work link use existing form,
conflict and exact-retry controls. They create no task or message. Audit/recovery
records retain references, versions and fingerprints, never note text. A newer
protected edit clears stale restored text; matching current versions remain intact.
Account erasure removes the author's notes. Staff notes remain outside the
ordinary account export's stated operational-data scope.

Migration 84 adds the review table, feedback timestamp index and protected-control
scope. Both isolated databases apply it successfully.

## Verified evidence

- `feedback-weekly-combined.log`: 29/29 service and math scenarios pass, including
  native admin regression. `feedback-weekly-second.log` separately covers current
  source access, concurrent saves, exact retries, protection failure/replay,
  erasure, role loss, DST and safe canonical links.
- `feedback-metrics-second.log`: 16/16 pass. Persisted A2 has six receipts, five
  ratings, mean 3.6 and two responses to ten exposures (20%). It covers date
  cohorts, export projection, complementary suppression, withdrawal, redaction,
  role loss, database timezone independence and resolution-only response timing.
- `feedback-weekly-final-math.log`: 14/14 pass after final reference-math and
  release-note edits, including the distinct returning-account definition.
- `feedback-weekly-browser-second.log`: four Chrome groups pass at 320px:
  real totals, keyboard editing, concealed retained entries, lost save response,
  identical retry and status focus, native case navigation, CSV download,
  product-only scope, role revocation and ordinary-account denial. Browser errors
  and unexpected discard prompts are zero.
- `feedback-weekly-growth-browser.log`: eight broader Growth/choice/browser
  groups plus runtime/cost checks pass. Dates, maturity, coverage, suppression,
  CSV/audit, opt-out, concurrent choices, retries and identity concealment work.
- `feedback-weekly-preview-build.log`: production preview passes with 187 traces,
  43,205 entries and 476 server JavaScript files. The repaired 173,096-byte
  renderer is unchanged. Final release-note, reference-math and date-query edits
  followed this build; the complete feature gate must rebuild the checkpoint.
- Final type and focused lint checks pass. Initial fixture errors (missing
  suggestion state and an incorrect request-version field) and an optional-label
  selector failure remain in their original logs. Guards were not relaxed.

Seven warm loopback samples over twenty assigned cases, two requesters and two
manual tags measured weekly-with-metrics median/max 22.225/23.240 ms, 19 SQL
commands and 12,400 bytes; without metrics 3.276/4.039 ms, 14 commands and
10,344 bytes. Growth measured 15.719/15.921 ms, 16 commands and 15,538 bytes.
These fictional local measurements are not production latency or capacity.
No production test data or outbound messages were created.

Continue full feature acceptance, source comparison, protected upgrade and
authorized release. Recheck actual serving identity and flags before declaring
anything live. Actual first-operator, provider and physical/pilot evidence remains
separate from isolated engineering acceptance.
