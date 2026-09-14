import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import {
  accountRestrictionCommand,
  getPortalSnapshot,
  PortalError
} from "../lib/platform/portal";
import { handlePortalRequest } from "../lib/platform/portal-boundary";
import { readAccountSession } from "../lib/platform/accounts";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import {
  protectedRetentionControls,
  replayRetentionControls,
  inspectRestoredAccountRestrictions,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { expireRetentionReceipts } from "../lib/platform/retention-maintenance";
import { DAY } from "../lib/platform/messaging-retention";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (work: Promise<unknown>, status: number) =>
  assert.rejects(
    work,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
function memory() {
  const values = new Map<string, unknown>();
  let fail = false;
  const journal = protectedRetentionControls({
    async read(key) {
      return values.get(key) ?? null;
    },
    async write(key, value) {
      if (fail) throw Error("Isolated provider failure");
      if (values.has(key)) throw Error("Immutable");
      values.set(key, structuredClone(value));
    },
    async remove(key) {
      if (fail) throw Error("Isolated provider failure");
      values.delete(key);
    },
    async page() {
      return { paths: [...values.keys()] };
    }
  });
  return {
    journal,
    values,
    fail(value: boolean) {
      fail = value;
    }
  };
}
async function fixture() {
  const actor = await createPortalActor(db, "restrictionoperator");
  const target = await createPortalActor(db, "restrictiontarget");
  await seedOperatorGrants(db, actor, ["MANAGE_ACCOUNTS"]);
  const current = await db.platformUser.findUniqueOrThrow({
    where: { id: target.id }
  });
  const body = {
    operation: "suspend",
    mutationId: randomUUID(),
    userId: target.id,
    suspended: true,
    expectedVersion: current.portalVersion,
    reason: "SAFETY_REVIEW"
  };
  return { actor, target, current, body, store: memory() };
}
async function controls(userId: string) {
  return (
    await db.retentionControl.findMany({
      where: { kind: "ACCOUNT_STATE", sourceId: userId },
      orderBy: { version: "asc" }
    })
  ).map((row) => row.payload as RetentionControlEntry);
}

test("restriction validates reasons, explicit authority, self denial and stale versions before any account write", async () => {
  const f = await fixture();
  const run = (body = f.body, token = f.actor.token) =>
    accountRestrictionCommand(db, token, body, f.store.journal);
  await denied(run({ ...f.body, reason: "" }), 400);
  await denied(run({ ...f.body, reason: "REVIEW_COMPLETE" }), 400);
  await denied(run({ ...f.body, reason: "toString" }), 400);
  await denied(run({ ...f.body, reason: "Private freeform evidence" }), 400);
  await denied(run({ ...f.body, userId: f.actor.id }), 403);
  await denied(
    run({ ...f.body, expectedVersion: f.current.portalVersion - 1 }),
    409
  );
  await denied(run(f.body, f.target.token), 403);
  await denied(
    accountRestrictionCommand(
      db,
      f.actor.token,
      { ...f.body, actorId: f.actor.id },
      f.store.journal
    ),
    400
  );
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: f.target.id } }),
    f.current
  );
  assert.equal((await controls(f.target.id)).length, 0);
  assert.equal(
    await db.churchAuditEvent.count({
      where: {
        targetId: f.target.id,
        action: { in: ["SUSPEND", "RESTORE_ACCOUNT"] }
      }
    }),
    0
  );
});

test("lost protection response retries one canonical decision, and current authority is checked before its receipt", async () => {
  const f = await fixture();
  f.store.fail(true);
  await denied(
    accountRestrictionCommand(db, f.actor.token, f.body, f.store.journal),
    503
  );
  const updated = await db.platformUser.findUniqueOrThrow({
    where: { id: f.target.id }
  });
  assert.ok(updated.suspendedAt);
  assert.equal(updated.portalVersion, f.current.portalVersion + 1);
  assert.equal(updated.credentialVersion, f.current.credentialVersion + 1);
  assert.equal(await readAccountSession(db, f.target.token), null);
  assert.equal(
    await db.retentionControl.count({
      where: { sourceId: f.target.id, journaledAt: null }
    }),
    1
  );
  f.store.fail(false);
  const result = await accountRestrictionCommand(
    db,
    f.actor.token,
    f.body,
    f.store.journal
  );
  assert.deepEqual(
    await accountRestrictionCommand(db, f.actor.token, f.body, f.store.journal),
    result
  );
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: f.target.id } }),
    updated
  );
  assert.equal(
    await db.socialOperation.count({
      where: {
        ownerId: f.actor.id,
        key: `account-restriction:${f.body.mutationId}`
      }
    }),
    1
  );
  const audit = await db.churchAuditEvent.findMany({
    where: {
      targetId: f.target.id,
      action: { in: ["SUSPEND", "RESTORE_ACCOUNT"] }
    }
  });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actorId, f.actor.id);
  assert.equal(audit[0].reason, "SAFETY_REVIEW");
  assert.equal(audit[0].fromState, "NOT_SUSPENDED");
  assert.equal(audit[0].toState, "SUSPENDED");
  assert.equal(audit[0].version, updated.portalVersion);
  const serialized = JSON.stringify([...f.store.values.values()]);
  for (const privateValue of [
    f.target.email,
    f.target.name,
    f.actor.name,
    "SAFETY_REVIEW",
    "reason"
  ])
    assert.ok(!serialized.includes(privateValue));
  await denied(
    accountRestrictionCommand(
      db,
      f.actor.token,
      { ...f.body, reason: "ACCOUNT_SECURITY" },
      f.store.journal
    ),
    409
  );
  await db.platformOperatorGrant.updateMany({
    where: { userId: f.actor.id },
    data: { revokedAt: new Date() }
  });
  await denied(
    accountRestrictionCommand(db, f.actor.token, f.body, f.store.journal),
    403
  );
  assert.equal(f.store.values.size, 1);
});

test("restoration records its own reviewed reason without restoring sessions or privileges; audit stays account-manager-only", async () => {
  const f = await fixture();
  await seedOperatorGrants(db, f.target, ["REVIEW_COMMUNITY_REPORTS"]);
  const suspended = await accountRestrictionCommand(
    db,
    f.actor.token,
    f.body,
    f.store.journal
  );
  const restore = {
    ...f.body,
    mutationId: randomUUID(),
    suspended: false,
    reason: "ACCOUNT_RECOVERED",
    expectedVersion: suspended.version
  };
  const result = await accountRestrictionCommand(
    db,
    f.actor.token,
    restore,
    f.store.journal
  );
  assert.equal(result.version, suspended.version + 1);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: f.target.id } }))
      .suspendedAt,
    null
  );
  assert.equal(
    await db.platformSession.count({ where: { userId: f.target.id } }),
    0
  );
  assert.equal(
    await db.platformOperatorGrant.count({
      where: { userId: f.target.id, revokedAt: null }
    }),
    0
  );
  assert.deepEqual(
    await accountRestrictionCommand(
      db,
      f.actor.token,
      restore,
      f.store.journal
    ),
    result
  );
  await denied(
    accountRestrictionCommand(
      db,
      f.actor.token,
      { ...restore, mutationId: randomUUID(), expectedVersion: result.version },
      f.store.journal
    ),
    409
  );
  const dto = await getPortalSnapshot(db, f.actor.token, "operator");
  const history = dto.operator?.accountAudit?.filter(
    (row) => row.targetId === f.target.id
  );
  assert.equal(history?.length, 2);
  assert.equal(history?.[0].reason, "ACCOUNT_RECOVERED");
  assert.equal(history?.[0].fromState, "SUSPENDED");
  assert.equal(history?.[0].toState, "NOT_SUSPENDED");
  const other = await createPortalActor(db, "otheroperator");
  await seedOperatorGrants(db, other, ["ESTABLISH_CHURCH"]);
  assert.equal(
    (await getPortalSnapshot(db, other.token, "operator")).operator
      ?.accountAudit,
    undefined
  );
});

test("HTTP account decisions require a pinned current account; mismatched reads and writes disclose no audit or mutation", async () => {
  const f = await fixture();
  const origin = process.env.ACCOUNT_ORIGIN!;
  const request = (method: string, expected?: string) =>
    new Request(`${origin}/api/platform/portal?view=operator`, {
      method,
      headers: {
        origin,
        Cookie: `church_platform_session=${f.actor.token}`,
        "Content-Type": "application/json",
        ...(expected !== undefined ? { "X-Expected-Account": expected } : {})
      },
      ...(method === "POST" ? { body: JSON.stringify(f.body) } : {})
    });
  for (const expected of [undefined, "", f.target.id]) {
    const response = await handlePortalRequest(db, request("POST", expected));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("vary")!, /X-Expected-Account/);
  }
  assert.equal(
    (await handlePortalRequest(db, request("GET", f.target.id))).status,
    401
  );
  const own = await handlePortalRequest(db, request("GET", f.actor.id));
  assert.equal(own.status, 200);
  assert.match(own.headers.get("cache-control")!, /private, no-store/);
  assert.equal(
    await db.churchAuditEvent.count({
      where: {
        targetId: f.target.id,
        action: { in: ["SUSPEND", "RESTORE_ACCOUNT"] }
      }
    }),
    0
  );
  assert.equal(
    await db.socialOperation.count({ where: { ownerId: f.actor.id } }),
    0
  );
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: f.target.id } }),
    f.current
  );
});

test("protected account replay preserves suspensions and requires new review for a restoration newer than the backup, in either page order", async () => {
  const f = await fixture();
  const suspended = await accountRestrictionCommand(
    db,
    f.actor.token,
    f.body,
    f.store.journal
  );
  const restore = {
    ...f.body,
    mutationId: randomUUID(),
    suspended: false,
    reason: "REVIEW_COMPLETE",
    expectedVersion: suspended.version
  };
  await accountRestrictionCommand(db, f.actor.token, restore, f.store.journal);
  const entries = await controls(f.target.id);
  const baseline = await inspectRestoredAccountRestrictions(db);
  // Equal-version restored state already captured in a backup stays intact.
  await replayRetentionControls(db, [...entries].reverse());
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: f.target.id } }))
      .suspendedAt,
    null
  );
  assert.equal(await inspectRestoredAccountRestrictions(db), baseline);
  for (const order of [entries, [...entries].reverse()]) {
    await db.retentionControl.deleteMany({ where: { sourceId: f.target.id } });
    await db.platformUser.update({
      where: { id: f.target.id },
      data: { suspendedAt: null, portalVersion: f.current.portalVersion }
    });
    for (const entry of order) await replayRetentionControls(db, [entry]);
    const current = await db.platformUser.findUniqueOrThrow({
      where: { id: f.target.id }
    });
    assert.ok(current.suspendedAt);
    assert.equal(current.portalVersion, entries[1].version);
    assert.equal(await inspectRestoredAccountRestrictions(db), baseline + 1);
  }
  await accountRestrictionCommand(
    db,
    f.actor.token,
    {
      ...restore,
      mutationId: randomUUID(),
      expectedVersion: entries[1].version
    },
    f.store.journal
  );
  assert.equal(await inspectRestoredAccountRestrictions(db), baseline);
  const newSuspension = await accountRestrictionCommand(
    db,
    f.actor.token,
    {
      ...f.body,
      mutationId: randomUUID(),
      expectedVersion: entries[1].version + 1
    },
    f.store.journal
  );
  const latest = (await controls(f.target.id)).at(-1)!;
  await db.platformUser.update({
    where: { id: f.target.id },
    data: { suspendedAt: null }
  });
  await replayRetentionControls(db, [latest]);
  assert.ok(
    (await db.platformUser.findUniqueOrThrow({ where: { id: f.target.id } }))
      .suspendedAt
  );
  assert.equal(latest.version, newSuspension.version);
  assert.equal(await inspectRestoredAccountRestrictions(db), baseline);
});

test("missing accounts and unprotected controls block recovery, while protected entries reject copied reasons", async () => {
  const f = await fixture();
  await accountRestrictionCommand(db, f.actor.token, f.body, f.store.journal);
  const [entry] = await controls(f.target.id);
  const baseline = await inspectRestoredAccountRestrictions(db);
  const absent = {
    ...entry,
    id: randomUUID(),
    sourceId: randomUUID(),
    targetId: ""
  };
  absent.targetId = absent.sourceId;
  await replayRetentionControls(db, [absent]);
  assert.equal(await inspectRestoredAccountRestrictions(db), baseline + 1);
  await db.retentionControl.delete({ where: { id: absent.id } });
  const prior = await db.retentionControl.findUniqueOrThrow({
    where: { id: entry.id }
  });
  await db.retentionControl.delete({ where: { id: entry.id } });
  await db.retentionControl.create({
    data: { ...prior, payload: entry, journaledAt: null }
  });
  assert.equal(await inspectRestoredAccountRestrictions(db), baseline + 1);
  await accountRestrictionCommand(db, f.actor.token, f.body, f.store.journal);
  assert.equal(await inspectRestoredAccountRestrictions(db), baseline);
  await assert.rejects(
    f.store.journal.record({
      ...entry,
      reason: "Must stay private"
    } as RetentionControlEntry),
    /Invalid protected/
  );
});

test("account recovery controls expire only after protected account deletion plus 90 days, and failed removal preserves local evidence", async () => {
  const f = await fixture();
  await accountRestrictionCommand(db, f.actor.token, f.body, f.store.journal);
  // Expiry is global maintenance: use a dedicated schema copy so its clock
  // cannot expire receipts owned by another suite sharing the source fixture.
  const sourceUrl = new URL(process.env.DATABASE_URL!);
  assert.equal(sourceUrl.hostname, "127.0.0.1");
  assert.equal(sourceUrl.pathname, "/godschurches_security_test");
  const targetUrl = new URL(sourceUrl);
  const database = "godschurches_account_restriction_restore";
  targetUrl.pathname = "/" + database;
  const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
  const flags = [
    "-h",
    sourceUrl.hostname,
    "-p",
    sourceUrl.port,
    "-U",
    decodeURIComponent(sourceUrl.username)
  ];
  const run = (name: string, args: string[], input?: Buffer) =>
    execFileSync(`${pg}/${name}`, args, {
      input,
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024
    });
  let created = false;
  const recoveryDb = new PrismaClient({ datasourceUrl: targetUrl.href });
  try {
    const schema = run("pg_dump", [
      "--schema-only",
      "--format=custom",
      "--no-owner",
      "--no-acl",
      sourceUrl.href
    ]);
    run("createdb", [...flags, database]);
    created = true;
    run(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", targetUrl.href],
      schema
    );
    await recoveryDb.platformUser.create({
      data: await db.platformUser.findUniqueOrThrow({
        where: { id: f.target.id }
      })
    });
    const original = await db.retentionControl.findFirstOrThrow({
      where: { sourceId: f.target.id }
    });
    await recoveryDb.retentionControl.create({
      data: { ...original, payload: (await controls(f.target.id))[0] }
    });
    const completed = new Date();
    const deletion = await recoveryDb.accountDeletion.create({
      data: {
        userId: f.target.id,
        proofHash: randomUUID(),
        policy: "GC-ACCOUNT-RETENTION-v1",
        requestedAt: completed,
        dueAt: completed,
        structuredPurgedAt: completed,
        completedAt: completed,
        journaledAt: completed,
        completionJournaledAt: completed
      }
    });
    const journals = {
      controls: f.store.journal,
      messages: {
        async page() {
          return { entries: [], cursor: undefined };
        },
        async record() {},
        async complete() {},
        async expire() {
          return false;
        }
      },
      accounts: {
        async page() {
          return { entries: [], cursor: undefined };
        },
        async recordAccount() {},
        async completeAccount() {},
        async expire() {
          return true;
        }
      }
    };
    await expireRetentionReceipts(
      recoveryDb,
      journals,
      new Date(completed.getTime() + 90 * DAY - 1)
    );
    assert.equal(
      await recoveryDb.retentionControl.count({
        where: { sourceId: f.target.id }
      }),
      1
    );
    f.store.fail(true);
    await assert.rejects(
      expireRetentionReceipts(
        recoveryDb,
        journals,
        new Date(completed.getTime() + 90 * DAY + 1)
      ),
      /Isolated provider/
    );
    assert.equal(
      await recoveryDb.retentionControl.count({
        where: { sourceId: f.target.id }
      }),
      1
    );
    assert.ok(
      await recoveryDb.accountDeletion.findUnique({
        where: { id: deletion.id }
      })
    );
    f.store.fail(false);
    await expireRetentionReceipts(
      recoveryDb,
      journals,
      new Date(completed.getTime() + 90 * DAY + 1)
    );
    assert.equal(
      await recoveryDb.retentionControl.count({
        where: { sourceId: f.target.id }
      }),
      0
    );
    assert.equal(
      await recoveryDb.accountDeletion.findUnique({
        where: { id: deletion.id }
      }),
      null
    );
    assert.equal(f.store.values.size, 0);
  } finally {
    await recoveryDb.$disconnect();
    if (created) run("dropdb", [...flags, database]);
  }
});

test("concurrent operators and duplicate submissions commit one account decision at the inspected version", async () => {
  const f = await fixture();
  const other = await createPortalActor(db, "restrictionrace");
  await seedOperatorGrants(db, other, ["MANAGE_ACCOUNTS"]);
  const results = await Promise.allSettled([
    accountRestrictionCommand(db, f.actor.token, f.body, f.store.journal),
    accountRestrictionCommand(db, f.actor.token, f.body, f.store.journal),
    accountRestrictionCommand(
      db,
      other.token,
      { ...f.body, mutationId: randomUUID(), reason: "ACCOUNT_SECURITY" },
      f.store.journal
    )
  ]);
  const accepted = results.filter((r) => r.status === "fulfilled");
  assert.ok(accepted.length >= 1);
  for (const result of results) {
    if (result.status === "rejected")
      assert.ok(
        result.reason instanceof PortalError && result.reason.status === 409
      );
    else assert.equal(result.value.version, f.current.portalVersion + 1);
  }
  assert.equal(
    await db.churchAuditEvent.count({
      where: { targetId: f.target.id, action: "SUSPEND" }
    }),
    1
  );
  assert.equal((await controls(f.target.id)).length, 1);
  assert.equal(f.store.values.size, 1);
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: f.target.id } }))
      .credentialVersion,
    f.current.credentialVersion + 1
  );
});

test("exact account lookup reaches beyond the initial hundred and retains scoped named audit and current-account protection", async () => {
  const f = await fixture();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 6);
  await db.platformUser.createMany({
    data: Array.from({ length: 101 }, (_, i) => ({
      name: "Fictional lookup filler",
      username: `a0lookup_${suffix}_${i}`,
      email: `lookup-${suffix}-${i}@example.test`,
      passwordHash: f.current.passwordHash
    }))
  });
  const username = `zzlookup_${suffix}`;
  await db.platformUser.update({
    where: { id: f.target.id },
    data: { username }
  });
  const initial = (await getPortalSnapshot(db, f.actor.token, "operator"))
    .operator!;
  assert.equal(initial.users.length, 100);
  assert.ok(!initial.users.some((user) => user.id === f.target.id));
  const lookup = (
    await getPortalSnapshot(
      db,
      f.actor.token,
      "operator",
      undefined,
      "@" + username.toUpperCase()
    )
  ).operator!;
  assert.equal(lookup.accountLookup?.selectedUserId, f.target.id);
  assert.equal(lookup.accountLookup?.query, username);
  assert.equal(lookup.users.length, 101);
  assert.ok(
    lookup.users.some(
      (user) =>
        user.id === f.target.id && user.version === f.current.portalVersion
    )
  );
  assert.equal(JSON.stringify(lookup).includes(f.target.email), false);
  await accountRestrictionCommand(db, f.actor.token, f.body, f.store.journal);
  const history = (await getPortalSnapshot(db, f.actor.token, "operator"))
    .operator!.accountAudit!;
  const decision = history.find((row) => row.targetId === f.target.id)!;
  assert.equal(decision.targetName, f.target.name);
  assert.equal(decision.actorName, f.actor.name);
  const other = await createPortalActor(db, "lookupreviewer");
  await seedOperatorGrants(db, other, ["REVIEW_COMMUNITY_REPORTS"]);
  await denied(
    getPortalSnapshot(db, other.token, "operator", undefined, username),
    403
  );
  await denied(
    getPortalSnapshot(
      db,
      f.actor.token,
      "operator",
      undefined,
      "not a username"
    ),
    400
  );
  const absent = (
    await getPortalSnapshot(
      db,
      f.actor.token,
      "operator",
      undefined,
      `missing_${suffix}`
    )
  ).operator!;
  assert.equal(absent.accountLookup?.selectedUserId, null);
  const origin = process.env.ACCOUNT_ORIGIN!;
  for (const [expected, status] of [
    [f.actor.id, 200],
    [other.id, 401]
  ] as const) {
    const response = await handlePortalRequest(
      db,
      new Request(`${origin}/api/platform/portal?view=operator&q=${username}`, {
        headers: {
          Cookie: `church_platform_session=${f.actor.token}`,
          "X-Expected-Account": expected
        }
      })
    );
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
});
