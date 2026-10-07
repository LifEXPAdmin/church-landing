import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";
import {
  prepareNativePush,
  registerNativePush,
  revokeNativePush,
  nativeInstallationHash
} from "../lib/platform/native-push";
import { quarantineRestoredAccess } from "../lib/platform/retention-restore";
import { loginAccount } from "../lib/platform/accounts";
import { revokeReplacedAccountSession } from "../lib/platform/account-sessions";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { protectedAccountDeletionJournal } from "../lib/platform/account-deletion-journal";
import type { RetentionJournalStore } from "../lib/platform/retention-journal";
const db = new PrismaClient();
const names = [
  "NATIVE_PUSH_ENABLED",
  "NATIVE_PUSH_EXPO_PROJECT_ID",
  "NATIVE_PUSH_EXPO_ACCESS_TOKEN"
];
const old = names.map((name) => process.env[name]);
before(async () => {
  await assertPortalTestDatabase(db);
  Object.assign(process.env, {
    NATIVE_PUSH_ENABLED: "true",
    NATIVE_PUSH_EXPO_PROJECT_ID: randomUUID(),
    NATIVE_PUSH_EXPO_ACCESS_TOKEN: "fictional-provider-access-token"
  });
});

async function intent(
  a: Awaited<ReturnType<typeof createPortalActor>>,
  installationSecret = createSessionToken()
) {
  const prepared = await prepareNativePush(db, a.token, a.id, {
    installationSecret
  });
  return {
    id: randomUUID(),
    mutationId: randomUUID(),
    installationSecret,
    expectedInstallationVersion: prepared.installationVersion,
    recoveryEpoch: prepared.recoveryEpoch,
    provider: "EXPO",
    platform: "ANDROID",
    token: `ExpoPushToken[${randomUUID()}]`,
    label: "Fictional Android"
  };
}
test("concurrent current-session deletion rejects registration before any fence is created", async () => {
  const a = await createPortalActor(db, "pushdelete"),
    input = await intent(a);
  let entered!: () => void, release!: () => void;
  const locked = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const proceed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sessionHash = hashSessionToken(a.token);
  const deleting = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PlatformSession" WHERE "tokenHash"=${sessionHash} FOR UPDATE`;
    entered();
    await proceed;
    await tx.platformSession.delete({ where: { tokenHash: sessionHash } });
  });
  await locked;
  try {
    await assert.rejects(registerNativePush(db, a.token, a.id, input));
    assert.equal(
      await db.nativePushInstallation.findUnique({
        where: { id: nativeInstallationHash(input.installationSecret) }
      }),
      null
    );
  } finally {
    release();
    await deleting;
  }
});
test("replacement holding the old device lock settles alongside legacy session deletion without deadlock", async () => {
  const a = await createPortalActor(db, "pushlocka"),
    b = await createPortalActor(db, "pushlockb");
  const previous = await intent(b);
  await registerNativePush(db, b.token, b.id, previous);
  const input = await intent(a, previous.installationSecret);
  let reached!: () => void;
  const counting = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const held = new Proxy(db, {
    get(target, key, receiver) {
      if (key === "$transaction")
        return (
          work: Parameters<typeof db.$transaction>[0],
          options: unknown
        ) =>
          target.$transaction(async (tx) => {
            const wrapped = new Proxy(tx, {
              get(client, model, context) {
                if (model === "pushSubscription")
                  return new Proxy(client.pushSubscription, {
                    get(subscription, method, scoped) {
                      if (method === "count")
                        return async (
                          ...args: Parameters<typeof subscription.count>
                        ) => {
                          reached();
                          await delay(250);
                          return subscription.count(...args);
                        };
                      return Reflect.get(subscription, method, scoped);
                    }
                  });
                return Reflect.get(client, model, context);
              }
            });
            return (work as unknown as (client: typeof tx) => Promise<unknown>)(
              wrapped
            );
          }, options as never);
      return Reflect.get(target, key, receiver);
    }
  });
  const registering = registerNativePush(held, a.token, a.id, input);
  await counting;
  await Promise.all([
    registering,
    revokeReplacedAccountSession(db, b.token, createSessionToken())
  ]);
  const current = await db.pushSubscription.findUniqueOrThrow({
    where: { id: input.id }
  });
  assert.equal(current.revokedAt, null);
  assert.equal(current.ownerId, a.id);
  assert.equal(
    (
      await db.nativePushInstallation.findUniqueOrThrow({
        where: { id: nativeInstallationHash(input.installationSecret) }
      })
    ).version,
    2
  );
});
test("database guards require immutable native credentials and retained generation state", async () => {
  const a = await createPortalActor(db, "pushguard"),
    input = await intent(a);
  await registerNativePush(db, a.token, a.id, input);
  const hash = nativeInstallationHash(input.installationSecret);
  await assert.rejects(
    db.pushSubscription.update({
      where: { id: input.id },
      data: { nativeToken: "ExpoPushToken[replacement]" }
    })
  );
  await assert.rejects(
    db.pushSubscription.update({
      where: { id: input.id },
      data: { nativeRecoveryEpoch: randomUUID() }
    })
  );
  await assert.rejects(db.pushSubscription.delete({ where: { id: input.id } }));
  await assert.rejects(
    db.nativePushInstallation.update({
      where: { id: hash },
      data: { version: 0 }
    })
  );
  await assert.rejects(
    db.nativePushInstallation.delete({ where: { id: hash } })
  );
  await revokeNativePush(db, a.token, a.id, {
    id: input.id,
    expectedVersion: 1,
    mutationId: randomUUID()
  });
  await db.pushSubscription.delete({ where: { id: input.id } });
  assert.equal(
    (await db.nativePushInstallation.findUniqueOrThrow({ where: { id: hash } }))
      .version,
    2
  );
});
test("actual account erasure removes native routing and receipts while preserving the minimal fence", async () => {
  const a = await createPortalActor(db, "pushold"),
    b = await createPortalActor(db, "pusherase");
  const delayed = await intent(a),
    current = await intent(b, delayed.installationSecret);
  await registerNativePush(db, b.token, b.id, current);
  const entries = new Map<string, unknown>();
  const store: RetentionJournalStore<unknown> = {
    async read(key) {
      return entries.get(key) ?? null;
    },
    async write(key, value) {
      assert.ok(!entries.has(key));
      entries.set(key, structuredClone(value));
    },
    async remove(key) {
      entries.delete(key);
    },
    async page() {
      return { paths: [...entries.keys()] };
    }
  };
  const journal = protectedAccountDeletionJournal(store);
  await requestPermanentAccountDeletion(
    db,
    b.token,
    b.password,
    true,
    createSessionToken(),
    journal,
    b.id
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: b.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  assert.equal(
    await db.pushSubscription.count({ where: { ownerId: b.id } }),
    0
  );
  assert.equal(await db.socialOperation.count({ where: { ownerId: b.id } }), 0);
  assert.deepEqual(
    await db.nativePushInstallation.findUniqueOrThrow({
      where: { id: nativeInstallationHash(current.installationSecret) }
    }),
    { id: nativeInstallationHash(current.installationSecret), version: 2 }
  );
  await assert.rejects(registerNativePush(db, a.token, a.id, delayed));
});
test("actual dump and restore rotates the epoch for both restored and absent installations", async () => {
  const a = await createPortalActor(db, "pushrestore"),
    b = await createPortalActor(db, "pushafter");
  const absent = await intent(a),
    first = await intent(a);
  await registerNativePush(db, a.token, a.id, first);
  const origin = new URL(process.env.DATABASE_URL!);
  assert.equal(origin.hostname, "127.0.0.1");
  assert.equal(origin.pathname, "/godschurches_security_test");
  const target = new URL(origin);
  target.pathname = "/godschurches_native_push_restore";
  const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
  const flags = [
    "-h",
    origin.hostname,
    "-p",
    origin.port,
    "-U",
    decodeURIComponent(origin.username)
  ];
  const run = (tool: string, args: string[], input?: Buffer) =>
    execFileSync(`${pg}/${tool}`, args, {
      input,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    });
  const snapshot = run("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    origin.href
  ]);
  const second = await intent(a, first.installationSecret);
  await registerNativePush(db, a.token, a.id, second);
  const aliased = await intent(a, first.installationSecret);
  assert.equal(aliased.expectedInstallationVersion, 2);
  const after = await intent(b, absent.installationSecret);
  await registerNativePush(db, b.token, b.id, after);
  const settings = [
    "RETENTION_RESTORE_ISOLATED",
    "ACCOUNT_DELIVERY_MODE",
    "NATIVE_PUSH_ENABLED",
    "PUSH_ENABLED",
    "FOUNDER_WELCOME_ENABLED",
    "COMMUNITY_REPORTS_ENABLED",
    "RETENTION_CLEANUP_ENABLED"
  ];
  const previous = settings.map((name) => process.env[name]);
  let restored: PrismaClient | undefined,
    created = false;
  try {
    run("createdb", [...flags, target.pathname.slice(1)]);
    created = true;
    run(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", target.href],
      snapshot
    );
    restored = new PrismaClient({ datasourceUrl: target.href });
    Object.assign(process.env, {
      RETENTION_RESTORE_ISOLATED: "true",
      ACCOUNT_DELIVERY_MODE: "disabled",
      PUSH_ENABLED: "false",
      FOUNDER_WELCOME_ENABLED: "false",
      COMMUNITY_REPORTS_ENABLED: "false",
      RETENTION_CLEANUP_ENABLED: "false"
    });
    await assert.rejects(
      quarantineRestoredAccess(restored),
      /outbound work disabled/
    );
    process.env.NATIVE_PUSH_ENABLED = "false";
    await quarantineRestoredAccess(restored);
    const epoch = await restored.nativePushRecovery.findUniqueOrThrow({
      where: { id: "current" }
    });
    assert.notEqual(epoch.epoch, first.recoveryEpoch);
    assert.equal(await restored.platformSession.count(), 0);
    assert.equal(
      await restored.pushSubscription.count({
        where: { nativeToken: { not: null } }
      }),
      0
    );
    assert.equal(
      (
        await restored.nativePushInstallation.findUniqueOrThrow({
          where: { id: nativeInstallationHash(first.installationSecret) }
        })
      ).version,
      aliased.expectedInstallationVersion
    );
    assert.equal(
      await restored.nativePushInstallation.findUnique({
        where: { id: nativeInstallationHash(absent.installationSecret) }
      }),
      null
    );
    process.env.ACCOUNT_DELIVERY_MODE = "test-sink";
    process.env.NATIVE_PUSH_ENABLED = "true";
    const token = await loginAccount(
      restored,
      a.email,
      a.password,
      "fictional recovered native session"
    );
    await assert.rejects(registerNativePush(restored, token, a.id, aliased));
    await assert.rejects(registerNativePush(restored, token, a.id, absent));
  } finally {
    settings.forEach((name, i) =>
      previous[i] === undefined
        ? delete process.env[name]
        : (process.env[name] = previous[i])
    );
    await restored?.$disconnect();
    if (created) run("dropdb", [...flags, target.pathname.slice(1)]);
  }
});
after(async () => {
  names.forEach((name, i) =>
    old[i] === undefined
      ? delete process.env[name]
      : (process.env[name] = old[i])
  );
  await db.$disconnect();
});

test("registration must recheck idle expiry after its final database waits", async () => {
  const a = await createPortalActor(db, "pushidle");
  const installationSecret = createSessionToken();
  const prepared = await prepareNativePush(db, a.token, a.id, {
    installationSecret
  });
  const input = {
    id: randomUUID(),
    mutationId: randomUUID(),
    installationSecret,
    expectedInstallationVersion: prepared.installationVersion,
    recoveryEpoch: prepared.recoveryEpoch,
    provider: "EXPO",
    platform: "IOS",
    token: `ExpoPushToken[${randomUUID()}]`,
    label: "Fictional phone"
  };
  await db.platformSession.update({
    where: { tokenHash: hashSessionToken(a.token) },
    data: { idleExpiresAt: new Date(Date.now() + 750) }
  });
  const delayed = new Proxy(db, {
    get(target, key, receiver) {
      if (key === "$transaction")
        return (
          work: Parameters<typeof db.$transaction>[0],
          options: unknown
        ) =>
          target.$transaction(async (tx) => {
            const wrapped = new Proxy(tx, {
              get(client, model, context) {
                if (model === "pushSubscription")
                  return new Proxy(client.pushSubscription, {
                    get(subscription, method, scoped) {
                      if (method === "count")
                        return async (
                          ...args: Parameters<typeof subscription.count>
                        ) => {
                          await delay(1000);
                          return subscription.count(...args);
                        };
                      return Reflect.get(subscription, method, scoped);
                    }
                  });
                return Reflect.get(client, model, context);
              }
            });
            return (work as unknown as (client: typeof tx) => Promise<unknown>)(
              wrapped
            );
          }, options as never);
      return Reflect.get(target, key, receiver);
    }
  });
  await assert.rejects(registerNativePush(delayed, a.token, a.id, input));
  assert.equal(
    await db.pushSubscription.findUnique({ where: { id: input.id } }),
    null
  );
});
