# Godschurches workflow guide

Version 1.3 · Updated 11 September 2026

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
   latest applicable session handoff.
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
| Notion | Project purpose, scope, goals and horizons, ideas, decisions, sources, workflow definitions, session handoffs |
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

## Focused implementation and reasoning route

Use the private **Astra Work Queues — Medium and Extra High** directory and
**WF13 — Efficient Implementation, Future Design and Handoffs** once per session.
Then read the selected focused brief, owning requirement and newest relevant
implementation delta. Avoid rereading the full catalog or historical receipts
unless a conflict requires them. User decisions define intended behavior; the
actual checkout and dated application/test receipts establish implementation.

Choose one coherent slice, or a small group sharing an accepted contract.
Preserve priority and completed foundations. Medium tasks must be open, labeled
`astra_medium`, and free of `dependency_blocked`; verify the named prerequisite
receipt in the checkout before starting. A parent's Extra High route does not
change its Medium children's route. Labels do not change the active model or
reasoning setting: record only a setting established by the session, otherwise
state that it is unverified. Do not promise a particular token saving.

Before dependent interface work, identify existing service/component paths,
input/output types, authorized actions, pagination and error/conflict states.
Reuse canonical records and current audience checks. Presentation does not
invent permissions, counts, policy or a replacement backend. Preserve stable
IDs, existing role/privilege boundaries and version/retry behavior. Defer future
UI, tables, workers and dependencies until their owning task is authorized.

If a required contract is missing or conflicting, a permission/schema/lifecycle
or delivery boundary must change, or bounded investigation cannot explain a
failure, record the precise Extra High dependency and switch to another ready
slice. The user selects the higher reasoning setting. Clear a dependency only
after its named contract and acceptance evidence exist. Keep integrated parents
and final batch review open through their separate acceptance.

## Working routine

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

- Date, objective, and contributor.
- Selected reasoning route, verified model/setting or explicit uncertainty, focused
  brief title, owning requirement identifiers, and prerequisite receipt.
- Reused paths/contracts and the behavior or contract delta, including no change.
- Actual changes and affected files/pages.
- Decisions and their source.
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
After repository instructions reach the active checkout, start a fresh Codex
session and confirm which instructions it loaded.

Keep private Notion URLs, Todoist IDs, account records, credentials, and private
test evidence in their appropriate private systems. The exact page titles above
allow an authorized assistant to locate the context without publishing it.

## Change log

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
