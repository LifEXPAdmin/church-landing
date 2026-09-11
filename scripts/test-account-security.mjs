import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  readdirSync,
  existsSync
} from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer, get as httpsGet } from "node:https";
import { randomBytes } from "node:crypto";

const root = process.cwd();
const supportTests = process.argv.includes("--support");
const portalTests = supportTests || process.argv.includes("--portal");
const preview = process.argv.includes("--preview");
const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
if (!existsSync(join(pg, "initdb")))
  throw new Error(
    "Install local PostgreSQL or set TEST_PG_BIN to its bin directory. No external database is used."
  );
mkdirSync(".account-test", { recursive: true, mode: 0o700 });
const dir = mkdtempSync(resolve(".account-test/run-"));
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const port = await freePort();
const appPort = await freePort();
const database = `postgresql://fixture@127.0.0.1:${port}/godschurches_security_test`;
const env = {
  ...process.env,
  NODE_ENV: "test",
  VERCEL: "",
  DATABASE_URL: database,
  DIRECT_URL: database,
  ACCOUNT_ORIGIN: `http://127.0.0.1:${appPort}`,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${appPort}`,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_TEST_SINK_DIR: join(dir, "sink"),
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: join(dir, "images"),
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: "",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
  MAILERLITE_API_KEY: "",
  RESEND_API_KEY: "",
  ACCOUNT_EMAIL_FROM: "",
  ACCOUNT_GOOGLE_ENABLED: "false",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  CHURCH_CLAIM_REVIEW_ENABLED: "true",
  CHURCH_CLAIM_POLICY_VERSION: "manual-review-v1",
  SUPPORT_INTAKE_ENABLED: supportTests ? "true" : "false"
};
const log = join(dir, "setup.log");
function run(cmd, args, overrides = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    env,
    encoding: "utf8",
    ...overrides
  });
  if (r.status !== 0) {
    // Only generated synthetic state is used here; keep verbose tooling output local.
    writeFileSync(log, `${r.stdout ?? ""}\n${r.stderr ?? ""}`, { mode: 0o600 });
    throw new Error(`Local check failed: ${cmd}. Details in ${log}`);
  }
  return r.stdout;
}
let server;
let testProcess;
let proxy;
let previewOrigin = env.ACCOUNT_ORIGIN;
const proxySockets = new Set();
const proxyRequests = new Set();
let databaseStarted = false;
async function stopChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  await new Promise((resolve) => {
    const force = setTimeout(() => child.kill("SIGKILL"), 5000);
    force.unref();
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
async function stopProxy() {
  for (const request of proxyRequests) request.destroy();
  for (const socket of proxySockets) socket.destroy();
  if (proxy?.listening) await new Promise((resolve) => proxy.close(resolve));
}
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
  databaseStarted = true;
  run(join(pg, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fixture",
    "godschurches_security_test"
  ]);
  const psql = (args, url = database) =>
    run(join(pg, "psql"), [url, "-v", "ON_ERROR_STOP=1", ...args]);
  const clearLimits = () => psql(["-c", 'TRUNCATE "PlatformAuthLimit"']);
  const runTests = async (file, testEnv = env) => {
    clearLimits();
    // Keep the event loop available when this process serves the local HTTPS proxy.
    await new Promise((resolve, reject) => {
      testProcess = spawn(
        process.execPath,
        ["--import", "./tests/register.mjs", "--test", file],
        { cwd: root, env: testEnv, stdio: "inherit" }
      );
      testProcess.once("error", reject);
      testProcess.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `Local tests failed: ${file}; see test diagnostics above`
              )
            )
      );
    });
    testProcess = undefined;
    clearLimits();
  };
  const accountTables = [
    ["PlatformUser", "id"],
    ["PlatformSession", "id"],
    ["PlatformAccountGrant", "id"],
    ["PlatformAuthLimit", "key"],
    ["PlatformPost", "id"],
    ["PlatformPostComment", "id"],
    ["PlatformPostLike", "id"],
    ["PlatformFollow", "id"]
  ];
  const emailTables = [["PlatformEmailChange", "id"]];
  const googleTables = [
    ["PlatformGoogleIdentity", "id"],
    ["PlatformGoogleAttempt", "id"],
    ["PlatformRecentAuthentication", "id"]
  ];
  const churchTables = [
    ["Church", "id"],
    ["ChurchConnection", "id"],
    ["ChurchDirectoryPreference", "connectionId"],
    ["ChurchCapabilityGrant", "id"],
    ["PlatformOperatorGrant", "id"],
    ["ChurchContactAssignment", "id"],
    ["ChurchAuditEvent", "id"]
  ];
  const listingTables = [
    ["ChurchListingSubmission", "id"],
    ["ChurchListingDecision", "id"],
    ["ChurchClaim", "id"],
    ["ChurchClaimDecision", "id"],
    ["ChurchPosition", "id"],
    ["ChurchPositionAssignment", "id"],
    ["ChurchRoleTemplate", "id"],
    ["ChurchRoleRevision", "templateId"],
    ["ChurchRoleGrant", "id"],
    ["ChurchAssignmentSave", "requestKey"],
    ["ChurchChartSave", "requestKey"],
    ["PlatformCalendar", "id"],
    ["CalendarEvent", "id"],
    ["CalendarOccurrence", "id"],
    ["CalendarShare", "id"],
    ["CalendarEventShare", "id"],
    ["CalendarResponse", "id"],
    ["CalendarAudit", "id"],
    ["PostAudit", "id"],
    ["PostPoll", "id"],
    ["PostPollOption", "id"],
    ["PostPollBallot", "id"],
    ["PostVolunteerSlot", "id"],
    ["PostVolunteerSignup", "id"],
    ["MediaAsset", "id"],
    ["MediaGarbage", "storagePrefix"],
    ["ProfilePresentation", "userId"],
    ["PrivatePostDraft", "id"],
    ["SavedPostCollection", "id"],
    ["SavedPostItem", "id"],
    ["PostWorkspaceOperation", "key"],
    ...[
      "SocialRelationship",
      "SocialOperation",
      "SocialPreferences",
      "CommentLike",
      "CommentMention",
      "CommentPin",
      "ConversationPreference",
      "PrivateCommentDraft",
      "SocialEvent"
    ].map((name) => [
      name,
      name === "SocialPreferences"
        ? "ownerId"
        : name === "CommentPin"
          ? "postId"
          : name === "SocialOperation"
            ? "key"
            : "id"
    ])
  ];
  const supportTables = [
    ["SupportCapabilityGrant", "id"],
    ["SupportIntakeSetting", "id"],
    ["SupportCase", "id"],
    ["SupportCoordinatorShare", "caseId"],
    ["SupportMessage", "id"],
    ["SupportRead", "caseId"],
    ["SupportOperation", "id"],
    ["SupportAuditEvent", "id"]
  ];
  const fingerprint = (table, key, url = database, beforeChurch = false) => {
    const row =
      beforeChurch && table === "PlatformUser"
        ? `to_jsonb(t) - ARRAY['deactivatedAt','suspendedAt','adultAcknowledgedAt','adultPolicyVersion','portalVersion']`
        : beforeChurch && table === "PlatformPostComment"
          ? `to_jsonb(t) - ARRAY['parentId','rootId','version','editedAt','deletedAt','authorChurchId']`
          : beforeChurch && table === "PlatformPost"
            ? `jsonb_build_object('id',t.id,'createdAt',t."createdAt",'updatedAt',t."updatedAt",'authorId',t."authorId",'type',t.type,'content',t.content,'scripture',t.scripture)`
            : "to_jsonb(t)";
    return psql(
      [
        "-Atc",
        `SELECT md5(COALESCE(jsonb_agg(${row} ORDER BY t."${key}", to_jsonb(t)::text)::text, '[]')) FROM "${table}" t`
      ],
      url
    );
  };
  const churchNames = [
    ...churchTables,
    ...listingTables,
    ...supportTables,
    ...emailTables,
    ...googleTables
  ]
    .map(([name]) => `'${name}'`)
    .join(",");
  const constraintFingerprint = (url) =>
    psql(
      [
        "-Atc",
        `
    SELECT jsonb_agg(t ORDER BY t.kind, t.name)::text FROM (
      SELECT 'index' AS kind, indexname AS name, indexdef AS definition FROM pg_indexes
      WHERE schemaname = 'public' AND tablename IN (${churchNames})
      UNION ALL
      SELECT 'constraint', c.conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = 'public' AND r.relname IN (${churchNames})
      UNION ALL
      SELECT 'trigger', t.tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid WHERE r.relname IN ('SupportCase','SupportCapabilityGrant','ChurchPosition','PlatformPostComment') AND NOT t.tgisinternal
      UNION ALL SELECT 'function', p.proname, pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('church_position_acyclic','comment_thread_shape')
    ) t`
      ],
      url
    );
  const checkChurchConstraints = (url) => {
    const result = psql(
      [
        "-Atc",
        `SELECT
      (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'
       AND indexname = 'ChurchConnection_one_active_user'
       AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%PENDING%'
       AND indexdef LIKE '%APPROVED%') = 1
      AND (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = 'public' AND c.convalidated AND c.contype = 'c'
       AND c.conname IN ('ChurchConnection_positive_version', 'ChurchContactAssignment_membership_required')) = 2`
      ],
      url
    );
    if (result.trim() !== "t")
      throw new Error(
        "Missing combined affiliation index or church constraints"
      );
    for (const [table] of churchTables)
      psql(["-Atc", `SELECT count(*) FROM "${table}"`], url);
  };
  // Upgrade rehearsal: previous SQL state with synthetic legacy/password accounts and relationships.
  const migrations = readdirSync("prisma/migrations")
    .filter((n) => n.startsWith("20"))
    .sort();
  const accountMigration = migrations.indexOf(
    "20260907180000_account_security"
  );
  if (
    accountMigration < 0 ||
    !migrations.includes("20260908032000_church_portal")
  )
    throw new Error("Expected Stage2A and Stage2B migrations are required");
  for (const name of migrations.slice(0, accountMigration))
    psql(["-f", `prisma/migrations/${name}/migration.sql`]);
  run(process.execPath, [
    "--import",
    "./tests/register.mjs",
    "tests/seed-upgrade.ts"
  ]);
  psql([
    "-f",
    `prisma/migrations/${migrations[accountMigration]}/migration.sql`
  ]);
  console.log(
    run(process.execPath, [
      "--import",
      "./tests/register.mjs",
      "tests/seed-stage2a.ts"
    ]).trim()
  );
  const stage2a = accountTables.map(([table, key]) =>
    fingerprint(table, key, database, true)
  );
  // Apply every remaining migration even in account-only mode: the client uses the full schema.
  for (const name of migrations.slice(accountMigration + 1)) {
    if (name === "20260909010000_ordinary_support") {
      // Actual seven-migration Stage2B schema, populated before support tables exist.
      psql([
        "-c",
        `INSERT INTO "Church" (id,name,slug,summary) VALUES ('fixture-stage2b-church','Fictional upgrade church','fixture-stage2b-church','Synthetic upgrade only');
        INSERT INTO "ChurchConnection" (id,"userId","churchId",state,"updatedAt") VALUES ('fixture-stage2b-connection','fixture-existing','fixture-stage2b-church','PENDING',CURRENT_TIMESTAMP);`
      ]);
      const prior = [...accountTables, ...churchTables].map(([t, k]) =>
        fingerprint(t, k)
      );
      psql(["-f", `prisma/migrations/${name}/migration.sql`]);
      for (const [i, [t, k]] of [...accountTables, ...churchTables].entries())
        if (prior[i] !== fingerprint(t, k))
          throw new Error("Stage2C upgrade changed existing rows: " + t);
      console.log(
        "Actual Stage2B -> Stage2C additive upgrade preserved account and church fingerprints."
      );
    } else if (name === "20260910173000_church_role_templates") {
      psql([
        "-c",
        `INSERT INTO "ChurchPosition" (id,"churchId",name,description,"requestKey","updatedAt") VALUES ('fixture-role-upgrade-root','fixture-stage2b-church','Existing leadership','Keep published duties','fixture-role-root',CURRENT_TIMESTAMP);
        INSERT INTO "ChurchPosition" (id,"churchId","parentId",name,description,"requestKey","updatedAt") VALUES ('fixture-role-upgrade-child','fixture-stage2b-church','fixture-role-upgrade-root','Existing outreach','Keep reporting link','fixture-role-child',CURRENT_TIMESTAMP);
        INSERT INTO "ChurchPositionAssignment" (id,"churchId","positionId","connectionId") VALUES ('fixture-role-upgrade-appointment','fixture-stage2b-church','fixture-role-upgrade-child','fixture-stage2b-connection');
        INSERT INTO "ChurchCapabilityGrant" (id,"churchId","userId",capability) VALUES ('fixture-role-upgrade-grant','fixture-stage2b-church','fixture-existing','MANAGE_STRUCTURE');`
      ]);
      const positions = () =>
        psql([
          "-Atc",
          `SELECT md5(jsonb_agg(to_jsonb(t) - ARRAY['roleTemplateId','roleTemplateVersion'] ORDER BY id)::text) FROM "ChurchPosition" t`
        ]);
      const prior = [
        positions(),
        fingerprint("ChurchPositionAssignment", "id"),
        fingerprint("ChurchCapabilityGrant", "id")
      ];
      psql(["-f", `prisma/migrations/${name}/migration.sql`]);
      const after = [
        positions(),
        fingerprint("ChurchPositionAssignment", "id"),
        fingerprint("ChurchCapabilityGrant", "id")
      ];
      if (JSON.stringify(prior) !== JSON.stringify(after))
        throw new Error(
          "Role-library upgrade changed published positions, appointments or grants"
        );
      if (
        psql([
          "-Atc",
          `SELECT count(*) FROM "ChurchPosition" WHERE "roleTemplateId" IS NOT NULL OR "roleTemplateVersion" IS NOT NULL`
        ]).trim() !== "0"
      )
        throw new Error(
          "Existing positions unexpectedly gained role references"
        );
      console.log(
        "Role-library additive upgrade preserved populated position IDs, reporting edges, responsibilities, appointments and independent grants."
      );
    } else if (name === "20260910190000_church_assignment_permissions") {
      const appointments = () =>
        psql([
          "-Atc",
          `SELECT md5(jsonb_agg(to_jsonb(t) - 'version' ORDER BY id)::text) FROM "ChurchPositionAssignment" t`
        ]);
      const prior = [
        appointments(),
        fingerprint("ChurchCapabilityGrant", "id"),
        fingerprint("ChurchPosition", "id")
      ];
      psql(["-f", `prisma/migrations/${name}/migration.sql`]);
      const after = [
        appointments(),
        fingerprint("ChurchCapabilityGrant", "id"),
        fingerprint("ChurchPosition", "id")
      ];
      if (JSON.stringify(prior) !== JSON.stringify(after))
        throw new Error(
          "Assignment permissions migration changed existing positions, appointments or independent grants"
        );
      if (
        psql(["-Atc", `SELECT count(*) FROM "ChurchRoleGrant"`]).trim() !== "0"
      )
        throw new Error("Migration created implicit role permissions");
      console.log(
        "Assignment permissions additive upgrade preserves existing appointments and direct grants, with no inferred permissions."
      );
    } else if (name === "20260910220000_church_position_placement") {
      const positions = () =>
        psql([
          "-Atc",
          `SELECT md5(jsonb_agg(to_jsonb(t) - 'placement' ORDER BY id)::text) FROM "ChurchPosition" t`
        ]);
      const sources = () => [
        positions(),
        fingerprint("ChurchPositionAssignment", "id"),
        fingerprint("ChurchRoleGrant", "id"),
        fingerprint("ChurchCapabilityGrant", "id")
      ];
      const prior = sources();
      psql(["-f", `prisma/migrations/${name}/migration.sql`]);
      if (JSON.stringify(prior) !== JSON.stringify(sources()))
        throw new Error(
          "Placement upgrade changed published positions, reporting lines, assignments or grants"
        );
      const placements = psql([
        "-Atc",
        `SELECT id || ':' || placement FROM "ChurchPosition" ORDER BY id`
      ]).trim();
      if (
        placements !==
        "fixture-role-upgrade-child:REPORTING\nfixture-role-upgrade-root:ROOT"
      )
        throw new Error("Existing root/reporting placement was not preserved");
      console.log(
        "Placement additive upgrade preserved existing position, assignment and grant fingerprints; existing roots and reporting links keep their meaning."
      );
    } else if (name === "20260910225000_church_chart_saves") {
      const sources = () => [
        psql([
          "-Atc",
          `SELECT md5(jsonb_agg(to_jsonb(t) - ARRAY['chartX','chartY'] ORDER BY id)::text) FROM "ChurchPosition" t`
        ]),
        fingerprint("ChurchPositionAssignment", "id"),
        fingerprint("ChurchRoleGrant", "id"),
        fingerprint("ChurchCapabilityGrant", "id")
      ];
      const prior = sources();
      psql(["-f", `prisma/migrations/${name}/migration.sql`]);
      if (JSON.stringify(prior) !== JSON.stringify(sources()))
        throw new Error(
          "Chart upgrade changed existing positions, assignments or grants"
        );
      if (
        psql([
          "-Atc",
          `SELECT (SELECT count(*) FROM "ChurchChartSave") + (SELECT count(*) FROM "ChurchPosition" WHERE "chartX" IS NOT NULL OR "chartY" IS NOT NULL)`
        ]).trim() !== "0"
      )
        throw new Error(
          "Chart migration invented saved coordinates or history"
        );
      console.log(
        "Chart migration preserves every prior position/assignment/grant field; automatic layout and empty save history remain the default."
      );
    } else psql(["-f", `prisma/migrations/${name}/migration.sql`]);
  }
  for (const [i, [table, key]] of accountTables.entries()) {
    if (stage2a[i] !== fingerprint(table, key, database, true))
      throw new Error(`Stage2B upgrade changed prior account data: ${table}`);
  }
  const changedLegacyPostMeaning = psql([
    "-Atc",
    `SELECT count(*) FROM "PlatformPost" WHERE
      "audience" <> 'PUBLIC' OR "status" <> 'PUBLISHED' OR "version" <> 1
      OR "authorChurchId" IS NOT NULL OR "audienceChurchId" IS NOT NULL
      OR "eventOccurrenceId" IS NOT NULL OR "requestKey" IS NOT NULL
      OR cardinality("topics") <> 0 OR "publishedAt" IS DISTINCT FROM "createdAt"
      OR "withdrawnAt" IS NOT NULL OR "editedAt" IS NOT NULL
      OR "discussionClosed" OR "replyAudience" <> 'VIEWERS' OR "allowReposts"
      OR "pinUntil" IS NOT NULL OR "scheduleAt" IS NOT NULL OR "scheduledById" IS NOT NULL`
  ]).trim();
  if (changedLegacyPostMeaning !== "0")
    throw new Error("Post migration changed legacy publication meaning.");
  checkChurchConstraints(database);
  console.log(
    "Synthetic Stage1 -> Stage2A -> Stage2B upgrade preserved all prior account data."
  );
  await runTests("tests/account-security.test.ts");
  await runTests("tests/account-delivery.test.ts");
  await runTests("tests/early-community.test.ts");
  await runTests("tests/feed-gesture.test.ts");
  await runTests("tests/account-email-change.test.ts");
  await runTests("tests/google-accounts.test.ts");
  await runTests("tests/google-boundary.test.ts");
  if (portalTests) await runTests("tests/portal-service.test.ts");
  if (portalTests) await runTests("tests/church-listings.test.ts");
  if (portalTests) await runTests("tests/church-claims.test.ts");
  if (portalTests) await runTests("tests/church-structure.test.ts");
  if (portalTests) await runTests("tests/church-chart-layout.test.ts");
  if (portalTests) await runTests("tests/church-chart-model.test.ts");
  if (portalTests) await runTests("tests/church-return-context.test.ts");
  if (portalTests) await runTests("tests/church-chart-draft.test.ts");
  if (portalTests) await runTests("tests/church-chart-save.test.ts");
  if (portalTests) await runTests("tests/church-role-templates.test.ts");
  if (portalTests)
    await runTests("tests/church-assignment-permissions.test.ts");
  if (portalTests) await runTests("tests/calendars.test.ts");
  if (portalTests) await runTests("tests/post-publishing.test.ts");
  if (portalTests) await runTests("tests/post-workspace.test.ts");
  if (portalTests) await runTests("tests/community-search.test.ts");
  if (portalTests) await runTests("tests/social-foundations.test.ts");
  if (portalTests) await runTests("tests/gallery-sharing.test.ts");
  if (portalTests) await runTests("tests/install-policy.test.ts");
  if (portalTests) await runTests("tests/post-participation.test.ts");
  if (portalTests) await runTests("tests/post-editor.test.ts");
  if (portalTests) await runTests("tests/post-link-fetch.test.ts");
  if (portalTests) await runTests("tests/post-links.test.ts");
  if (portalTests) await runTests("tests/reader-navigation.test.ts");
  if (portalTests) await runTests("tests/post-reader.test.ts");
  if (portalTests) await runTests("tests/media-processing.test.ts");
  if (portalTests) await runTests("tests/media.test.ts");
  if (portalTests) await runTests("tests/media-boundary.test.ts");
  if (portalTests) await runTests("tests/profile-style.test.ts");
  if (portalTests) await runTests("tests/profiles.test.ts");
  if (supportTests) await runTests("tests/support-service.test.ts");
  run(join(pg, "pg_dump"), [
    database,
    "-Fc",
    "-f",
    join(dir, "synthetic.dump")
  ]);
  run(join(pg, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fixture",
    "godschurches_security_test_restore"
  ]);
  const restoreUrl = database + "_restore";
  run(join(pg, "pg_restore"), [
    "-d",
    restoreUrl,
    "--exit-on-error",
    join(dir, "synthetic.dump")
  ]);
  for (const [table, key] of [
    ...accountTables,
    ...emailTables,
    ...googleTables,
    ...listingTables,
    ...churchTables,
    ...supportTables
  ]) {
    const before = fingerprint(table, key);
    const restored = fingerprint(table, key, restoreUrl);
    if (before !== restored)
      throw new Error(`Synthetic restore mismatch: ${table}`);
  }
  checkChurchConstraints(restoreUrl);
  if (constraintFingerprint(database) !== constraintFingerprint(restoreUrl))
    throw new Error("Synthetic restore changed church constraints or indexes");
  console.log(
    "Synthetic backup/restore preserved account and church rows, constraints and indexes."
  );
  // A third fresh DB proves the actual Prisma migration deployment path.
  run(join(pg, "createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "fixture",
    "godschurches_security_fresh"
  ]);
  const freshUrl = database.replace(
    "godschurches_security_test",
    "godschurches_security_fresh"
  );
  run("npm", ["run", "prisma:deploy"], {
    env: { ...env, DATABASE_URL: freshUrl, DIRECT_URL: freshUrl }
  });
  checkChurchConstraints(freshUrl);
  if (constraintFingerprint(database) !== constraintFingerprint(freshUrl))
    throw new Error(
      "Fresh migration church constraints differ from upgraded schema"
    );
  for (const [table] of [
    ...accountTables,
    ...emailTables,
    ...googleTables,
    ...listingTables,
    ...churchTables,
    ...supportTables
  ]) {
    if (
      psql(["-Atc", `SELECT count(*) FROM "${table}"`], freshUrl).trim() !== "0"
    )
      throw new Error(
        `Fresh migration unexpectedly created fixture data: ${table}`
      );
  }
  console.log("Fresh Prisma migration setup passed.");
  // Production-mode compile verifies the sink cannot run there; runtime sink uses development.
  run("npm", ["run", "build"], {
    env: { ...env, NODE_ENV: "production", ACCOUNT_DELIVERY_MODE: "disabled" }
  });
  console.log("Production build passed.");
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort)
    ],
    { env: { ...env, NODE_ENV: "development" }, stdio: "ignore" }
  );
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${env.ACCOUNT_ORIGIN}/api/health`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Isolated Next server did not start");
  await runTests("tests/account-http.test.ts");
  await runTests("tests/recovery-entry-http.test.ts");
  await runTests("tests/account-email-http.test.ts");
  await runTests("tests/google-http.test.ts");
  if (portalTests) await runTests("tests/media-http.test.ts");
  if (portalTests) await runTests("tests/profiles-http.test.ts");
  if (portalTests)
    await runTests("tests/church-listing-http.test.ts", {
      ...env,
      LISTING_RENDER_PHASE: "development"
    });
  if (portalTests)
    await runTests("tests/church-claim-http.test.ts", {
      ...env,
      CLAIM_RENDER_PHASE: "development"
    });
  if (portalTests)
    await runTests("tests/church-structure-http.test.ts", {
      ...env,
      STRUCTURE_RENDER_PHASE: "development"
    });
  if (portalTests)
    await runTests("tests/calendar-http.test.ts", {
      ...env,
      CALENDAR_RENDER_PHASE: "development"
    });
  if (portalTests)
    await runTests("tests/post-publishing-http.test.ts", {
      ...env,
      POST_RENDER_PHASE: "development"
    });
  if (portalTests)
    await runTests("tests/post-editor-http.test.ts", {
      ...env,
      POST_RENDER_PHASE: "development"
    });
  if (portalTests)
    await runTests("tests/post-links-http.test.ts", {
      ...env,
      POST_RENDER_PHASE: "development"
    });
  if (portalTests)
    await runTests("tests/post-reader-http.test.ts", {
      ...env,
      POST_RENDER_PHASE: "development"
    });
  if (portalTests)
    await runTests("tests/post-participation-http.test.ts", {
      ...env,
      POST_RENDER_PHASE: "development"
    });
  if (portalTests) {
    run(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import assert from 'node:assert/strict';
      import { randomBytes } from 'node:crypto';
      const token = randomBytes(32).toString('base64url');
      for (const rsc of [false, true]) for (const guarded of ["portal", "support"]) {
        const response = await fetch(process.env.ACCOUNT_ORIGIN + (guarded === 'portal' ? '/platform/churches/fictional-guard-probe/directory' : '/platform/help/cases/fictional-guard-probe'), {
          headers: { Cookie: 'church_platform_session=' + token, ...(rsc ? { RSC: '1' } : {}) }
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), rsc ? /text\\/x-component/ : /text\\/html/);
        const body = await response.text();
        assert.ok(body.includes('Open the private ' + guarded + ' preview'), 'Development portal renders its privacy guard');
        assert.ok(!body.includes(token), 'Development privacy guard never serializes the supplied cookie');
      }
      console.log('Development portal HTML/RSC privacy guards passed without reading an account or church.');
    `
      ],
      { stdio: "inherit" }
    );
    await stopChild(server);
    server = undefined;
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
      throw new Error(
        "Portal HTTPS checks require certificate verification; remove NODE_TLS_REJECT_UNAUTHORIZED=0"
      );
    const tlsPort = await freePort();
    const productionPort = await freePort();
    const httpsOrigin = `https://127.0.0.1:${tlsPort}`;
    const certificate = join(dir, "localhost-cert.pem");
    const privateKey = join(dir, "localhost-key.pem");
    const certificateConfig = join(dir, "localhost-cert.cnf");
    writeFileSync(
      certificateConfig,
      [
        "[req]",
        "prompt = no",
        "distinguished_name = dn",
        "x509_extensions = local_tls",
        "[dn]",
        "CN = localhost",
        "[local_tls]",
        "subjectAltName = IP:127.0.0.1,DNS:localhost",
        "basicConstraints = critical,CA:TRUE",
        "keyUsage = critical,digitalSignature,keyEncipherment,keyCertSign",
        "extendedKeyUsage = serverAuth",
        ""
      ].join("\n"),
      { mode: 0o600 }
    );
    run("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-sha256",
      "-nodes",
      "-days",
      "2",
      "-config",
      certificateConfig,
      "-keyout",
      privateKey,
      "-out",
      certificate
    ]);
    chmodSync(privateKey, 0o600);
    chmodSync(certificate, 0o600);
    const portalEnv = {
      ...env,
      ACCOUNT_ORIGIN: httpsOrigin,
      NEXT_PUBLIC_SITE_URL: httpsOrigin,
      NODE_EXTRA_CA_CERTS: certificate
    };
    const productionEnv = {
      ...portalEnv,
      NODE_ENV: "production",
      ACCOUNT_DELIVERY_MODE: "disabled"
    };
    // next dev writes .next; build again only after that process has exited.
    run("npm", ["run", "build"], { env: productionEnv });
    console.log(
      "Production portal rebuilt for local HTTPS with delivery disabled."
    );
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(productionPort)
      ],
      { env: productionEnv, stdio: "ignore" }
    );
    proxy = createHttpsServer(
      { key: readFileSync(privateKey), cert: readFileSync(certificate) },
      (request, response) => {
        if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
          response.writeHead(400);
          response.end();
          return;
        }
        // The upstream address is fixed loopback, never derived from request headers or URLs.
        const headers = {
          ...request.headers,
          host: new URL(httpsOrigin).host,
          "x-forwarded-host": new URL(httpsOrigin).host,
          "x-forwarded-proto": "https",
          "x-forwarded-for": "127.0.0.1"
        };
        delete headers.forwarded;
        const upstream = httpRequest(
          {
            hostname: "127.0.0.1",
            port: productionPort,
            path: request.url,
            method: request.method,
            headers,
            agent: false
          },
          (result) => {
            response.writeHead(result.statusCode ?? 502, result.headers);
            result.once("error", () => response.destroy());
            result.pipe(response);
          }
        );
        proxyRequests.add(upstream);
        upstream.once("close", () => proxyRequests.delete(upstream));
        upstream.once("error", () => {
          if (response.destroyed) return;
          if (response.headersSent) response.destroy();
          else {
            response.writeHead(502, { "Cache-Control": "no-store" });
            response.end("Local production server unavailable.");
          }
        });
        upstream.setTimeout(30000, () => upstream.destroy());
        request.once("aborted", () => upstream.destroy());
        response.once("close", () => upstream.destroy());
        request.pipe(upstream);
      }
    );
    proxy.on("connection", (socket) => {
      proxySockets.add(socket);
      socket.once("close", () => proxySockets.delete(socket));
    });
    await new Promise((resolve, reject) => {
      proxy.once("error", reject);
      proxy.listen(tlsPort, "127.0.0.1", resolve);
    });
    let productionReady = false;
    for (let i = 0; i < 80; i++) {
      productionReady = await new Promise((resolve) => {
        const request = httpsGet(
          `${httpsOrigin}/api/health`,
          { ca: readFileSync(certificate), timeout: 3000 },
          (response) => {
            response.resume();
            resolve(response.statusCode === 200);
          }
        );
        request.once("error", () => resolve(false));
        request.once("timeout", () => {
          request.destroy();
          resolve(false);
        });
      });
      if (productionReady) break;
      if (server.exitCode !== null || server.signalCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!productionReady)
      throw new Error("Isolated production HTTPS portal did not start");
    await runTests("tests/account-repair.test.ts", productionEnv);
    await runTests("tests/recovery-entry-http.test.ts", productionEnv);
    const previousPid = server.pid;
    await stopChild(server);
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(productionPort)
      ],
      { env: productionEnv, stdio: "ignore" }
    );
    if (server.pid === previousPid)
      throw new Error("Restart did not create a new process");
    let restarted = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${productionPort}/api/health`)).ok) {
          restarted = true;
          break;
        }
      } catch {
        /* starting */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!restarted) throw new Error("Production server restart failed");
    await runTests("tests/account-restart.test.ts", productionEnv);
    await runTests("tests/account-sessions.test.ts", productionEnv);
    await runTests("tests/account-export.test.ts", productionEnv);
    await runTests("tests/account-lifecycle.test.ts", productionEnv);
    await runTests("tests/account-email-http.test.ts", productionEnv);
    await runTests("tests/google-http.test.ts", productionEnv);
    console.log(
      "Account/profile/session persistence passed after a new production server process."
    );
    writeFileSync(
      join(dir, "browser-env.json"),
      JSON.stringify({ origin: httpsOrigin, database, certificate }),
      { mode: 0o600 }
    );
    await runTests("tests/portal-http.test.ts", portalEnv);
    await runTests("tests/media-http.test.ts", portalEnv);
    await runTests("tests/profiles-http.test.ts", portalEnv);
    await runTests("tests/church-listing-http.test.ts", {
      ...portalEnv,
      LISTING_RENDER_PHASE: "production"
    });
    await runTests("tests/church-claim-http.test.ts", {
      ...portalEnv,
      CLAIM_RENDER_PHASE: "production"
    });
    await runTests("tests/church-structure-http.test.ts", {
      ...portalEnv,
      STRUCTURE_RENDER_PHASE: "production"
    });
    await runTests("tests/calendar-http.test.ts", {
      ...portalEnv,
      CALENDAR_RENDER_PHASE: "production"
    });
    await runTests("tests/post-workspace-http.test.ts", portalEnv);
    await runTests("tests/social-foundations-http.test.ts", portalEnv);
    await runTests("tests/post-publishing-http.test.ts", {
      ...portalEnv,
      POST_RENDER_PHASE: "production"
    });
    await runTests("tests/post-editor-http.test.ts", {
      ...portalEnv,
      POST_RENDER_PHASE: "production"
    });
    await runTests("tests/post-links-http.test.ts", {
      ...portalEnv,
      POST_RENDER_PHASE: "production"
    });
    await runTests("tests/post-reader-http.test.ts", {
      ...portalEnv,
      POST_RENDER_PHASE: "production"
    });
    await runTests("tests/post-participation-http.test.ts", {
      ...portalEnv,
      POST_RENDER_PHASE: "production"
    });
    if (supportTests) await runTests("tests/support-http.test.ts", portalEnv);
    if (supportTests) await runTests("tests/entrance-http.test.ts", portalEnv);
    if (supportTests) await runTests("tests/guest-browsing.test.ts", portalEnv);
    if (supportTests)
      console.log(
        run(
          process.execPath,
          ["--import", "./tests/register.mjs", "tests/seed-support.ts"],
          { env: portalEnv }
        ).trim()
      );
    console.log(
      run(
        process.execPath,
        ["--import", "./tests/register.mjs", "tests/seed-portal.ts"],
        { env: portalEnv }
      ).trim()
    );
    previewOrigin = httpsOrigin;
    console.log(
      "Portal HTTP privacy checks passed on the actual production HTML/RSC over locally verified HTTPS."
    );
  }
  writeFileSync(
    join(dir, "RESULT.txt"),
    `PASS: synthetic Stage1/2A/2B/2C upgrade, account services${supportTests ? ", support service/HTTPS checks" : ""}${portalTests ? ", portal services" : ""}, full restore, fresh migrations, build and account${portalTests ? "+production HTTPS portal" : ""} HTTP checks. No production data or external email used.\n`
  );
  console.log(`Account checks passed. Synthetic artifacts: ${dir}`);
  if (preview) {
    console.log(`Local synthetic preview: ${previewOrigin}/platform/login`);
    console.log(
      portalTests
        ? `Use the fictional accounts in ${join(dir, "PREVIEW.md")}. Credentials are ignored locally; no session/grant tokens are included. Stop with Ctrl+C.`
        : "Create a fictional account in this preview. Recovery messages stay in the local sink folder. Stop with Ctrl+C."
    );
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  await stopChild(testProcess);
  await stopProxy();
  await stopChild(server);
  if (databaseStarted)
    run(join(pg, "pg_ctl"), [
      "-D",
      join(dir, "pg"),
      "-m",
      "fast",
      "-w",
      "stop"
    ]);
}
