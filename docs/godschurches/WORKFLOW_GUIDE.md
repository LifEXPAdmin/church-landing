# Godschurches workflow guide

Version 1.0 · Updated 9 September 2026

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

## End-of-session handoff

Use this compact outline in the appropriate private session record and relevant
engineering report. Include only public engineering facts in this repository.

- Date, objective, and contributor.
- Actual changes and affected files/pages.
- Decisions and their source.
- Branch/commit, PR, or deployment when applicable.
- Checks actually performed and their results.
- Limits, unverified claims, and remaining blockers.
- Workflow changes and affected instructions updated, or none.
- Pending writes and intended destinations.
- One concrete next action and what will prove it is done.

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

- **1.0 — 9 September 2026:** Added repository onboarding, source precedence,
  cross-system responsibilities, capture/action/handoff routines, workstation
  evidence requirements, and a workflow update procedure.
