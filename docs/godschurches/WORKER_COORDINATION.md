# Single-runner coordination and preserved worker history

Effective 21 September 2026: the owner ended independent A1/A2 task queues.
Use the regular priority workflow. There is one active runner for building,
integration and releases. No task belongs to a parallel agent, and no A2
acknowledgment, environment preparation or handoff is required to select work.
Keep real feature prerequisites, test isolation and release gates intact.

Preserve all existing worktrees, branches, fictional databases and checkpoints.
Inspect actual running jobs, repository state and saved claims before recovering
stale ownership. Do not reset another checkout or remove an unexamined lock.

The existing tested helper and private Git-common `gc-coordination` location
remain the compatibility mechanism for atomic identity, feature reservations
and release exclusion. Its `A1` key is the sole runner's technical slot, not a
Todoist owner or a parallel queue. Use the registered worktree and exact session
with `register`, `claim`, `checkpoint`, `release-acquire`, `release-release`,
`finish` and `unregister`. Status remains read-only. Keep the slot's worktree
path stable unless a separately verified migration updates the implementation.
The retained `A2` identity/checkpoint is historical; do not activate it. Check
actual reservations and saved work before treating any remaining state as stale.
Record the current mode and preserved baseline in the private checkpoint.

Run `node --test tests/worker-coordination.test.mjs` when verifying this existing
guard. Tests use disposable repositories; never race against real claims. The
helper is cooperative coordination, not an OS or provider permission boundary.

The detailed two-worker operations below document the preserved implementation
and historical setup only. Their task routing, A2 startup and separate-release
ownership instructions are superseded by the single-runner procedure above.

## Historical independent-worker procedure

A1 and A2 are separate owner-controlled chats. Read the current shared workflow
task in the private task system. Its actual task labels govern routing. This
procedure coordinates local work; it is not an OS, Git-host or provider access
control and never grants production authority beyond the existing user scope.

## Shared location and first setup

Resolve `git rev-parse --path-format=absolute --git-common-dir`. The private
`gc-coordination` directory under it holds `registry.json`, worker-owned
`workers/A1.json` and `workers/A2.json`, the setup receipt and fictional fixture
configuration. These files are outside the tracked/public repository. Keep real
session IDs, task IDs, paths and credentials there, never in public reports.

A1 configures distinct existing worktrees from an inspected safe commit using
`scripts/worker-coordination.mjs`. Both must resolve to the same Git common
directory. Reuse A2's existing checkout and preparation. The setup receipt records
the exact base, branches, private fixture/configuration paths, separate ports and
actual checks. A2 can independently install the locked dependencies and prepare its
own isolated environment. Production credentials never belong in test fixtures.

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

Requests contain `operation`, `worker` (`A1` or `A2`) and the current chat's exact
`session` identifier. `status` is read-only and needs only its operation. It
returns the registry and whether the short `claim.lock` is held.

- `configure`: A1-only first setup, with `base` (full safe commit) and
  `worktrees: { A1: absolutePath, A2: absolutePath }`. Existing worker paths cannot
  be silently replaced. Never reconfigure after A2 has registered.
- `register`: reserve the worker identity. The same session may resume; a
  different session is rejected. A1 does not register A2 on its behalf.
- `claim`: supply `task` and `resources`, for example `file:lib/platform/calendar-commands.ts`,
  `file:prisma/migrations` and `contract:calendar`. Include shared owners/contracts
  affected indirectly. Directory claims cover descendants. Names are normalized
  conservatively for case-insensitive filesystems. Another worker's task or
  overlapping resource cannot be claimed. Reserve only the current change.
- `checkpoint`: supply a short `status` and `handoff`. The helper atomically writes
  only your worker's file, recording session, task, actual branch/commit,
  reservations and timestamp. Include checks, remaining gates and transfer facts.
- `finish`: clear your feature reservations after a committed checkpoint and
  task handoff. It does not complete a task in Todoist. A2 can finish independent
  work while A1 holds a release lock.
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

At safe checkpoints A1 reads ready-to-merge task evidence and A2's checkpoint.
A2 provides tested commits and explicit migration/configuration needs. A1 records
merged and verified-live status separately. The initial setup does not prove a
later session automatically loaded instructions, a physical device worked, or a
feature passed acceptance. Leave those existing gates open until observed.

After integrating a schema change, regenerate the receiving worktree's Prisma
client with `npm run prisma:generate` before running its checks. A successful
migration does not refresh an already installed client. Stop that worktree's
checks before regeneration; preserve a failed stale-client attempt and rerun the
affected checks against the merged schema. Do not modify the other worker's
dependencies or database.
