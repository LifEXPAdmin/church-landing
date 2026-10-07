import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createECDH, randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { hashSessionToken } from "../lib/platform/auth";
import { deliverNotification } from "../lib/platform/notification-outbox";
import { notificationSource } from "../lib/platform/notification-source";
import { pushServerConfig } from "../lib/platform/push-config";
import { accountSessionIsActive } from "../lib/platform/account-session-policy";
import webpush from "web-push";

const source = new PrismaClient();
before(() => assertPortalTestDatabase(source));
after(() => source.$disconnect());
test("populated predecessor upgrade preserves all original table data and pending web delivery", async () => {
  const origin = new URL(process.env.DATABASE_URL!);
  assert.equal(origin.hostname, "127.0.0.1");
  assert.equal(origin.pathname, "/godschurches_security_test");
  const target = new URL(origin);
  target.pathname = "/godschurches_security_test_restore";
  const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
  const flags = [
    "-h",
    origin.hostname,
    "-p",
    origin.port,
    "-U",
    decodeURIComponent(origin.username)
  ];
  const run = (tool: string, args: string[]) =>
    execFileSync(`${pg}/${tool}`, args, {
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    });
  const artifact = mkdtempSync(join(tmpdir(), "native-push-upgrade-"));
  mkdirSync(join(artifact, "migrations"));
  copyFileSync("prisma/schema.prisma", join(artifact, "schema.prisma"));
  copyFileSync(
    "prisma/migrations/migration_lock.toml",
    join(artifact, "migrations/migration_lock.toml")
  );
  const own = "20261007215000_native_push_delivery";
  const predecessors = readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name < own)
    .map((d) => d.name)
    .sort();
  assert.ok(predecessors.length > 100);
  assert.ok(predecessors.every((name) => name < own));
  for (const name of predecessors) {
    mkdirSync(join(artifact, "migrations", name));
    copyFileSync(
      join("prisma/migrations", name, "migration.sql"),
      join(artifact, "migrations", name, "migration.sql")
    );
  }
  const deploy = (schema: string) =>
    execFileSync(
      process.execPath,
      [
        resolve("node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        schema
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: target.href,
          DIRECT_URL: target.href
        },
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
  const settings = [
    "DATABASE_URL",
    "DIRECT_URL",
    "PUSH_ENABLED",
    "PUSH_VAPID_PUBLIC_KEY",
    "PUSH_VAPID_PRIVATE_KEY",
    "PUSH_VAPID_SUBJECT"
  ];
  const previous = settings.map((name) => process.env[name]);
  let db: PrismaClient | undefined,
    created = false;
  try {
    run("createdb", [...flags, target.pathname.slice(1)]);
    created = true;
    deploy(join(artifact, "schema.prisma"));
    db = new PrismaClient({ datasourceUrl: target.href });
    process.env.DATABASE_URL = target.href;
    process.env.DIRECT_URL = target.href;
    const a = await createPortalActor(db, "pushupgrade"),
      session = await db.platformSession.findUniqueOrThrow({
        where: { tokenHash: hashSessionToken(a.token) }
      });
    const id = randomUUID(),
      binding = randomBytes(32).toString("hex"),
      endpointHash = randomBytes(32).toString("hex");
    const keys = createECDH("prime256v1");
    keys.generateKeys();
    const p256dh = keys.getPublicKey().toString("base64url"),
      auth = randomBytes(16).toString("base64url");
    await db.$executeRaw`INSERT INTO "PushSubscription" (id,"ownerId","sessionId","bindingHash","endpointHash",endpoint,p256dh,auth,label,"expiresAt")
      VALUES (${id},${a.id},${session.id},${binding},${endpointHash},'https://fcm.googleapis.com/fcm/send/fictional-upgrade',${p256dh},${auth},'Fictional browser',${session.expiresAt.toISOString()}::timestamp)`;
    const event = await db.socialEvent.create({
      data: {
        key: `push-test:${randomUUID()}`,
        kind: "PUSH_TEST",
        actorId: a.id,
        recipientId: a.id
      }
    });
    const deliveryId = randomUUID();
    await db.$executeRaw`INSERT INTO "NotificationDelivery" (id,"eventId","ownerId","subscriptionId","subscriptionVersion","expiresAt")
      VALUES (${deliveryId},${event.id},${a.id},${id},1,${new Date(Date.now() + 600000).toISOString()}::timestamp)`;
    const columns = await db.$queryRaw<
      { table_name: string; column_name: string }[]
    >`SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name<>'_prisma_migrations' ORDER BY table_name,ordinal_position`;
    const tables = new Map<string, string[]>();
    for (const c of columns)
      tables.set(c.table_name, [
        ...(tables.get(c.table_name) ?? []),
        c.column_name
      ]);
    const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
    const snapshot = async () => {
      const rows: Record<string, unknown> = {};
      for (const [table, fields] of tables)
        rows[table] = await db!.$queryRawUnsafe(
          `SELECT count(*)::text AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM (SELECT ${fields.map(quote).join(",")} FROM ${quote(table)}) t`
        );
      return rows;
    };
    const before = await snapshot();
    mkdirSync(join(artifact, "migrations", own));
    copyFileSync(
      join("prisma/migrations", own, "migration.sql"),
      join(artifact, "migrations", own, "migration.sql")
    );
    deploy(join(artifact, "schema.prisma"));
    assert.deepEqual(await snapshot(), before);
    assert.equal(await db.nativePushInstallation.count(), 0);
    assert.equal(await db.nativePushRecovery.count(), 1);
    const legacy = await db.pushSubscription.findUniqueOrThrow({
      where: { id }
    });
    assert.equal(legacy.provider, "WEB_PUSH");
    assert.equal(legacy.nativeToken, null);
    assert.equal(legacy.revokedAt, null);
    const vapid = webpush.generateVAPIDKeys();
    Object.assign(process.env, {
      PUSH_ENABLED: "true",
      PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
      PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
      PUSH_VAPID_SUBJECT: "https://example.test"
    });
    assert.ok(pushServerConfig());
    assert.ok(
      legacy.expiresAt > new Date(),
      `Legacy device expiry ${legacy.expiresAt.toISOString()}`
    );
    assert.ok(
      accountSessionIsActive(
        await db.platformSession.findUniqueOrThrow({
          where: { id: session.id }
        })
      )
    );
    const pending = await db.notificationDelivery.findUniqueOrThrow({
      where: { id: deliveryId }
    });
    assert.ok(
      pending.expiresAt > new Date(),
      `Pending delivery expiry ${pending.expiresAt.toISOString()}`
    );
    assert.ok(
      await notificationSource(db, event, true),
      `Source time ${event.createdAt.toISOString()}`
    );
    let sends = 0;
    assert.deepEqual(
      await deliverNotification(db, deliveryId, async (subscription) => {
        sends++;
        assert.equal(subscription.keys.auth, auth);
        return 201;
      }),
      { done: true, outcome: "accepted" }
    );
    assert.equal(sends, 1);
    console.log(
      "Populated native migration preserved original table fingerprints",
      tables.size,
      "predecessors",
      predecessors.length
    );
  } finally {
    settings.forEach((name, i) =>
      previous[i] === undefined
        ? delete process.env[name]
        : (process.env[name] = previous[i])
    );
    await db?.$disconnect();
    if (created) run("dropdb", [...flags, target.pathname.slice(1)]);
  }
});
