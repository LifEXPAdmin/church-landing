import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
mkdirSync(".account-test", { recursive: true, mode: 0o700 });
const dir = mkdtempSync(resolve(".account-test/workspace-"));
const socket = createServer();
await new Promise((r) => socket.listen(0, "127.0.0.1", r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const database = `postgresql://fixture@127.0.0.1:${port}/godschurches_security_test`;
const env = {
  ...process.env,
  DATABASE_URL: database,
  DIRECT_URL: database,
  NODE_ENV: "test",
  VERCEL: "",
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  ACCOUNT_TEST_SINK_DIR: join(dir, "sink"),
  ACCOUNT_ORIGIN: "https://127.0.0.1:9443",
  NEXT_PUBLIC_SITE_URL: "https://127.0.0.1:9443",
  AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
  MAILERLITE_API_KEY: "",
  RESEND_API_KEY: "",
  ACCOUNT_EMAIL_FROM: "",
  ACCOUNT_GOOGLE_ENABLED: "false",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: join(dir, "images"),
  CHURCH_CLAIM_REVIEW_ENABLED: "true",
  CHURCH_CLAIM_POLICY_VERSION: "manual-review-v1",
  SUPPORT_INTAKE_ENABLED: "false"
};
function run(cmd, args, extra = {}) {
  const r = spawnSync(cmd, args, { env, encoding: "utf8", ...extra });
  if (r.status !== 0) {
    writeFileSync(
      join(dir, "failure.log"),
      `${r.stdout ?? ""}\n${r.stderr ?? ""}`,
      { mode: 0o600 }
    );
    throw Error(`Isolated check failed: ${cmd}; ${dir}/failure.log`);
  }
  return r.stdout;
}
let started = false;
try {
  run(join(pg, "initdb"), [
    "-D",
    join(dir, "pg"),
    "-A",
    "trust",
    "-U",
    "fixture",
    "--no-locale",
    "--encoding=UTF8"
  ]);
  run(join(pg, "pg_ctl"), [
    "-D",
    join(dir, "pg"),
    "-l",
    join(dir, "pg.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`,
    "-w",
    "start"
  ]);
  started = true;
  const create = (name) =>
    run(join(pg, "createdb"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      "fixture",
      name
    ]);
  const sql = (args, url = database) =>
    run(join(pg, "psql"), [url, "-v", "ON_ERROR_STOP=1", ...args]);
  create("godschurches_security_test");
  const migrations = readdirSync("prisma/migrations")
    .filter((n) => /^\d/.test(n))
    .sort();
  for (const name of migrations.slice(0, -1))
    sql(["-f", `prisma/migrations/${name}/migration.sql`]);
  sql([
    "-c",
    `INSERT INTO "PlatformUser" (id,email,username,name,"passwordHash",role,"updatedAt") VALUES ('fixture-upgrade','fixture-upgrade@example.test','fixture_upgrade','Fictional retained account','not-a-login-hash','BELIEVER',CURRENT_TIMESTAMP); INSERT INTO "PlatformPost" (id,"authorId",content,"updatedAt") VALUES ('fixture-retained-post','fixture-upgrade','Retained published content',CURRENT_TIMESTAMP);`
  ]);
  const fingerprint = (url) =>
    sql(
      [
        "-Atc",
        `SELECT md5(string_agg(row::text, '' ORDER BY row::text)) FROM (SELECT to_jsonb(t) AS row FROM "PlatformUser" t WHERE id='fixture-upgrade' UNION ALL SELECT to_jsonb(t) FROM "PlatformPost" t WHERE id='fixture-retained-post') t`
      ],
      url
    );
  const prior = fingerprint();
  sql(["-f", `prisma/migrations/${migrations.at(-1)}/migration.sql`]);
  if (prior !== fingerprint())
    throw Error("Additive migration changed existing account/post data");
  console.log(
    `PASS: ${migrations.length} migrations and populated upgrade preservation`
  );
  for (const file of [
    "tests/post-workspace.test.ts",
    "tests/post-publishing.test.ts",
    "tests/community-search.test.ts"
  ]) {
    sql(["-c", 'TRUNCATE "PlatformAuthLimit"']);
    run(
      process.execPath,
      ["--import", "./tests/register.mjs", "--test", file],
      { stdio: "inherit" }
    );
  }
  const restored = database.replace(
    /godschurches_security_test$/,
    "godschurches_security_test_restore"
  );
  create("godschurches_security_test_restore");
  const dump = join(dir, "fixture.dump");
  run(join(pg, "pg_dump"), ["-Fc", "-f", dump, database]);
  run(join(pg, "pg_restore"), [
    "--no-owner",
    "--no-acl",
    "--exit-on-error",
    "-d",
    restored,
    dump
  ]);
  const evidence = (url) =>
    sql(
      [
        "-Atc",
        `SELECT jsonb_build_object('drafts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "ownerId",id) FROM "PrivatePostDraft" t),'collections',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "ownerId",id) FROM "SavedPostCollection" t),'items',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "SavedPostItem" t),'operations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "ownerId",key) FROM "PostWorkspaceOperation" t),'constraints',(SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid IN ('"PrivatePostDraft"'::regclass,'"SavedPostCollection"'::regclass,'"SavedPostItem"'::regclass,'"PostWorkspaceOperation"'::regclass)))`
      ],
      url
    );
  if (evidence() !== evidence(restored))
    throw Error("Restore changed workspace data or constraints");
  console.log(
    "PASS: workspace dump/restore preserves drafts, tombstones, collections, saved items, retry receipts and constraints. Production writes: 0."
  );
} finally {
  if (started)
    run(join(pg, "pg_ctl"), [
      "-D",
      join(dir, "pg"),
      "-m",
      "fast",
      "-w",
      "stop"
    ]);
}
