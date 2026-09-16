import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
mkdirSync(".account-test", { recursive: true, mode: 0o700 });
const dir = mkdtempSync(resolve(".account-test/workspace-"));
// Preserve disposable PostgreSQL/WAL data outside Next.js file enumeration.
const clusterRoot = mkdtempSync(join(tmpdir(), "godschurches-security-"));
const databaseDirectory = join(clusterRoot, "pg");
writeFileSync(
  join(dir, "cluster.json"),
  JSON.stringify({ databaseDirectory }),
  { mode: 0o600 }
);
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
  RETENTION_TEST_DIR: join(dir, "retention"),
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
    databaseDirectory,
    "-A",
    "trust",
    "-U",
    "fixture",
    "--no-locale",
    "--encoding=UTF8"
  ]);
  run(join(pg, "pg_ctl"), [
    "-D",
    databaseDirectory,
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
    `INSERT INTO "PlatformUser" (id,email,username,name,"passwordHash",role,"updatedAt") VALUES ('fixture-upgrade','fixture-upgrade@example.test','fixture_upgrade','Fictional retained account','not-a-login-hash','BELIEVER',CURRENT_TIMESTAMP); INSERT INTO "PlatformUser" (id,email,username,name,role,"updatedAt") VALUES ('fixture-upgrade-second','fixture-upgrade-second@example.test','fixture_second','Fictional second account','BELIEVER',CURRENT_TIMESTAMP); INSERT INTO "PlatformFollow" (id,"followerId","followingId") VALUES ('fixture-retained-follow','fixture-upgrade','fixture-upgrade-second'); INSERT INTO "PlatformPost" (id,"authorId",content,"updatedAt") VALUES ('fixture-retained-post','fixture-upgrade','Retained published content',CURRENT_TIMESTAMP); INSERT INTO "PlatformPostComment" (id,"postId","authorId",content) VALUES ('fixture-retained-comment','fixture-retained-post','fixture-upgrade-second','Retained legacy comment');`
  ]);
  // Freeze the existing account projection before the additive migration.
  const retainedUserColumns = sql([
    "-Atc",
    "SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='PlatformUser'"
  ]).trim();
  // Exercise the second Exchange migration with published old-schema rows,
  // including a three-decimal price and the original item-policy confirmation.
  sql([
    "-c",
    `INSERT INTO "ExchangeListing" (id,"updatedAt","ownerId","creatorId",state,intent,title,description,category,condition,currency,"priceMinor",country,"placeId","placeLabel","itemPolicy","confirmedAt","publishedAt") VALUES
    ('fixture-retained-free',CURRENT_TIMESTAMP,'fixture-upgrade','fixture-upgrade','ACTIVE','FREE','Retained free books','Old published item','BOOKS','GOOD',NULL,NULL,'US',4887398,'Chicago','ordinary-items-v1',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('fixture-retained-sale',CURRENT_TIMESTAMP,'fixture-upgrade','fixture-upgrade','ACTIVE','SALE','Retained sale books','Old published paid item','BOOKS','GOOD','KWD',1001,'US',4887398,'Chicago','ordinary-items-v1',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
  ]);
  const retainedExchangeColumns = sql([
    "-Atc",
    "SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='ExchangeListing'"
  ]).trim();
  const fingerprint = (url) =>
    sql(
      [
        "-Atc",
        `SELECT md5(string_agg(row::text, '' ORDER BY row::text)) FROM (SELECT to_jsonb(t) AS row FROM (SELECT ${retainedUserColumns} FROM "PlatformUser") t WHERE id='fixture-upgrade' UNION ALL SELECT to_jsonb(t) - ARRAY['contentNote','safeExcerpt','topicCommunityId','discoveryLanguage','discoveryDenomination','discoveryCountry','discoveryPlaceId','discoveryRegion','discoveryLatitude','discoveryLongitude','discoveryVersion'] FROM "PlatformPost" t WHERE id='fixture-retained-post' UNION ALL SELECT to_jsonb(t) - ARRAY['parentId','rootId','version','editedAt','deletedAt','authorChurchId','topicCommunityId'] FROM "PlatformPostComment" t WHERE id='fixture-retained-comment' UNION ALL SELECT to_jsonb(t) FROM "PlatformFollow" t WHERE id='fixture-retained-follow' UNION ALL SELECT to_jsonb(t) FROM (SELECT ${retainedExchangeColumns} FROM "ExchangeListing") t WHERE id IN ('fixture-retained-free','fixture-retained-sale')) t`
      ],
      url
    );
  const prior = fingerprint();
  sql(["-f", `prisma/migrations/${migrations.at(-1)}/migration.sql`]);
  if (prior !== fingerprint())
    throw Error(
      "Additive migration changed existing account/post/Exchange data"
    );
  if (
    sql([
      "-Atc",
      `SELECT count(*) FROM "ExchangeListing" WHERE id IN ('fixture-retained-free','fixture-retained-sale') AND "requestedItems"='' AND "neededBy" IS NULL AND "serviceArea"='' AND availability='' AND qualifications='' AND "servicePricing" IS NULL AND "serviceUnit" IS NULL`
    ]).trim() !== "2"
  )
    throw Error("Existing items acquired unexpected request or service fields");
  console.log(
    `PASS: ${migrations.length} migrations and populated upgrade preservation`
  );
  const files = process.argv.includes("--following-lists")
    ? ["tests/following-lists.test.ts", "tests/discovery-feeds.test.ts", "tests/four-feeds.test.ts"]
    : process.argv.includes("--exchange-handoffs")
    ? ["tests/exchange-handoff-input.test.ts", "tests/exchange-handoffs.test.ts", "tests/notification-consumer.test.ts"]
    : process.argv.includes("--exchange")
    ? [
        "tests/exchange-handoff-input.test.ts",
        "tests/exchange-handoffs.test.ts",
        "tests/exchange-input.test.ts",
        "tests/exchange-listings.test.ts",
        "tests/activity.test.ts",
        "tests/push-subscriptions.test.ts",
        "tests/notification-integration.test.ts",
        "tests/notification-outbox.test.ts",
        "tests/notification-source-batch.test.ts",
        "tests/comment-notifications.test.ts",
        ...(process.argv.includes("--exchange-cost")
          ? ["tests/exchange-query-cost.ts"]
          : [])
      ]
    : process.argv.includes("--discovery")
      ? [
          "tests/discovery-options.test.ts",
          "tests/discovery-feeds.test.ts",
          "tests/four-feeds.test.ts",
          "tests/post-workspace.test.ts",
          "tests/content-withdrawal.test.ts",
          "tests/retention-controls.test.ts"
        ]
      : process.argv.includes("--topics")
        ? [
            "tests/topic-communities.test.ts",
            "tests/post-workspace.test.ts",
            "tests/community-report-review.test.ts",
            "tests/retention-controls.test.ts"
          ]
        : process.argv.includes("--media")
          ? [
              "tests/media-processing.test.ts",
              "tests/media.test.ts",
              "tests/media-boundary.test.ts",
              "tests/media-maintenance.test.ts"
            ]
          : [
              ...(process.argv.includes("--invitations")
                ? [
                    "tests/friend-invitations.test.ts",
                    "tests/social-foundations.test.ts"
                  ]
                : process.argv.includes("--social")
                  ? [
                      "tests/social-foundations.test.ts",
                      "tests/gallery-sharing.test.ts"
                    ]
                  : ["tests/post-workspace.test.ts"]),
              "tests/post-publishing.test.ts",
              "tests/community-search.test.ts",
              ...(process.argv.includes("--activity-limits")
                ? [
                    "tests/social-activity-limits.test.ts",
                    "tests/operational-health.test.ts",
                    "tests/social-foundations.test.ts",
                    "tests/community-reports.test.ts",
                    "tests/friend-invitations.test.ts"
                  ]
                : []),
              ...(process.argv.includes("--content-notes")
                ? [
                    "tests/post-content-notes.test.ts",
                    "tests/draft-controller.test.ts",
                    "tests/post-editor.test.ts",
                    "tests/gallery-sharing.test.ts",
                    "tests/content-withdrawal.test.ts"
                  ]
                : [])
            ];
  for (const file of files) {
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
  const socialTables = [
    ...(process.argv.includes("--exchange")
      ? [
          "ExchangeListing",
          "ExchangeListingAudit",
          "ExchangeFavorite",
          "ExchangeSavedSearch",
          "ExchangeSearchMatch",
          "MediaAsset",
          "MediaGarbage"
        ]
      : []),
    "TopicCommunity",
    "TopicMembership",
    "TopicAudit",
    "FriendInvitation",
    "FriendAcceptance",
    "SocialRelationship",
    "SocialPreferences",
    "SocialOperation",
    "PlatformPostComment",
    "CommentLike",
    "CommentMention",
    "CommentPin",
    "ConversationPreference",
    "PrivateCommentDraft",
    "SocialEvent"
  ];
  const socialEvidence = (url) =>
    socialTables
      .map((table) =>
        sql(
          [
            "-Atc",
            `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) FROM "${table}" t`
          ],
          url
        )
      )
      .join("\n");
  if (socialEvidence() !== socialEvidence(restored))
    throw Error("Restore changed social records");
  const evidence = (url) =>
    sql(
      [
        "-Atc",
        `SELECT jsonb_build_object('drafts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "ownerId",id) FROM "PrivatePostDraft" t),'collections',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "ownerId",id) FROM "SavedPostCollection" t),'items',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "SavedPostItem" t),'operations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY "ownerId",key) FROM "PostWorkspaceOperation" t),'constraints',(SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid IN ('"TopicCommunity"'::regclass,'"TopicMembership"'::regclass,'"TopicAudit"'::regclass,'"FriendInvitation"'::regclass,'"FriendAcceptance"'::regclass,'"PrivatePostDraft"'::regclass,'"SavedPostCollection"'::regclass,'"SavedPostItem"'::regclass,'"PostWorkspaceOperation"'::regclass)))`
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
      databaseDirectory,
      "-m",
      "fast",
      "-w",
      "stop"
    ]);
}
