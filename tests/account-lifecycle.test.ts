import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  AccountError,
  registerAccount,
  loginAccount,
  readAccountSession,
  authenticatePassword,
  issueAuthenticatedSession,
  requestAccountGrant,
  consumeAccountGrant
} from "../lib/platform/accounts";
import {
  deactivateAccount,
  reactivateAccount,
  AccountLifecycleError
} from "../lib/platform/account-lifecycle";
import { communityCommand } from "./community-fixture";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import {
  getPortalSnapshot,
  portalCommand,
  ADULT_POLICY
} from "../lib/platform/portal";
import { readSupport } from "../lib/platform/support";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
after(() => db.$disconnect());
beforeEach(() => db.platformAuthLimit.deleteMany());
const password = "Fictional-lifecycle-password-1";
async function owner() {
  const username = "life_" + randomBytes(6).toString("hex");
  await registerAccount(db, {
    name: username,
    username,
    email: username + "@example.test",
    role: "BELIEVER",
    password,
    confirmPassword: password
  });
  const user = await db.platformUser.update({
    where: { username },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY
    }
  });
  return {
    user,
    token: await loginAccount(
      db,
      user.email,
      password,
      "Fictional lifecycle test"
    )
  };
}
function post(
  body: Record<string, unknown>,
  token = "",
  headers: Record<string, string> = {}
) {
  return fetch(origin + "/api/platform/account", {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: "church_platform_session=" + token,
      ...headers
    },
    body: JSON.stringify(body)
  });
}
const sessionError = (e: unknown) =>
  e instanceof AccountError && e.code === "session";
const handoffError = (e: unknown) =>
  e instanceof AccountLifecycleError && e.code === "handoff";

test("actual publishing binds authors to cookies and rejects cross-origin and deactivated submissions", async () => {
  const a = await owner();
  const b = await owner();
  const marker = "Fictional action " + a.user.username;
  const invoke = (source: string, forge = false) =>
    fetch(origin + "/api/platform/posts", {
      method: "POST",
      redirect: "manual",
      headers: {
        Cookie: "church_platform_session=" + a.token,
        Origin: source,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        operation: "create",
        requestKey: a.user.id,
        content: marker,
        type: "UPDATE",
        ...(forge ? { authorId: b.user.id } : {})
      })
    });
  assert.equal((await invoke("https://wrong.example")).status, 403);
  assert.equal(await db.platformPost.count({ where: { content: marker } }), 0);
  assert.equal((await invoke(origin, true)).status, 400);
  assert.equal(await db.platformPost.count({ where: { content: marker } }), 0);
  assert.equal((await invoke(origin)).status, 200);
  for (const rsc of [false, true]) {
    const demo = await fetch(origin + "/platform/demo/member", {
      headers: rsc ? { RSC: "1" } : {}
    });
    assert.equal(
      demo.status,
      200,
      "A community write must not invalidate static demo routes"
    );
  }
  assert.equal(
    (await db.platformPost.findFirstOrThrow({ where: { content: marker } }))
      .authorId,
    a.user.id
  );
  await deactivateAccount(db, a.token, password, true);
  const stale = await invoke(origin);
  assert.equal(stale.status, 401);
  assert.match((await stale.json()).message, /Sign in/);
  assert.equal(await db.platformPost.count({ where: { content: marker } }), 1);
});

test("deactivation requires owner, password and explicit intent; HTTPS rejects forged identities and origin without changes", async () => {
  const a = await owner();
  const b = await owner();
  const body = {
    operation: "deactivate-account",
    currentPassword: password,
    confirmed: true
  };
  for (const headers of [
    { Origin: "https://wrong.example" },
    { Origin: "" },
    { "Sec-Fetch-Site": "cross-site" }
  ] as Array<Record<string, string>>)
    assert.equal((await post(body, a.token, headers)).status, 403);
  assert.equal((await post(body)).status, 401);
  assert.equal(
    (await post({ ...body, userId: b.user.id }, a.token)).status,
    400
  );
  assert.equal(
    (await post({ ...body, currentPassword: "Wrong-password-1" }, a.token))
      .status,
    400
  );
  assert.equal(
    (await post({ ...body, confirmed: "true" }, a.token)).status,
    400
  );
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.user.id } }))
      .deactivatedAt,
    null
  );
  assert.ok(await readAccountSession(db, a.token));
  assert.ok(await readAccountSession(db, b.token));
  for (const operation of ["deactivate-account", "reactivate-account"]) {
    const r = await fetch(origin + "/api/platform/account", {
      method: "GET",
      headers: { Origin: origin }
    });
    assert.equal(r.status, 405, operation);
  }
});

test("all duty categories block deactivation, including retained case and enabled intake ownership", async () => {
  const church = await db.church.create({
    data: {
      name: "Fictional lifecycle church",
      summary: "Isolated fictional fixture",
      slug: "life-" + randomBytes(6).toString("hex")
    }
  });
  for (const kind of [
    "church",
    "operator",
    "contact",
    "support",
    "case",
    "intake"
  ]) {
    const a = await owner();
    if (kind === "church")
      await db.churchCapabilityGrant.create({
        data: {
          userId: a.user.id,
          churchId: church.id,
          capability: "REVIEW_CONNECTIONS"
        }
      });
    if (kind === "operator")
      await db.platformOperatorGrant.create({
        data: { userId: a.user.id, capability: "MANAGE_ACCOUNTS" }
      });
    if (kind === "contact")
      await db.churchContactAssignment.create({
        data: {
          userId: a.user.id,
          churchId: church.id,
          slot: "RELATIONSHIP_OWNER"
        }
      });
    if (["support", "case", "intake"].includes(kind)) {
      const grant = await db.supportCapabilityGrant.create({
        data: {
          userId: a.user.id,
          capability: "RESPOND",
          revokedAt: kind === "support" ? null : new Date()
        }
      });
      if (kind === "case")
        await db.supportCase.create({
          data: {
            requesterId: a.user.id,
            category: "ACCOUNT_WEBSITE",
            subject: "Fictional duty",
            description: "Preserved duty",
            ownerGrantId: grant.id,
            ownerGrantVersion: grant.version
          }
        });
      if (kind === "intake")
        await db.supportIntakeSetting.create({
          data: { id: a.user.username, ownerGrantId: grant.id, enabled: true }
        });
    }
    await assert.rejects(
      deactivateAccount(db, a.token, password, true),
      handoffError,
      kind
    );
    assert.ok(await readAccountSession(db, a.token), kind);
    const response = await post(
      {
        operation: "deactivate-account",
        currentPassword: password,
        confirmed: true
      },
      a.token
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "ACCOUNT_HANDOFF");
  }
});

test("deactivation ends all access and sharing while preserving records; reactivation does not resurrect them", async () => {
  const a = await owner();
  const b = await owner();
  const other = await loginAccount(db, a.user.email, password, null);
  const credential = await authenticatePassword(db, a.user.email, password);
  const prepared = await prepareAccountExport(
    db,
    a.token,
    password,
    process.env.AUTH_RATE_LIMIT_SECRET!
  );
  let grantToken = "";
  await requestAccountGrant(
    db,
    a.user.email,
    "RESET_PASSWORD",
    async (_e, _p, token) => {
      grantToken = token;
    }
  );
  const church = await db.church.create({
    data: {
      name: "Fictional lifecycle sharing",
      summary: "Isolated fictional fixture",
      slug: a.user.username
    }
  });
  const connection = await db.churchConnection.create({
    data: {
      userId: a.user.id,
      churchId: church.id,
      state: "APPROVED",
      preference: { create: { listed: true, contactEmail: a.user.email } }
    }
  });
  const contactConnection = await db.churchConnection.create({
    data: { userId: b.user.id, churchId: church.id, state: "APPROVED" }
  });
  const appointment = await db.churchContactAssignment.create({
    data: {
      userId: b.user.id,
      churchId: church.id,
      connectionId: contactConnection.id,
      slot: "PRIMARY"
    }
  });
  const c = await db.supportCase.create({
    data: {
      requesterId: a.user.id,
      churchId: church.id,
      category: "ACCOUNT_WEBSITE",
      subject: "Private retained subject",
      description: "Private retained description",
      coordinatorShare: {
        create: {
          appointmentId: appointment.id,
          appointmentVersion: appointment.version,
          requesterConnectionId: connection.id
        }
      }
    }
  });
  const response = await post(
    {
      operation: "deactivate-account",
      currentPassword: password,
      confirmed: true
    },
    a.token
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
  assert.match(response.headers.get("set-cookie")!, /Secure/);
  assert.equal(await readAccountSession(db, a.token), null);
  assert.equal(await readAccountSession(db, other), null);
  assert.ok(await readAccountSession(db, b.token));
  await assert.rejects(issueAuthenticatedSession(db, credential, null));
  await assert.rejects(loginAccount(db, a.user.email, password, null));
  await assert.rejects(
    downloadAccountExport(
      db,
      a.token,
      prepared.authorization,
      process.env.AUTH_RATE_LIMIT_SECRET!
    ),
    sessionError
  );
  await assert.rejects(
    consumeAccountGrant(
      db,
      grantToken,
      "RESET_PASSWORD",
      "Changed-fixture-password-1",
      "Changed-fixture-password-1"
    )
  );
  await assert.rejects(getPortalSnapshot(db, a.token, "discover"));
  await assert.rejects(readSupport(db, a.token, "requests", {}));
  assert.equal(
    await db.churchDirectoryPreference.count({
      where: { connectionId: connection.id }
    }),
    0
  );
  const retained = await db.supportCase.findUniqueOrThrow({
    where: { id: c.id },
    include: { coordinatorShare: true }
  });
  assert.equal(retained.description, c.description);
  assert.ok(retained.coordinatorShare!.revokedAt);
  assert.equal(
    (
      await db.churchConnection.findUniqueOrThrow({
        where: { id: connection.id }
      })
    ).state,
    "APPROVED"
  );
  await assert.rejects(
    reactivateAccount(db, a.user.email, "Wrong-password-1", true)
  );
  const reactivated = await post({
    operation: "reactivate-account",
    email: a.user.email,
    password,
    confirmed: true
  });
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.headers.get("set-cookie"), null);
  assert.equal(await readAccountSession(db, a.token), null);
  assert.equal(
    await db.platformSession.count({ where: { userId: a.user.id } }),
    0
  );
  assert.equal(
    await db.churchDirectoryPreference.count({
      where: { connectionId: connection.id }
    }),
    0
  );
  assert.ok(
    (
      await db.supportCoordinatorShare.findUniqueOrThrow({
        where: { caseId: c.id }
      })
    ).revokedAt
  );
  assert.ok(await loginAccount(db, a.user.email, password, null));
});

test("inactive community content and relationships disappear from HTML and RSC, then return only with reactivation", async () => {
  const a = await owner();
  const b = await owner();
  const marker = a.user.username + "-post-marker";
  const commentMarker = a.user.username + "-comment-marker";
  const own = await db.platformPost.create({
    data: { authorId: a.user.id, content: marker }
  });
  const other = await db.platformPost.create({
    data: { authorId: b.user.id, content: b.user.username + "-post" }
  });
  await communityCommand(db, a.token, "comment", {
    postId: other.id,
    content: commentMarker
  });
  await communityCommand(db, a.token, "like", { postId: other.id });
  await communityCommand(db, a.token, "follow", { followingId: b.user.id });
  const homeBefore = await (await fetch(origin + "/platform")).text();
  assert.ok(homeBefore.includes(marker));
  // Comments now load through the shared thread API rather than inline feed HTML.
  const comments = async () =>
    (
      await fetch(
        origin + "/api/platform/comments?view=roots&postId=" + other.id
      )
    ).text();
  assert.ok((await comments()).includes(commentMarker));
  await deactivateAccount(db, a.token, password, true);
  assert.ok(!(await comments()).includes(commentMarker));
  for (const rsc of [false, true]) {
    for (const path of [
      "/platform",
      "/platform?post=" + own.id,
      "/platform/search?q=" + a.user.username,
      "/platform/profile/" + b.user.username
    ]) {
      const response = await fetch(origin + path, {
        headers: {
          ...(rsc ? { RSC: "1" } : {}),
          ...(path.includes("/profile/")
            ? { Cookie: "church_platform_session=" + b.token }
            : {})
        }
      });
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.ok(!body.includes(marker), path);
      assert.ok(!body.includes(commentMarker), path);
      assert.ok(!body.includes(a.user.email), path);
      if (path.includes("search"))
        assert.ok(
          !body.includes('href="/platform/profile/' + a.user.username + '"')
        );
    }
  }
  const profile = await fetch(origin + "/platform/profile/" + a.user.username, {
    headers: { Cookie: "church_platform_session=" + b.token }
  });
  assert.equal(profile.status, 404);
  assert.ok(!(await profile.text()).includes(marker));
  const bProfile = await readAccountSession(db, b.token);
  assert.equal(bProfile!._count.followers, 0);
  for (const operation of [
    "post",
    "comment",
    "like",
    "follow",
    "delete-post",
    "unfollow",
    "delete-comment"
  ] as const)
    await assert.rejects(
      communityCommand(db, a.token, operation, {
        content: "Must not write",
        postId: own.id,
        followingId: b.user.id
      }),
      sessionError
    );
  await assert.rejects(
    communityCommand(db, b.token, "follow", { followingId: a.user.id }),
    (e: unknown) => e instanceof Error && "status" in e && e.status === 404
  );
  await assert.rejects(
    communityCommand(db, b.token, "comment", {
      postId: own.id,
      content: "Blocked inactive target"
    }),
    (e: unknown) => e instanceof Error && "status" in e && e.status === 404
  );
  await assert.rejects(
    communityCommand(db, b.token, "like", { postId: own.id }),
    (e: unknown) => e instanceof Error && "status" in e && e.status === 404
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: own.id } }),
    0
  );
  assert.equal(
    await db.platformPostLike.count({ where: { postId: own.id } }),
    0
  );
  assert.equal(
    await db.platformFollow.count({
      where: { followerId: b.user.id, followingId: a.user.id }
    }),
    0
  );
  await reactivateAccount(db, a.user.email, password, true);
  assert.equal(await readAccountSession(db, a.token), null);
  assert.ok(
    (await (await fetch(origin + "/platform")).text()).includes(marker)
  );
  assert.ok((await comments()).includes(commentMarker));
  assert.equal((await readAccountSession(db, b.token))!._count.followers, 1);
});

test("stale community writes and concurrent role assignments cannot cross deactivation", async () => {
  const a = await owner();
  const wrapped = new Proxy(db, {
    get(target, key) {
      if (key === "$transaction")
        return async (...args: unknown[]) => {
          await deactivateAccount(db, a.token, password, true);
          return Reflect.apply(target.$transaction, target, args);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  await assert.rejects(
    communityCommand(wrapped, a.token, "post", {
      content: "Queued before deactivation"
    }),
    sessionError
  );
  assert.equal(
    await db.platformPost.count({ where: { authorId: a.user.id } }),
    0
  );
  const operator = await owner();
  await db.platformOperatorGrant.create({
    data: { userId: operator.user.id, capability: "MANAGE_CHURCH_ACCESS" }
  });
  const church = await db.church.create({
    data: {
      name: "Fictional concurrent handoff",
      summary: "Isolated fictional fixture",
      slug: operator.user.username
    }
  });
  for (let index = 0; index < 3; index++) {
    const target = await owner();
    const results = await Promise.allSettled([
      deactivateAccount(db, target.token, password, true),
      portalCommand(db, operator.token, {
        operation: "grant",
        churchId: church.id,
        userId: target.user.id,
        capability: "REVIEW_CONNECTIONS",
        expectedVersion: 0
      })
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const saved = await db.platformUser.findUniqueOrThrow({
      where: { id: target.user.id }
    });
    const grants = await db.churchCapabilityGrant.count({
      where: { userId: target.user.id, revokedAt: null }
    });
    assert.ok(saved.deactivatedAt ? grants === 0 : grants === 1);
  }
});

test("reactivation never bypasses suspension or claims legacy accounts; active-account requests preserve sessions", async () => {
  const a = await owner();
  await reactivateAccount(db, a.user.email, password, true);
  assert.ok(await readAccountSession(db, a.token));
  await deactivateAccount(db, a.token, password, true);
  await db.platformUser.update({
    where: { id: a.user.id },
    data: { suspendedAt: new Date() }
  });
  await assert.rejects(reactivateAccount(db, a.user.email, password, true));
  await db.platformUser.update({
    where: { id: a.user.id },
    data: { suspendedAt: null, passwordHash: null }
  });
  await assert.rejects(reactivateAccount(db, a.user.email, password, true));
  assert.equal(
    (
      await post({
        operation: "reactivate-account",
        email: a.user.email,
        password,
        confirmed: true,
        suspendedAt: null
      })
    ).status,
    400
  );
  assert.equal(
    (
      await post({
        operation: "reactivate-account",
        email: "missing@example.test",
        password,
        confirmed: true
      })
    ).status,
    400
  );
  assert.ok(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.user.id } }))
      .deactivatedAt
  );
});

test("new password recovery can recover an inactive account without making it active", async () => {
  const a = await owner();
  await deactivateAccount(db, a.token, password, true);
  let token = "";
  await requestAccountGrant(
    db,
    a.user.email,
    "RESET_PASSWORD",
    async (_e, _p, value) => {
      token = value;
    }
  );
  assert.ok(token);
  const replacement = "Fictional-recovered-password-2";
  await consumeAccountGrant(
    db,
    token,
    "RESET_PASSWORD",
    replacement,
    replacement
  );
  assert.ok(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.user.id } }))
      .deactivatedAt
  );
  await assert.rejects(loginAccount(db, a.user.email, replacement, null));
  await assert.rejects(reactivateAccount(db, a.user.email, password, true));
  await reactivateAccount(db, a.user.email, replacement, true);
  assert.ok(await loginAccount(db, a.user.email, replacement, null));
});

test("incorrect reactivation passwords are durably rate limited", async () => {
  const a = await owner();
  await deactivateAccount(db, a.token, password, true);
  for (let index = 0; index < 11; index++) {
    const response = await post({
      operation: "reactivate-account",
      email: a.user.email,
      password: "Wrong-password-3",
      confirmed: true
    });
    assert.equal(response.status, index < 10 ? 400 : 429);
    if (index === 10) assert.equal(response.headers.get("retry-after"), "900");
  }
  assert.ok(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.user.id } }))
      .deactivatedAt
  );
});
