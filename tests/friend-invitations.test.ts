import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import {
  friendInvitationCommand as command,
  readFriendInvitations,
  publicFriendInvitation,
  finishVerifiedFriendInvitation
} from "../lib/platform/friend-invitations";
import {
  registerAccount,
  loginAccount,
  requestAccountGrant,
  consumeAccountGrant
} from "../lib/platform/accounts";
import {
  relationshipCommand,
  readRelationships
} from "../lib/platform/relationships";
import { portalCommand, ADULT_POLICY } from "../lib/platform/portal";
import { deactivateAccount } from "../lib/platform/account-lifecycle";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const input = (
  operation: string,
  accountId: string,
  fields: Record<string, unknown> = {}
) => ({ operation, accountId, mutationId: randomUUID(), ...fields });
async function enabled() {
  const a = await createPortalActor(db, "inviter");
  await command(
    db,
    a.token,
    input("enable", a.id, { consent: true, expectedVersion: 0 })
  );
  const state = await readFriendInvitations(db, a.token);
  return { a, state, code: state.url!.split("/").at(-1)! };
}
const count = (a: string, b: string) =>
  db.platformFollow.count({
    where: {
      OR: [
        { followerId: a, followingId: b },
        { followerId: b, followingId: a }
      ]
    }
  });
async function freshSignup(code?: string, consent = true) {
  const name = "invite_" + randomUUID().replaceAll("-", "").slice(0, 12),
    email = name + "@example.test",
    password = "Safe fictional password 8!";
  await registerAccount(db, {
    email,
    username: name,
    name,
    role: "BELIEVER",
    password,
    confirmPassword: password,
    friendInvitation: code,
    friendConsent: consent
  });
  const account = await db.platformUser.findUniqueOrThrow({ where: { email } });
  const login = await loginAccount(db, email, password, "Invitation fixture");
  return { account, login, email, password };
}
test("explicit invitation consent, opaque generic-safe reads, versions and exact retries", async () => {
  const a = await createPortalActor(db, "consent");
  await assert.rejects(
    command(db, a.token, input("enable", a.id, { expectedVersion: 0 }))
  );
  assert.equal(
    await db.friendInvitation.count({ where: { ownerId: a.id } }),
    0
  );
  const body = input("enable", a.id, { expectedVersion: 0, consent: true });
  const r = await command(db, a.token, body);
  assert.deepEqual(await command(db, a.token, body), r);
  await assert.rejects(command(db, a.token, { ...body, consent: false }));
  const state = await readFriendInvitations(db, a.token);
  assert.match(state.url!, /\/invite\/[A-Za-z0-9_-]{43}$/);
  const code = state.url!.split("/").at(-1)!;
  assert.equal((await publicFriendInvitation(db, code))?.ownerId, a.id);
  assert.equal(await publicFriendInvitation(db, a.id), null);
  assert.equal(
    await db.friendAcceptance.count({ where: { inviterId: a.id } }),
    0
  );
  await assert.rejects(
    command(
      db,
      a.token,
      input("revoke", "wrong-account", { expectedVersion: state.version })
    )
  );
  await assert.rejects(
    command(
      db,
      a.token,
      input("rotate", a.id, { expectedVersion: 0, consent: true })
    )
  );
});
test("existing members knowingly accept, concurrent retries commit exactly two edges and do not grant church access", async () => {
  const { a, code } = await enabled(),
    b = await createPortalActor(db, "recipient");
  const prior = await db.churchConnection.count({ where: { userId: b.id } });
  const body = input("accept", b.id, { code, consent: true });
  const result = await Promise.all([
    command(db, b.token, body),
    command(db, b.token, body)
  ]);
  assert.deepEqual(result[0], result[1]);
  assert.equal(await count(a.id, b.id), 2);
  assert.equal(
    await db.churchConnection.count({ where: { userId: b.id } }),
    prior
  );
  assert.equal(
    (
      (await readRelationships(db, b.token, {
        view: "status",
        kind: "person",
        targetId: a.id
      })) as { friends: boolean }
    ).friends,
    true
  );
  await command(db, b.token, input("accept", b.id, { code, consent: true }));
  assert.equal(await count(a.id, b.id), 2);
  await assert.rejects(
    command(db, a.token, input("accept", a.id, { code, consent: true }))
  );
});
test("accepted signup survives cross-browser verification and only connects after adult acknowledgement", async () => {
  const { a, code } = await enabled(),
    b = await freshSignup(code);
  assert.equal(await count(a.id, b.account.id), 0);
  let grant = "";
  await requestAccountGrant(
    db,
    b.email,
    "VERIFY_EMAIL",
    async (_email, _purpose, token) => {
      grant = token;
    }
  );
  assert.ok(grant);
  await consumeAccountGrant(db, grant, "VERIFY_EMAIL");
  assert.equal(await count(a.id, b.account.id), 0);
  await portalCommand(db, b.login, {
    operation: "ack-adult",
    expectedVersion: 0,
    policy: ADULT_POLICY,
    acknowledged: true
  });
  assert.equal(await count(a.id, b.account.id), 2);
  assert.equal(
    (await readFriendInvitations(db, b.login)).signup?.state,
    "CONNECTED"
  );
  await finishVerifiedFriendInvitation(db, b.account.id);
  assert.equal(await count(a.id, b.account.id), 2);
});
test("verification after adult acknowledgement completes server-bound consent without browser state", async () => {
  const { a, code } = await enabled(),
    b = await freshSignup(code);
  await portalCommand(db, b.login, {
    operation: "ack-adult",
    expectedVersion: 0,
    policy: ADULT_POLICY,
    acknowledged: true
  });
  let grant = "";
  await requestAccountGrant(
    db,
    b.email,
    "VERIFY_EMAIL",
    async (_email, _purpose, token) => {
      grant = token;
    }
  );
  await consumeAccountGrant(db, grant, "VERIFY_EMAIL");
  assert.equal(await count(a.id, b.account.id), 2);
});
test("generic, declined, tampered and competing duplicate registration never bind or overwrite consent", async () => {
  const { a, code } = await enabled(),
    other = await enabled();
  for (const [value, consent] of [
    [undefined, true],
    [code, false],
    ["bad", true]
  ] as const) {
    const b = await freshSignup(value, consent);
    assert.equal(
      await db.friendAcceptance.count({ where: { recipientId: b.account.id } }),
      0
    );
  }
  const b = await freshSignup(code);
  await registerAccount(db, {
    email: b.email,
    username: "other_" + randomUUID().slice(0, 8),
    name: "Duplicate",
    role: "BELIEVER",
    password: b.password,
    confirmPassword: b.password,
    friendInvitation: other.code,
    friendConsent: true
  });
  assert.equal(
    (
      await db.friendAcceptance.findUnique({
        where: { signupRecipientId: b.account.id }
      })
    )?.inviterId,
    a.id
  );
});
test("revocation, expiry and rotation stop pending signup while existing friends remain", async () => {
  for (const operation of ["revoke", "rotate", "expire"]) {
    const { a, code, state } = await enabled(),
      b = await freshSignup(code),
      c = await createPortalActor(db, "existing");
    await command(db, c.token, input("accept", c.id, { code, consent: true }));
    if (operation === "expire")
      await db.friendInvitation.update({
        where: { ownerId: a.id },
        data: { expiresAt: new Date(0) }
      });
    else
      await command(
        db,
        a.token,
        input(operation, a.id, {
          expectedVersion: state.version,
          consent: true
        })
      );
    assert.equal(await publicFriendInvitation(db, code), null);
    await finishVerifiedFriendInvitation(db, b.account.id);
    assert.equal(await count(a.id, b.account.id), 0);
    assert.equal(await count(a.id, c.id), 2);
  }
});
test("bilateral block rejects acceptance; removed friendship cannot be restored by old receipts, signup callbacks or rotated code", async () => {
  for (const side of ["inviter", "recipient"]) {
    const { a, code } = await enabled(),
      b = await createPortalActor(db, "blocked");
    const actor = side === "inviter" ? a : b,
      target = side === "inviter" ? b : a;
    await relationshipCommand(db, actor.token, {
      operation: "block",
      mutationId: randomUUID(),
      kind: "person",
      targetId: target.id,
      expectedVersion: 0,
      desired: true
    });
    await assert.rejects(
      command(db, b.token, input("accept", b.id, { code, consent: true }))
    );
    assert.equal(await count(a.id, b.id), 0);
  }
  const { a, code } = await enabled(),
    b = await createPortalActor(db, "remove");
  const body = input("accept", b.id, { code, consent: true });
  await command(db, b.token, body);
  const status = (await readRelationships(db, b.token, {
    view: "status",
    kind: "person",
    targetId: a.id
  })) as { version: number };
  await relationshipCommand(db, b.token, {
    operation: "follow",
    mutationId: randomUUID(),
    kind: "person",
    targetId: a.id,
    expectedVersion: status.version,
    desired: false
  });
  await command(db, b.token, body);
  assert.equal(await count(a.id, b.id), 0);
  await assert.rejects(
    command(db, b.token, input("accept", b.id, { code, consent: true }))
  );
  assert.equal(
    (
      (await readRelationships(db, a.token, {
        view: "status",
        kind: "person",
        targetId: b.id
      })) as { friends: boolean }
    ).friends,
    false
  );
  await command(
    db,
    a.token,
    input("rotate", a.id, { expectedVersion: 1, consent: true })
  );
  const next = (await readFriendInvitations(db, a.token))
    .url!.split("/")
    .at(-1)!;
  await assert.rejects(
    command(db, b.token, input("accept", b.id, { code: next, consent: true }))
  );
});
test("pending signup block and inviter deactivation/deletion cannot resurrect connections", async () => {
  const { a, code } = await enabled(),
    b = await freshSignup(code);
  await relationshipCommand(db, a.token, {
    operation: "block",
    mutationId: randomUUID(),
    kind: "person",
    targetId: b.account.id,
    expectedVersion: 0,
    desired: true
  });
  await finishVerifiedFriendInvitation(db, b.account.id);
  assert.equal(
    (
      await db.friendAcceptance.findUnique({
        where: { signupRecipientId: b.account.id }
      })
    )?.state,
    "REMOVED"
  );
  assert.equal(await count(a.id, b.account.id), 0);
  const other = await enabled(),
    c = await freshSignup(other.code);
  await deactivateAccount(db, other.a.token, other.a.password, true);
  await finishVerifiedFriendInvitation(db, c.account.id);
  assert.equal(await count(other.a.id, c.account.id), 0);
  assert.equal(await publicFriendInvitation(db, other.code), null);
  const last = await enabled(),
    d = await freshSignup(last.code);
  await db.platformUser.delete({ where: { id: last.a.id } });
  await finishVerifiedFriendInvitation(db, d.account.id);
  assert.equal(
    await db.friendAcceptance.count({ where: { recipientId: d.account.id } }),
    0
  );
});

test("legacy community unfollow records permanent removal and stale signup completion stays removed", async () => {
  const { a, code } = await enabled(),
    b = await freshSignup(code);
  await portalCommand(db, b.login, {
    operation: "ack-adult",
    expectedVersion: 0,
    policy: ADULT_POLICY,
    acknowledged: true
  });
  let grant = "";
  await requestAccountGrant(db, b.email, "VERIFY_EMAIL", async (_e, _p, t) => {
    grant = t;
  });
  await consumeAccountGrant(db, grant, "VERIFY_EMAIL");
  const { communityCommand } = await import("../lib/platform/community");
  await communityCommand(db, a.token, "unfollow", {
    followingId: b.account.id
  });
  assert.equal(await count(a.id, b.account.id), 0);
  await finishVerifiedFriendInvitation(db, b.account.id);
  await command(db, b.login, input("retry-signup", b.account.id));
  assert.equal(await count(a.id, b.account.id), 0);
  assert.equal(
    (
      await db.friendAcceptance.findUnique({
        where: { signupRecipientId: b.account.id }
      })
    )?.state,
    "REMOVED"
  );
});
test("a failure during the second follow rolls back the pair while email verification remains successful", async () => {
  const { a, code } = await enabled(),
    b = await freshSignup(code);
  await portalCommand(db, b.login, {
    operation: "ack-adult",
    expectedVersion: 0,
    policy: ADULT_POLICY,
    acknowledged: true
  });
  assert.match(b.account.id, /^[a-z0-9]+$/);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION invitation_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fictional connection failure'; END $$`
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER invitation_fixture_failure BEFORE INSERT ON "PlatformFollow" FOR EACH ROW WHEN (NEW."followerId" = '${b.account.id}') EXECUTE FUNCTION invitation_fixture_failure()`
  );
  try {
    let grant = "";
    await requestAccountGrant(
      db,
      b.email,
      "VERIFY_EMAIL",
      async (_e, _p, t) => {
        grant = t;
      }
    );
    await consumeAccountGrant(db, grant, "VERIFY_EMAIL");
    assert.ok(
      (await db.platformUser.findUniqueOrThrow({ where: { id: b.account.id } }))
        .emailVerifiedAt
    );
    assert.equal(await count(a.id, b.account.id), 0);
    assert.equal(
      (
        await db.friendAcceptance.findUnique({
          where: { signupRecipientId: b.account.id }
        })
      )?.state,
      "PENDING"
    );
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER invitation_fixture_failure ON "PlatformFollow"'
    );
    await db.$executeRawUnsafe("DROP FUNCTION invitation_fixture_failure()");
  }
  await command(db, b.login, input("retry-signup", b.account.id));
  assert.equal(await count(a.id, b.account.id), 2);
});
test("private exports include consent metadata but never reusable invitation tokens", async () => {
  const { a, code } = await enabled(),
    b = await createPortalActor(db, "exportinvite");
  await command(db, b.token, input("accept", b.id, { code, consent: true }));
  const { prepareAccountExport, downloadAccountExport } =
    await import("../lib/platform/account-export");
  for (const actor of [a, b]) {
    const proof = await prepareAccountExport(
      db,
      actor.token,
      actor.password,
      process.env.AUTH_RATE_LIMIT_SECRET!
    );
    const exported = await downloadAccountExport(
      db,
      actor.token,
      proof.authorization,
      process.env.AUTH_RATE_LIMIT_SECRET!
    );
    assert.ok(!JSON.stringify(exported).includes(code));
  }
});
test("suspending an inviter removes connected pairs and invalidates pending signup", async () => {
  const { a, code } = await enabled(),
    b = await createPortalActor(db, "suspendpair"),
    c = await freshSignup(code),
    operator = await createPortalActor(db, "operator");
  await command(db, b.token, input("accept", b.id, { code, consent: true }));
  await db.platformOperatorGrant.create({
    data: { userId: operator.id, capability: "MANAGE_ACCOUNTS" }
  });
  const before = await db.platformUser.findUniqueOrThrow({
    where: { id: a.id }
  });
  await portalCommand(db, operator.token, {
    operation: "suspend",
    userId: a.id,
    expectedVersion: before.portalVersion,
    suspended: true
  });
  assert.equal(await count(a.id, b.id), 0);
  await finishVerifiedFriendInvitation(db, c.account.id);
  assert.equal(await count(a.id, c.account.id), 0);
});

test("a connection failure after adult acknowledgement preserves completed eligibility and a retryable choice", async () => {
  const { a, code } = await enabled(),
    b = await freshSignup(code);
  let grant = "";
  await requestAccountGrant(db, b.email, "VERIFY_EMAIL", async (_e, _p, t) => {
    grant = t;
  });
  await consumeAccountGrant(db, grant, "VERIFY_EMAIL");
  assert.match(b.account.id, /^[a-z0-9]+$/);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION invitation_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fictional connection failure'; END $$`
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER invitation_fixture_failure BEFORE INSERT ON "PlatformFollow" FOR EACH ROW WHEN (NEW."followerId" = '${b.account.id}') EXECUTE FUNCTION invitation_fixture_failure()`
  );
  try {
    await portalCommand(db, b.login, {
      operation: "ack-adult",
      expectedVersion: 0,
      policy: ADULT_POLICY,
      acknowledged: true
    });
    assert.ok(
      (await db.platformUser.findUniqueOrThrow({ where: { id: b.account.id } }))
        .adultAcknowledgedAt
    );
    assert.equal(await count(a.id, b.account.id), 0);
    assert.equal(
      (
        await db.friendAcceptance.findUnique({
          where: { signupRecipientId: b.account.id }
        })
      )?.state,
      "PENDING"
    );
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER invitation_fixture_failure ON "PlatformFollow"'
    );
    await db.$executeRawUnsafe("DROP FUNCTION invitation_fixture_failure()");
  }
  await command(db, b.login, input("retry-signup", b.account.id));
  assert.equal(await count(a.id, b.account.id), 2);
});
