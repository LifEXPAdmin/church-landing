# Encrypted recovery copies and expiry

## Volunteer release recovery verified, 26 September 2026 UTC

Production and the installed registry now match all 115 source migration
checksums. The protected 110-to-115 rehearsal at 05:14 UTC preserved 149 original
tables over their original columns and replayed current protected controls.
Its backend is unchanged by the final small-screen layout repair. A fresh
installed encrypted 115-to-115 restore passed at 06:15 UTC, restored 149 tables
and removed plaintext. Ordinary installed restore does not itself replay controls.
The actual launchd maintenance job advanced from run 18 to 19, exited zero and
validated 100 sets with no issues, expiry candidates or removals. The installed
retention runtime is unchanged; verification made no production database writes.
See [the release and rollback limits](VOLUNTEER_AVAILABILITY_REPORT.md).

## Incident recovery boundary, 26 September 2026 UTC

[The incident response runbook](INCIDENT_RESPONSE_RUNBOOK.md) connects these
existing backup receipts to containment and deliberate resumption. A pause,
ordinary authenticated restore and protected replay prove different things.
Protected replay leaves traffic disabled and current authorization review
required; it does not reset password hashes. Reconcile current credentials,
restrictions and missing current records before reopening traffic. This
documentation adds no new scheduled backup, media coverage or production restore.

## Calendar release recovery verified, 26 September 2026 UTC

Installed registry and production match 110 migration checksums. Protected
106-to-110 rehearsal preserved 148 original tables over their original columns
and replayed controls. Fresh installed encrypted 110-to-110 restore passed for
149 tables and removed plaintext. The actual launchd maintenance job exited zero
on run 18, validating 98 sets with no issues, expiry candidates or removals.
No production database writes occurred. The installed retention and recovery
runtime is unchanged. See [the release receipt](CALENDAR_REMINDERS_REPORT.md).

## Scheduled restore startup repaired, 22 September 2026 UTC

The 20 and 21 September daily jobs encrypted their archives but failed during
local PostgreSQL startup. A disposable empty PostgreSQL 17 cluster reproduced
the failure with the scheduler's PATH-only environment, while an interactive
shell passed. PostgreSQL reported that its postmaster became multithreaded during
startup and requested a valid `LC_ALL`.

The installed private recovery script now sets `LC_ALL=C` and `LANG=C` before
constructing subprocess environments. The same empty-cluster check then passed
startup, a database query and cleanup. Seven existing backup-retention tests also
passed. Preserve this explicit locale when reinstalling the private operator
script; `initdb --no-locale` alone did not prevent the server startup failure.
The installed script checksum and original source are recorded privately.

An actual invocation of the existing launchd job created and restored a new
encrypted archive through all 104 current migrations and 144 application tables.
Its first final exit correctly retained attention for the two older archives
without restore attestations. Both unchanged archives were subsequently
authenticated and restored locally, their migration checksums verified, and
their plaintext and clusters removed. Their original creation times and archived
failure evidence remain intact. Only the observed successful re-attestations
were added. A final scheduler invocation validated all 86 sets with no issues,
no expiry candidates and no removals. Production database writes were zero.

This repairs local database backup execution. Scheduled asset coverage, managed
provider history, physical restart recovery and continuous host availability
retain their separate gates. No website runtime or schema changed.

The [September 18 expanded-resource rehearsal](RESOURCE_RESTORE.md) verifies all
144 current application tables, 100 migrations, 273 foreign keys and 1,100 stored
fictional image variants. A separate read-only provider rehearsal restores all
16 current production variants. These are dated recovery checks. The existing
daily job below remains database-only; manual asset recovery does not establish
scheduled media coverage.

13 September 2026. The approved retention policy limits database recovery copies
to 30 days. The existing encrypted PostgreSQL backup workflow now has a daily
operator job and a tested expiry command. No application request imports this
operator code and no runtime dependency was added for backup expiry.

## Recovery and provider boundary

The current provider inventory confirms PostgreSQL 17, six hours of managed Neon
history, and no scheduled or retained provider snapshots. This is distinct from
the separately encrypted local recovery copies. Recheck that inventory after
provider or plan changes; do not promise capabilities inferred from a plan name.

The existing operator procedure reads production with verified TLS and a
read-only transaction default, streams a custom-format dump into AES-256-GCM,
and stores its independent random key in a separate private directory. A manifest
records the ciphertext checksum, authentication tag, original creation time and
migration history. No plaintext archive is retained. Each new copy is decrypted
and restored into an isolated local PostgreSQL cluster before receiving a passed
restore attestation; the temporary cluster and plaintext are then removed.

Before a schema release, additionally upgrade that isolated copy, compare every
original column fingerprint, and execute [protected restoration](RETENTION_OPERATIONS.md).
Keep outbound delivery disabled throughout. Successful replay never authorizes
restored sessions, grants or public traffic.

## Daily operation

The configured private launchd job runs daily and at load. It refreshes a recovery
copy when the latest verified copy is older than 20 hours, rehearses the restore,
then runs expiry. It uses an explicitly installed private copy of the versioned
operator module and recorded migration checksums, so it does not depend on an
interactive application's access to the development workspace. Record the module
checksum and refresh the installed migration checksums during schema releases.

Inspect the private receipt, last exit status and error log after installation,
release, restart and a missed deadline. A successful run records completion time,
whether a copy was refreshed, inventory/expiry counts and the retained verified
copy. A failure leaves a nonzero exit and requires investigation; it does not
silently dispose of the last recovery copy or send an unsolicited notification.
The workstation must be awake and the operator account logged in. This is a
verified local scheduled job, not a claim of continuous cloud execution. After a
long outage, run and verify it immediately and record any policy deadline missed.

The versioned `scripts/backup-retention.mjs` accepts `--inspect` (the default) or
explicit `--apply`, using operator-configured `GC_BACKUP_DIRECTORY` and
`GC_BACKUP_KEY_DIRECTORY`. Both directories must be separate, private and free
of symbolic links. Files require private permissions and no hard links.

Expiry starts at 28 days, leaving a two-day margin before the 30-day policy maximum. It
requires a newer authenticated, restore-verified copy. It verifies ciphertext
checksums and GCM authentication in constant memory, without writing decrypted
bytes. An original-age ledger prevents known copied or renamed ciphertext from
acquiring a new retention clock. The durable retirement record precedes unlink;
the manifest remains until its archive and unreferenced key are removed, allowing
interrupted cleanup to resume. Shared keys survive while a retained copy needs
them. Retired hash records expire 90 days after retirement.

Unknown files, incomplete sets, invalid permissions or a held lock stop expiry.
Inspect the specific private inventory; do not delete or recreate an age ledger
to evade a failure. Confirm the owning process has exited before removing an
abandoned lock. Preserve evidence of incomplete backups and establish a verified
current recovery copy before repairing their inventory.

## Verification receipt

Seven focused tests pass, covering the exact expiry boundary, sole-copy refusal,
wrong keys/corruption, copied ages, shared keys, interruption after archive/key
removal, unsafe files and lock contention. The actual pre-release production copy
restored through migrations 36 to 42; all 81 original tables' column fingerprints
matched and protected replay passed. The first installed daily expiry run
authenticated 13 current sets, found zero eligible sets or issues, retained the
fresh verified copy and removed zero real backups. No production database writes
were made. These are actual operator checks; expiry of aged data was exercised
with isolated encrypted fixtures, since the actual sets are only two days old.
