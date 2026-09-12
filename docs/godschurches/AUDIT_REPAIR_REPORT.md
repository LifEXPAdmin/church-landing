# Social reliability and runtime review

## Release candidate — 12 September 2026

Candidate product `2026.09.12.23` follows application `6859cb0` and the clean
review checkout `fe36256`. Implementation and focused verification are local.
The complete regression gate and production publication are still pending.

## Changes

- Retired seven native community mutation exports and their generic service.
  The current APIs own post, comment and relationship mutations. Post Likes now
  use explicit desired state, independent versions and existing social receipts.
  Exact retries cannot toggle back or overwrite a newer Unlike. Plain reposts
  continue to target the original, and account exports omit inactive Likes.
- Added the backward-compatible Like migration. Existing IDs, timestamps and
  active choices stay unchanged; new columns default to active/version 1.
- Preserved the complete private-draft reply-permission contract: explicit modes,
  deliberate review of older snapshots, exact-body retries, conflicts and atomic
  publication under current church access.
- Profile-photo Discard waits for shared history cleanup before confirmation.
  A clicked destination during cleanup waits for it to finish. Other pending
  photo panels, unsaved profile text and viewer Back behavior remain protected.
- Visible author avatars share only identical in-flight reads within the expected
  account. Before/after identity checks now use a minimal owned-session projection.
  No private response cache or authorization shortcut is introduced.
- Read-only post/media transactions share the existing advisory lock. Permission
  and lifecycle writers remain exclusive. Garbage collection explicitly uses the
  write gate before expiring an upload. Portal/support reconciliation still uses
  its existing exclusive gate; that broader maintenance work remains a limit.
- Closed discussions expose a truthful closed state. Legacy admin CSV export
  neutralizes formulas before quoting the complete cell, including line breaks.
- Scoped Prisma's transitive `deepmerge-ts` override to 8.0.2, following the
  [upstream compatibility analysis](https://github.com/prisma/orm/pull/30189).
  Prisma/client versions remain paired at 6.19.3; one installed package changed.
- Moved existing errors, eligibility rules and input validators into leaf modules,
  preserving compatibility exports. Removed unused retired waitlist helpers and
  the unused native-action pending helper. Release-note parsing is separate from
  the feature catalog so the update notice can load details on opening.

## Verification so far

Fresh production compilation, TypeScript and runtime trace exclusion pass.
ESLint reports zero errors and the same 37 existing fixture/QA unused-variable
warnings. The install audit reports zero vulnerabilities. Focused service and
actual HTTPS tests cover retry fingerprints, conflict versions, stale accounts,
source withdrawal, original repost targets, session revocation, draft reply
permissions and cleanup. The complete run must pass before a full-green claim.

The broad harness now discovers every `.test.ts` under `tests` and `lib`, retaining
its explicit development, production HTTPS and restart stages. Older assertions
now exercise current APIs and routes while preserving private-field, no-write,
pagination and account-isolation checks. Original failed runs remain in private
evidence; diagnostic continuations are not accepted as the full gate.

The built browser verifies exact Like bytes after a lost acknowledgement, stale
tab recovery, account replacement and narrow-screen guest entry. Shared composer
checks include both reply modes, legacy review, conflicts and revoked church
publication. Photo, sharing, installation and relationship regression receipts
are being completed in the isolated fixture. These are automated Chrome checks,
not new physical-device acceptance.

## Measured local costs

The same 390×844 Home fixture mounts 30 same-author posts with one intersecting
the viewport. Initial API requests decreased from 95 to 8; one settled focus
event decreased from 96 to 9. Avatar metadata requests decreased from 30 to 1.
The minimal identity service emitted 7 SQL events versus 16 for the original
full-profile identity reader. No production latency or capacity claim follows.

Four read callbacks with 80 ms of simulated work now overlap (maximum concurrency
4, about 89 ms total), versus concurrency 1/about 333 ms before. A held exclusive
writer still blocks a guest reader, and read callbacks reject attempted writes.
The inspected runtime import graph has no cycles; the original nine-module cycle
is removed. Final bundle measurements remain pending.

The encrypted production backup restored successfully, and the local 31→32
migration rehearsal preserved original-column fingerprints in all 75 tables.
Plaintext restored data was removed. This rehearsal made no production changes.

## Release and remaining gates

No new production deployment or migration is recorded yet. After the complete
gate, record the application commit, migration receipt, READY deployment,
independent canonical alias, serving version/SHA and read-only live checks here.
An older application that counts all Like rows cannot interpret Unlike tombstones;
use a forward fix or a compatible rollback, not an unreviewed old deployment.

Existing real reviewer/provider, church-management, owner and physical-device
acceptance remain open. The next queued implementation is the scoped reporting
and abuse-limit foundation needed for contact requests and one-to-one messaging.
