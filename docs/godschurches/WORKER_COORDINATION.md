# Concurrent chat ownership and release coordination

Effective 26 September 2026 UTC: the owner requested simultaneous chats working
on different website tasks, with visible current ownership. This supersedes the
21 September single-runner restriction. Keep one priority queue across all four
projects; the historical A1/A2 task partition remains retired.

Each chat uses its own inspected worktree, feature branch and isolated fictional
test environment. Preserve existing worktrees, branches, processes, databases
and checkpoints. Before editing, inspect status and atomically register identity
and reserve exact task IDs plus affected files/contracts. Use narrow claims for
the actual feature; a directory claim deliberately excludes all descendants.
Only its owner may narrow an active reservation. Never remove a live or
unexamined lock or take another chat's checkpoint.

The existing A1 slot remains the single integration/release owner during this
transition. Other chats build independent features and hand over tested commits.
This is cooperative coordination, not an OS, Git-host or provider access control,
and does not grant production authority beyond the current user scope.

## Visible task ownership

`status` returns the registry and a readable `summary` of registered chats,
including human label, exact session, task IDs/title, last recorded update and
matching checkpoint. The registry is authoritative for current reservations.
Checkpoint branch, commit and status appear as current only when they belong to
the same session and current claim. Old checkpoints remain historical evidence.
A timestamp is a recorded update, not proof a chat is running. Nothing is
reassigned automatically because a timestamp is old.

At task start, meaningful checkpoints, pause and handoff, update the private
Todoist ownership header and existing Session Log row with chat title, worker,
exact session/task IDs, status, branch and update time. Preserve other labels
when adding `gc_in_progress`; remove that active indicator when work pauses or
is handed over. Use `gc_ready_to_merge` only for tested committed handoffs and
leave release acceptance open. App thread titles should identify the current
feature when supported. A helper command does not itself synchronize Notion or
Todoist or send a notification: perform the authorized writes and read them back.

## Shared location and first setup

Resolve `git rev-parse --path-format=absolute --git-common-dir`. The private
`gc-coordination` directory under it holds `registry.json`, worker-owned
`workers/<worker>.json` checkpoints, the setup receipt and fictional fixture
configuration. These files are outside the tracked/public repository. Keep real
session IDs, task IDs, paths and credentials there, never in public reports.

The initial A1/A2 configuration is retained. New chats register a new uppercase
worker key, such as `C3`, from their own separate worktree in the same Git common
directory. Registration adds only that slot; it never reconfigures old identities
or directories. Use a real feature branch, not main or a detached checkout.
An existing slot may be resumed only by its registered session in its bound
worktree. Historical A2 remains preserved until an inspected explicit handoff.
Prepare independent dependencies, generated clients and fictional database/ports
before runtime work. Record actual base, environment and isolation evidence.
Production credentials never belong in test fixtures.

Run the helper from your assigned worktree with one private JSON request file:

```sh
node scripts/worker-coordination.mjs /absolute/private/request.json
```

A versioned copy may be installed at `gc-coordination/bin/worker-coordination.mjs`
for a worker whose branch has not yet integrated the public helper. The receipt
must record its source commit and checksum. Execute it from your own worktree;
the helper validates that location for every mutation. Never edit the other
worker's checkout to propagate instructions. Integrate the recorded guidance
commit in your own branch after checking your existing changes.

## Operations

Mutation requests contain `operation`, a bounded uppercase `worker` key and the current chat's exact
`session` identifier. `status` is read-only and needs only its operation. It
returns the registry, readable ownership summary and whether the short `claim.lock` is held. It makes no writes.

- `configure`: A1-only first setup, with `base` (full safe commit) and
  `worktrees: { A1: absolutePath, A2: absolutePath }`. Existing worker paths cannot
  be silently replaced. Never reconfigure after A2 has registered.
- `register`: reserve your own identity from your own worktree. Supply a short
  human-readable `label` identifying this chat. New keys are added atomically to
  the existing configured registry. Duplicate sessions and worktree bindings are
  rejected. The same owner may refresh its label; never register another chat.
- `claim`: supply a readable `task`, exact private `taskIds` (including required
  children), and `resources`, for example `file:lib/platform/calendar-commands.ts`,
  `file:prisma/migrations` and `contract:calendar`. Include shared owners/contracts
  affected indirectly. Directory claims cover descendants. Names are normalized
  conservatively for case-insensitive filesystems. Another worker's task or
  overlapping resource cannot be claimed. Exact task IDs also reserve derived
  `contract:task-<id>` resources, so differently worded titles cannot duplicate
  work. Reserve only the current change. `taskIds` remains optional for legacy
  compatibility, but all new chats must supply it. Active old-helper owners must
  adopt the updated helper before relying on exact-ID exclusion; their existing
  legacy claims and file/contract exclusions remain valid.
- `checkpoint`: supply a short `status` and `handoff`. The helper atomically writes
  only your worker's file, recording session, task, actual branch/commit,
  reservations and timestamp. Include checks, remaining gates and transfer facts.
  Successful owner operations also refresh the identity's recorded update time.
- `finish`: clear your feature reservations after a committed checkpoint and
  task handoff. It does not complete a task in Todoist. Other chats can finish
  independent work while A1 holds a release lock.
- `release-acquire` / `release-release`: A1-only atomic release ownership in the
  shared registry. A1 must have a current claim. Hold this through integration,
  main update, migration/deployment and exact live closeout; release only after a
  saved receipt or precise interrupted-release checkpoint.
- `unregister`: relinquish only your own identity after claims/release are clear.
  Retained checkpoints remain available to the next session.

All mutations use a short atomic `mkdir` mutex, an owner token and an atomic
registry replacement. Failed validation leaves current claims intact. Separate
processes racing for the same identity cannot both succeed. A held mutex fails
closed; wait for the owner command to finish and retry, without a busy loop.

Never delete another live or unexamined lock. A crashed owner may leave a mutex
or persistent identity. Inspect its exact session, process, active jobs and saved
work first. A shared app-server PID alone is not proof a particular chat is live
or dead. Preserve the prior registry/checkpoint and record a recovery decision
before any manual stale-state repair. There is no automatic time-based stealing.

## Verification and handoff

Run `node --test tests/worker-coordination.test.mjs` for duplicate identities,
wrong-worktree writes, file/contract conflicts, independent A2 completion during
an A1 release, invalid paths, preserved locks and simultaneous process claims.
Use disposable temporary repositories; never test contention against a live
worker's claims. Actual startup additionally verifies both real worktrees,
current states, separate database identities/ports and private configuration.

At safe checkpoints A1 reads ready-to-merge task evidence and each submitting
chat's checkpoint. Builders provide tested commits and explicit migration and
configuration needs. A1 records
merged and verified-live status separately. The initial setup does not prove a
later session automatically loaded instructions, a physical device worked, or a
feature passed acceptance. Leave those existing gates open until observed.

After integrating a schema change, regenerate the receiving worktree's Prisma
client with `npm run prisma:generate` before running its checks. A successful
migration does not refresh an already installed client. Stop that worktree's
checks before regeneration; preserve a failed stale-client attempt and rerun the
affected checks against the merged schema. Do not modify the other worker's
dependencies or database.
