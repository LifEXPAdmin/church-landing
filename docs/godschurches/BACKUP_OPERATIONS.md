# Encrypted recovery copies and expiry

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
