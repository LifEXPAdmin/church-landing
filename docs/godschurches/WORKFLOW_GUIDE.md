# Godschurches workflow guide

Version 5.0 · Updated 26 September 2026 UTC

This is the repository entry point for work that continues between ChatGPT, Codex,
the private second brain, and the development workstation. Keep this file's path
stable. The private Notion page **Workflow Guide for ChatGPT and Codex** maintains
the shared workflow register and links.

## First session

1. Read the user request and [root instructions](../../AGENTS.md).
2. Inspect the actual checkout, branch, current commit, and unfinished changes.
   Do not assume a cloud session is the home workstation.
3. Read the newest applicable sections of [CURRENT_STATE.md](CURRENT_STATE.md)
   and the relevant report. For design, start with
   [DESIGN_IMPLEMENTATION_REPORT.md](DESIGN_IMPLEMENTATION_REPORT.md); for account
   testing, [ACCOUNT_TEST_GUIDE.md](ACCOUNT_TEST_GUIDE.md); for support,
   [SUPPORT_OPERATIONS.md](SUPPORT_OPERATIONS.md). Read the relevant
   [decisions](DECISIONS.md) and [release readiness](RELEASE_READINESS.md) when needed.
4. If the private Notion connector is available, search for the exact title
   **Workflow Guide for ChatGPT and Codex**. Use its directory to choose
   **Church Second Brain**. Read **Current State and Next Three Outcomes**,
   **Shared Context Brief for ChatGPT and Codex**, relevant decisions, and the
   latest applicable session handoff. Read **Company Knowledge and Work History
   Protocol** and the **Session Log** views **Task completion ledger** and
   **In progress and integration**. Follow the selected task's accepted decision,
   current implementation contract, applicable revision and replacement links.
   Load focused records; keep the full archive searchable without reading it all.
5. Read the linked Todoist action when available. Establish the outcome, sources,
   done criteria, and dependencies. State any material access or evidence gap,
   then continue the authorized work.

The private workspace contains separate brains for separate core projects.
Use only the relevant project's context for this repository. If Notion or Todoist
is unavailable, use the user's supplied context and accessible repository evidence;
leave the intended updates as a handoff rather than claiming synchronization.

## Where information belongs

| System | Record |
| --- | --- |
| Notion | Project purpose, scope, goals and horizons, ideas, decisions, sources, workflow definitions, task history and measured timing, session handoffs |
| Todoist | Concrete next action, priority/due date, done criteria, dependency, link to context |
| Git | Code, repository instructions, versioned engineering reports, reviewable changes |
| Current chat | Discussion and work in progress; transfer durable outcomes before ending |
| Workstation | Actual local checkout, tools, task execution, tested remote-access behavior |

In the Godschurches Todoist project, **Phone** means work possible on the phone,
**Computer** means work needing the development environment, and **Waiting**
means a stated dependency is unresolved. These sections do not by themselves
describe whether an action is in progress. Keep tasks open until their done
criteria are met; capture evidence in the linked handoff.
The **End of batch** section stays last and holds the final review. Add new
implementation actions before it; priority does not move review ahead of its
dependencies.

## Requirement sources

Use **Team Packets — Start Here and Current Workflow** and **Legacy Blueprint
Coverage — 132 Steps and Current Tasks** in private Notion. The operational
packets are version 2.1, Living Master 1.1.0 and private workflow 1.3 as of
10 September 2026. Read the relevant original step briefs before implementing
mapped requirements. Keep team packet F01–F06, feature F001–F152 and Legacy
Step 001–132 identifiers distinct. Record covered, partial, deferred or superseded
scope with evidence in the existing task; catalogs do not establish completion.
Preserve private links in private systems. Workflow changes propagate to affected
packets, templates, entry points and task descriptions with an actual readback.

## Unified feature workflow

Use the private **Godschurches Work Queue — Tasks, Subtasks and Tonight’s Order**
and **Implementation, Integration and Complete-Feature Handoffs** once per session.
Then read the selected focused brief, owning requirement and newest relevant
implementation delta. Avoid rereading the full catalog or historical receipts
unless a conflict requires them. User decisions define intended behavior; the
actual checkout and dated application/test receipts establish implementation.

The owner's 26 September instruction allows multiple concurrent chats. Use
one ordinary queue across all four projects or the saved regular task view,
including pagination and subtasks. Select eligible P1, then P2, P3 and P4 work;
within a priority honor prerequisites and existing manual order. Former worker
labels do not partition the queue. Current atomic claims do restrict selection:
take a different unclaimed task and respect affected file/contract reservations.
Keep task IDs, parent/child
relationships, priorities, acceptance criteria and completed evidence intact.
Personal owner actions remain separate. Labels do not change model settings.

Work directly on one coherent feature using an inspected worktree, feature
branch and isolated fictional database/ports. Preserve existing worktrees,
branches, jobs and release evidence. Follow the [coordination procedure](WORKER_COORDINATION.md)
for atomic identity, feature claims and the release guard. Register a distinct
worker slot bound to the current chat and worktree, with a readable chat label.
Claim exact task IDs, including required children, before editing. Inspect any
existing reservation and saved work before
recovering stale state; never steal an active or unexamined lock.

Finish each feature's required UI, service, integration, configuration,
regression repair, documentation and meaningful verification. Use gc_in_progress
for the active task while retaining other applicable labels. Add a private
ownership header with chat title, exact session, worker, task IDs, status,
worktree/branch and update time. Use the existing Session Log row for dated
ownership events. Refresh the helper checkpoint and private status when work
starts, pauses, changes stage or is handed over. The helper's status summary is
a snapshot of recorded ownership, not proof that a chat is alive. A stale update
never releases a reservation automatically. Reproduce reported
issues before changing code. Reuse current canonical implementations and valid
prior test evidence where applicable. Necessary smaller finishing steps stay
inside the feature instead of being deferred to another agent or later task.

One designated release owner handles integration, main updates, production
migrations and deployment under existing permissions and the atomic release
lock. The existing A1 slot retains that role until an explicit safe handoff.
Other chats submit tested commits as gc_ready_to_merge, clear their active task
indicator after checkpointing, and continue independent eligible work. At safe
checkpoints, inspect any gc_ready_to_merge work left by previous sessions and
compare its exact commits and evidence with current main before integrating.
Preserve all existing changes, resolve conflicts and verify the combined result.
Complete exact READY, canonical-domain, serving-identity and live checks before
closing promised product acceptance. Keep implemented, tested, merged and
verified-live states distinct. Ready to merge alone is not completion.

Recheck priorities after each feature and continue automatically. Stop only on
owner request, no eligible work, or an actual access/runtime/usage limit; save a
clear checkpoint first. Check the actual named dependency behind blocked labels
and remove only specifically satisfied blockers with evidence. Retired worker
reservations no longer restrict the queue. Parent, owner, device, provider,
policy, pilot and source-contract gates remain open until their acceptance is
observed. Keep final batch review last. Each chat owns one coherent feature;
bounded helpers work within that claim. Avoid repeated full suites
without a concrete source, environment, integration or failure concern.

Before dependent interface work, identify existing service/component paths,
input/output types, authorized actions, pagination and error/conflict states.
Reuse canonical records and current audience checks. Presentation does not
invent permissions, counts, policy or a replacement backend. Preserve stable
IDs, existing role/privilege boundaries and version/retry behavior. Defer future
UI, tables, workers and dependencies until their owning task is authorized.

Resolve required technical contracts and regressions within the active authorized
feature. If an actual external prerequisite blocks completion, record the exact
missing evidence and continue independent work. Clear a dependency only after its
named contract and acceptance evidence exist. Keep broader parents and final
batch review open through their own acceptance.

## Keep the application lean and fast

Before adding code, find the existing service, component and canonical record
that owns the behavior. Reuse or extend it within its authority boundary. Add
only what the current acceptance criteria require; defer speculative frameworks,
duplicate stores, background work and dependencies. Share genuinely repeated
behavior when that simplifies the callers without coupling separate permissions.

Review the runtime cost of affected paths: shipped client code and dependencies,
request frequency, bounded database reads, image loading, and repeated rendering
or computation. Preserve pagination and batch related reads where appropriate.
Keep fixture, test and build tooling outside runtime bundles. Remove redundant
work in the touched scope when the behavior can be preserved and verified.

Measure before claiming a speed or size improvement. Choose focused evidence
suited to the change, such as bundle bytes, request/query counts or representative
timings. Code inspection, passing functional tests and total source line counts
do not establish performance. Avoid speculative rewrites or repeated broad
benchmarks without a concrete concern. Preserve authorization, source revocation,
exact retries, conflict handling and accessibility while optimizing.

## Working routine

- **Website writing:** Do not use em dashes, en dashes or double hyphens as
  sentence breaks or placeholder separators in platform-authored copy. Use
  periods, commas, colons, parentheses or separate sentences, and "to" for ranges.
  Apply this to visible text, labels, accessibility, metadata, forms, errors,
  notifications, automatic welcome templates and release notes, including encoded
  or generated forms. Preserve member content and verbatim third-party quotations;
  ordinary hyphens, URLs and code syntax remain valid. Review quotation matches
  explicitly. `npm run check:copy` checks authored source and also runs in the
  production build. Inspect rendered text and narrow-screen wrapping when changing
  shared copy; do not rewrite existing conversation data to satisfy a source rule.
- Capture ideas with source/date, project, horizon, and one next exploration.
  Check for an existing matching record before creating another.
- Record decisions with the actual answer, owner/date, rationale, scope, and
  affected records. Link a superseding decision to its predecessor.
- For coding, preserve unfinished changes and use a suitable branch or worktree.
  Read [package.json](../../package.json) and the relevant test guide before
  choosing checks. Match verification to the actual change.
- For phone review, identify the URL, date, device/browser, and whether the
  environment contains real or fictional data. The current implementation report
  distinguishes the real platform from the read-only demo. Use the documented
  isolated harness for fixture/write tests.
- For remote-workstation setup, find **Mac mini Remote Workstation — Setup and Test**
  in private Notion. Record the actual connection, cellular test, task/reconnect
  results, display-off behavior, and restart recovery. Documentation does not
  establish that the machine is connected.
- A recurring task needs a tested execution host, bounded scope, actual schedule,
  output destination, and failure behavior. Do not infer scheduling from an
  always-on computer or a written plan.

Repository reports can establish what a previous session reported, including its
tested commit, deployment, and limits. They do not prove the current checkout,
currently serving release, or a new test result. Read original evidence dates;
import dates do not change approval or verification history.

## Company knowledge and task history

The private **Company Knowledge and Work History Protocol** governs durable
company knowledge. Latest explicit user decisions, actual code and dated checks
determine current truth. Use accepted current contracts for new work and consult
superseded attempts when relevant. Captured ideas remain proposals until accepted;
recording them does not authorize implementation or expand task ownership.

Use the exact Todoist task ID as the canonical key in the private **Session Log**.
Search that key before creating a row. Reuse the same row through implementation,
handoff, integration and acceptance, with dated events inside its page. Preserve
the original contributor in historical receipts and append the current runner's
dated acceptance without replacing earlier narrative. New work has no A1/A2
ownership partition. Avoid concurrent edits to the same history.
Link the existing focused feature page, implementation report and **Decision Log**
instead of maintaining competing copies.

The compact index holds task name/ID/link, worker, stage, started/ready/completed
timestamps, timing quality, elapsed/active/test/wait minutes, summary, evidence
level and next action. Its page records:

- Exact outcome and acceptance scope, including remaining limitations.
- Component and contract names, related tasks, reused services, cross-feature
  dependencies, compatibility constraints and supported extension points.
- Approach and rationale, rejected alternatives and tradeoffs, changed files,
  source revision, configuration/migration requirements and release identity.
- Problems with actual symptoms, reproduction, established cause, attempted
  fixes and results, final resolution and recurrence checks.
- Checks with command/suite, tested revision, environment, observed start/end
  and exit status, concise result and controlled evidence location. Distinguish
  fresh observations from historical reports; retain large raw logs separately.
- Decisions replaced, remaining issues, proposed improvements or future
  integrations linked to existing backlog, next owner/action and pending writes.

Update at actual task start, meaningful pause or blocker, tested handoff and
acceptance. Started at means work began, not task creation. Ready at means a
tested handoff was submitted. Completed at means scoped acceptance; record the
verified-live time separately in product history. Definition acceptance does not
mean the future feature shipped. A resumed segment can have observed timestamps
without fabricating the original task start.

Use ISO 8601 with explicit timezone, preferably UTC; present owner summaries in
America/Chicago. Elapsed minutes is completion minus an observed actual start,
including interruptions. Record observed active intervals and deployment,
integration or blocked waits separately. Test runtime can overlap other work and
is not token cost. Do not sum overlapping worker durations as project wall time.
Leave unobserved numeric fields blank and mark timing Unknown or Partial. Never
infer precise starts from commits/comments or token usage, model settings or
cost from passing tests. Use actual usage telemetry only when available, with
its source. Avoid per-minute logging and unchanged status polling.

Important decisions retain a stable identifier, component/scope, status, owner,
date, applicable revision, rationale, alternatives, evidence, consequences and
review trigger. Link prior and replacement decisions in both directions. Mark
older guidance Superseded while retaining its original reasoning, conditions
and observations. Explain why the replacement applies, its effective revision,
migration/compatibility effects and features still using the old method. A
contextual failed attempt is not a universal prohibition. Distinguish Proposed,
Accepted, Implemented, Verified and Superseded facts with appropriate evidence.

Maintain concise searchable summaries alongside detailed controlled evidence.
Append corrections to dated history and update the current area summary in
place. Keep credentials, unnecessary personal content and production database
copies out of this library. On interruption or connector failure, preserve the
local checkpoint and intended pending writes, reconcile when access works and
verify readback. Missing synchronization does not erase observed work.

Related edits may form one coherent change followed by focused checks. Reuse
valid prior evidence while checking the combined result. Run required release gates;
repeat a broad suite when a concrete source, environment, integration or failure
risk invalidates its evidence. Documentation changes receive proportionate checks.
This recording routine does not lower existing product acceptance requirements.

## Owner actions

When active work requires the project owner to choose or create an account,
sign in, accept terms, supply access or assets, decide a policy, or approve a
purchase, first prepare the concrete choices and complete independent work.
Search existing actions and answers before asking again. Create or update a
concise owner-action task in **Phone**, label it `andrew_action`, and link its
coding dependency. A blocked coding child keeps its technical parent.

State the exact next action and official service link, the blocked feature,
account or ownership choice, cost (free, verified price, or unknown), prepared
artifact, observable done evidence, and next technical step. Prefer existing
suitable resources; do not invent a purchase or a new deadline. Credentials and
private account details stay in secure service flows. After the owner step is
verified, complete only that step and resume technical acceptance. Continue
independent authorized work while an answer remains pending.

The private **Andrew Actions — Accounts, Access, Purchases and Batch Handoffs**
page maintains exact owner-task links and current service handoffs.

## Final batch review

Keep the final review last in the agreed batch. Record its scope, actual task
states, application commits, report-only commits and deployments. Do not drop
later work or call blocked acceptance complete to close the review.

Review completed work against current specifications, task evidence, code and
the actual website. Reproduce and fix authorized defects or record a linked
triage task. Use isolated fixtures for write-heavy checks and keep actual
provider, consenting-user and physical-device evidence distinct. Earlier QA and
pilot gates still apply; urgent fixes do not wait for the final review.

Read future ideas, feedback and unresolved decisions. Prepare a coherent next
prioritized batch with evidence, dependencies, bounded actions and acceptance;
reuse unfinished tasks and preserve completed receipts. Reconcile and read back
the private knowledge and task systems, surface owner actions, and create the
following review last. Preserve the agreed batch scope until it is completed or
explicitly changed.

Notify the verified project owner through the requested channel with actual
coded, tested and published status, evidence links, remaining dependencies and
the next plan. Record the provider result; acceptance by a notification service
does not prove a phone displayed it or its recipient read it. If delivery fails,
leave the precise intended receipt and notification pending. A task convention
does not configure a watcher or schedule. The private **33 — Final Batch Review,
Next Build Plan and Andrew Notification** page maintains the detailed procedure.

## End-of-session handoff

Use this compact outline in the appropriate private session record and relevant
engineering report. Include only public engineering facts in this repository.

- Date, objective, contributor, human-readable chat title, exact session/worker
  and private checkpoint. Current task ownership, status and last update time.
- Exact private task ID and existing Session Log row; original worker and dated
  segment events, current stage and evidence level.
- Observed started/ready/completed timestamps, verified-live time when applicable,
  elapsed/active/test/wait minutes and timing quality. Leave unknown numeric
  values blank; identify actual usage telemetry or state that it is unavailable.
- Active worktree/branch, safe base, isolated database/ports and current file/contract reservations.
- Implemented, tested, ready to merge, merged and verified-live states; release lock and integration evidence where applicable.
- Selected feature and subtasks, focused brief title, owning requirement
  identifiers, prerequisite receipt and current user-authorized priority.
- Reused paths/contracts and the behavior or contract delta, including no change.
- Required finishing steps and newly unlocked children completed in this feature;
  exact external blockers and next independent eligible work.
- Relevant runtime-cost review, measurements actually made, and unresolved limits.
- Actual changes and affected files/pages.
- Approach, reasons and rejected alternatives; decisions and their source,
  applicable revision, prior/replacement links and compatibility consequences.
- Failures with reproduction, attempted fixes, established cause, resolution and
  recurrence check. Proposed improvements remain separate from accepted work.
- Branch/commit, PR, or deployment when applicable.
- Checks actually performed and their results.
- Limits, unverified claims, and remaining blockers.
- Workflow changes and affected instructions updated, or none.
- Pending writes and intended destinations.
- Owner-action dependencies and agreed batch status, when applicable.
- Next-batch references, unfinished propagation and actual notification result.
- One concrete next action and what will prove it is done.
- Notion/Todoist write and readback result; never close a task on an unverified
  write or remove a dependency based on implementation alone.

Update the current project summary in place; preserve original source snapshots
and historical reports. Link matching records instead of maintaining competing
current versions. Cross-chat and cross-app updates occur through explicit reads
and writes; links alone do not synchronize them.

## Change the workflow

When a tool, reading order, execution location, task convention, or handoff changes:

1. Update the existing guide/runbook, effective date, owner, and version.
2. Record what changed, why, dependencies, and whether it is documented,
   configured, or tested.
3. Propagate the relevant change to private Notion entry points and templates,
   Todoist descriptions, and these repository instructions.
4. Read back the changes and check the affected links or one representative route.
   For execution changes, record the actual test and its limits.
5. Append a change entry and name any propagation still pending.

Use a minor version for additions and a major version for a changed core workflow.
Verify the changed reading route in the active checkout. Record later fresh-session
discovery when observed; it does not require ending an authorized continuous run.

Keep private Notion URLs, Todoist IDs, account records, credentials, and private
test evidence in their appropriate private systems. The exact page titles above
allow an authorized assistant to locate the context without publishing it.

## Change log

- **5.0, 26 September 2026 UTC:** The owner requested concurrent independent
  chats and visible task ownership. Retained one priority queue; added exact
  task-ID claims, readable chat ownership and private status checkpoints.
  Separate worktrees and one release owner preserve active work and release
  gates. Historical identities and the retired static queue split stay intact.

- **4.0, 21 September 2026 UTC:** Restored ordinary priority-based tasks across
  all four projects at the owner's request. Retired the independent A1/A2 queue
  partition and startup requirements. Preserved historical attribution, existing
  worktrees, atomic release protection, complete-feature gates and company
  history. The active runner builds, integrates and verifies releases; later
  fresh-session instruction discovery remains a separate observed check.

- **3.1, 18 September 2026 UTC:** Adopted the owner's company-knowledge and
  work-history addition in root instructions, this guide and the existing handoff
  outline. Added exact private task keys, original-worker attribution, dated
  engineering/decision history, superseded-method links and observed timing/usage
  rules. Preserved private-source boundaries and all product gates. Local adoption,
  publication and future fresh-session discovery require separate actual evidence.

- **3.0, 18 September 2026 UTC:** Adopted owner-approved independent A1/A2 task routing, separate environments, atomic identity/resource claims, one-writer checkpoints and A1-only integration/release locking. Preserved complete-feature acceptance and website copy rules. Added bounded temporary delegation and explicit startup preparation while shared setup completes. Actual setup and later fresh-session loading are distinct evidence.

- **2.1, 16 September 2026 UTC:** Propagated the owner's 15 September website
  writing rule into this guide and the root instructions. The focused build check
  covers authored strings, templates, JSX, static metadata and generated long-dash
  characters while leaving stored member content unchanged. Feature acceptance
  records the actual source/rendered checks and release separately.

- **2.0 — 14 September 2026 UTC:** Adopted the owner's unified Extra High run,
  ordinary feature/subtask queue, complete-feature release cycles and continuous
  priority execution. Replaced earlier routing/session restrictions in the root
  instructions and existing handoff template. Preserved real dependency gates,
  private-source boundaries and historical receipts. Active readback verified;
  no new fresh-session automatic-loading claim is made.

- **1.4 — 12 September 2026:** Adopted the owner's dependency-only use of
  lower-reasoning tasks within Extra High work. Added scoped reuse and measured
  runtime-cost review to implementation and handoff guidance. Documentation
  readback is verified; no runtime or deployment change is implied.

- **1.3 — 11 September 2026:** Adopted WF13 focused briefs, Medium/Extra High
  dependency routes, contract reuse and compact evidence fields in this existing
  handoff template. Root instructions point to the route. Documentation readback
  is verified; subsequent-session discovery and automatic loading remain open.

- **1.2 — 10 September 2026:** Adopted private workflow 1.3 source reconciliation
  and packet reading routes. Active-session reading is verified; fresh-session
  automatic loading remains a separate acceptance check.

- **1.1 — 10 September 2026:** Adopted the private workflow's owner-action and
  final-review conventions, paired dependencies, End of batch ordering and
  handoff evidence. Root instructions were updated. Reading the files in this
  active session does not establish a fresh session's automatic loading.
- **1.0 — 9 September 2026:** Added repository onboarding, source precedence,
  cross-system responsibilities, capture/action/handoff routines, workstation
  evidence requirements, and a workflow update procedure.

### Public release content maintenance

Each user-visible release updates `lib/platform/release-content.ts` in the same
reviewed batch: retain old notes, add a stable release ID and date-based product
version (`YYYY.MM.DD.sequence`), and describe Added/Improved/Fixed behavior with
links to the maintained feature inventory. The initial documented baseline maps
to application build `5502f7dbd1dcfd8d563bc0b23c20e7ca976751d3`; no earlier version
history is inferred. The serving release endpoint pairs the product version with
its actual immutable application SHA. Record that pair in the verified deployment
receipt. Internal fixes within the same release may retain the product version;
the exact serving SHA still distinguishes each build. A loaded layout captures its own pair once; detection never relabels it.

Run `node --import ./tests/register.mjs --test tests/release-content.test.ts`
with the project's supported Node runtime. Review new feature claims against
actual behavior and deployment gates; record conditional provider/access limits
in the public guide. Keep private task links, fixture identities and planned
features out of public notes. Check Menu/footer links, release detail URLs,
unknown metadata and the update dialog with unsaved work. Reading or dismissing
notes must not refresh, publish, save or resolve a draft. Complete live identity
verification before marking release content or its owning task live.
