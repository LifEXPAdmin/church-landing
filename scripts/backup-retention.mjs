import {
  inspectBackupRetention,
  expireBackups
} from "../lib/operations/backup-retention.ts";
const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && !["--inspect", "--apply"].includes(args[0])))
  throw Error(
    "Use --inspect or --apply with the configured backup directories."
  );
const backupDirectory = process.env.GC_BACKUP_DIRECTORY,
  keyDirectory = process.env.GC_BACKUP_KEY_DIRECTORY;
if (!backupDirectory || !keyDirectory)
  throw Error("Configure the private backup and key directories first.");
try {
  const result = await (
    args[0] === "--apply" ? expireBackups : inspectBackupRetention
  )({ backupDirectory, keyDirectory });
  console.log(JSON.stringify(result));
  if (result.issues.length) process.exitCode = 2;
} catch {
  console.error(
    "Backup expiry did not complete. Preserve the current recovery copy and inspect the private inventory."
  );
  process.exitCode = 1;
}
