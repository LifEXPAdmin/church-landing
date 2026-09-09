import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  registerAccount,
  loginAccount,
  changeAccountPassword
} from "../lib/platform/accounts";
import {
  prepareAccountExport,
  downloadAccountExport,
  AccountExportError
} from "../lib/platform/account-export";
import { hashSessionToken } from "../lib/platform/auth";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
after(() => db.$disconnect());
beforeEach(() => db.platformAuthLimit.deleteMany());
const password = "Fictional-export-password-1";
async function owner() {
  const username = "export_" + randomBytes(6).toString("hex");
  await registerAccount(db, {
    name: "Export Fixture",
    username,
    email: username + "@example.test",
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  const token = await loginAccount(
    db,
    user.email,
    password,
    "Private export browser marker"
  );
  return { user, token };
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
const invalidProof = (error: unknown) =>
  error instanceof AccountExportError && error.code === "authorization";

test("export includes only the owner's explicit fields, directory choices and own support submissions", async () => {
  const a = await owner();
  const b = await owner();
  const ownPost = await db.platformPost.create({
    data: { authorId: a.user.id, content: "Export own post marker" }
  });
  const otherPost = await db.platformPost.create({
    data: { authorId: b.user.id, content: "Excluded stranger post marker" }
  });
  await db.platformPostComment.createMany({
    data: [
      {
        authorId: a.user.id,
        postId: otherPost.id,
        content: "Export own comment marker"
      },
      {
        authorId: b.user.id,
        postId: ownPost.id,
        content: "Excluded stranger comment marker"
      }
    ]
  });
  await db.platformPostLike.create({
    data: { userId: a.user.id, postId: otherPost.id }
  });
  await db.platformFollow.create({
    data: { followerId: a.user.id, followingId: b.user.id }
  });
  const church = await db.church.create({
    data: {
      slug: a.user.username,
      name: "Export Fixture Church",
      summary: "Fictional only"
    }
  });
  for (const person of [a, b])
    await db.churchConnection.create({
      data: {
        userId: person.user.id,
        churchId: church.id,
        state: "APPROVED",
        preference: {
          create: {
            contactEmail: person.user.email,
            phone: person === a ? "own-phone-marker" : "excluded-phone-marker"
          }
        }
      }
    });
  const ownCase = await db.supportCase.create({
    data: {
      requesterId: a.user.id,
      category: "ACCOUNT_WEBSITE",
      subject: "Own export request",
      description: "Export own support description"
    }
  });
  const otherCase = await db.supportCase.create({
    data: {
      requesterId: b.user.id,
      category: "ACCOUNT_WEBSITE",
      subject: "Excluded stranger support subject",
      description: "Excluded stranger support description"
    }
  });
  await db.supportMessage.createMany({
    data: [
      {
        caseId: ownCase.id,
        authorId: a.user.id,
        kind: "REPLY",
        version: 1,
        body: "Export own reply marker"
      },
      {
        caseId: ownCase.id,
        authorId: b.user.id,
        kind: "REPLY",
        version: 2,
        body: "Excluded staff reply marker"
      },
      {
        caseId: otherCase.id,
        authorId: a.user.id,
        kind: "REPLY",
        version: 1,
        body: "Excluded staff work marker"
      },
      {
        caseId: ownCase.id,
        authorId: a.user.id,
        kind: "REPLY",
        version: 3,
        body: "Excluded redacted marker",
        redactedAt: new Date()
      }
    ]
  });
  const prepared = await prepareAccountExport(db, a.token, password, secret);
  const content = await downloadAccountExport(
    db,
    a.token,
    prepared.authorization,
    secret
  );
  const data = JSON.parse(content);
  assert.equal(data.account.email, a.user.email);
  assert.equal(data.posts.length, 1);
  assert.equal(data.comments.length, 1);
  assert.equal(data.likes[0].postId, otherPost.id);
  assert.equal(data.following[0].following.username, b.user.username);
  assert.equal(data.churchConnections[0].preference.contactEmail, a.user.email);
  assert.equal(data.supportRequests.length, 1);
  assert.equal(data.supportMessages.length, 1);
  for (const marker of [
    "Export own post marker",
    "Export own comment marker",
    "own-phone-marker",
    "Export own support description",
    "Export own reply marker"
  ])
    assert.ok(content.includes(marker));
  for (const excluded of [
    "Excluded",
    "excluded-phone-marker",
    b.user.email,
    a.user.passwordHash!,
    a.token,
    hashSessionToken(a.token),
    prepared.authorization,
    "credentialVersion",
    "passwordHash",
    "tokenHash",
    "Private export browser marker",
    "ownerGrantId"
  ])
    assert.ok(
      !content.includes(excluded),
      `Unexpected exported field: ${excluded.slice(0, 15)}`
    );
});

test("preparation requires the current password and proofs cannot move between accounts or sessions", async () => {
  const a = await owner();
  const b = await owner();
  await assert.rejects(
    prepareAccountExport(db, a.token, "Wrong-export-password", secret)
  );
  const prepared = await prepareAccountExport(db, a.token, password, secret);
  const second = await loginAccount(db, a.user.email, password, null);
  for (const token of [b.token, second])
    await assert.rejects(
      downloadAccountExport(db, token, prepared.authorization, secret),
      invalidProof
    );
  for (const value of [
    undefined,
    {},
    "invalid",
    prepared.authorization + "x",
    prepared.authorization.replace(/^\d+/, "9999999999999")
  ])
    await assert.rejects(
      downloadAccountExport(db, a.token, value, secret),
      invalidProof
    );
  await assert.rejects(
    downloadAccountExport(
      db,
      a.token,
      prepared.authorization,
      secret + "changed"
    ),
    invalidProof
  );
  assert.equal(
    JSON.parse(
      await downloadAccountExport(db, a.token, prepared.authorization, secret)
    ).account.email,
    a.user.email
  );
});

test("expired authorization and revoked, suspended or changed credentials deny export", async (t) => {
  const a = await owner();
  const prepared = await prepareAccountExport(db, a.token, password, secret);
  const now = Date.now;
  t.mock.method(Date, "now", () => now() + 61_000);
  await assert.rejects(
    downloadAccountExport(db, a.token, prepared.authorization, secret),
    invalidProof
  );
  t.mock.restoreAll();
  await db.platformUser.update({
    where: { id: a.user.id },
    data: { suspendedAt: new Date() }
  });
  await assert.rejects(prepareAccountExport(db, a.token, password, secret));
  await assert.rejects(
    downloadAccountExport(db, a.token, prepared.authorization, secret)
  );
  await assert.rejects(
    changeAccountPassword(
      db,
      a.token,
      password,
      "New-export-password",
      "New-export-password"
    )
  );
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: a.user.id } }))
      .passwordHash,
    a.user.passwordHash
  );
  await db.platformUser.update({
    where: { id: a.user.id },
    data: { suspendedAt: null, credentialVersion: { increment: 1 } }
  });
  await assert.rejects(
    downloadAccountExport(db, a.token, prepared.authorization, secret)
  );
  const fresh = await loginAccount(db, a.user.email, password, null);
  const next = await prepareAccountExport(db, fresh, password, secret);
  await db.platformSession.delete({
    where: { tokenHash: hashSessionToken(fresh) }
  });
  await assert.rejects(
    downloadAccountExport(db, fresh, next.authorization, secret)
  );
});

test("large exports fail explicitly without returning a silently truncated archive", async () => {
  const a = await owner();
  await db.platformPost.createMany({
    data: Array.from({ length: 2001 }, () => ({
      authorId: a.user.id,
      content: "Large synthetic export row"
    }))
  });
  const prepared = await prepareAccountExport(db, a.token, password, secret);
  await assert.rejects(
    downloadAccountExport(db, a.token, prepared.authorization, secret),
    (error: unknown) =>
      error instanceof AccountExportError && error.code === "size"
  );
  assert.equal(
    await db.platformPost.count({ where: { authorId: a.user.id } }),
    2001
  );
  await db.platformPost.deleteMany({ where: { authorId: a.user.id } });
});

test("production HTTPS export is an owner-bound no-store attachment with strict origin and field checks", async () => {
  const a = await owner();
  const b = await owner();
  assert.equal(
    (await post({ operation: "prepare-export", currentPassword: password }))
      .status,
    401
  );
  assert.equal(
    (
      await post(
        {
          operation: "prepare-export",
          currentPassword: "Wrong-export-password"
        },
        a.token
      )
    ).status,
    400
  );
  const prepared = await post(
    { operation: "prepare-export", currentPassword: password },
    a.token
  );
  assert.equal(prepared.status, 200);
  const { authorization } = await prepared.json();
  assert.equal(
    (await post({ operation: "download-export", authorization }, b.token))
      .status,
    400
  );
  assert.equal(
    (
      await post(
        { operation: "download-export", authorization, userId: b.user.id },
        a.token
      )
    ).status,
    400
  );
  assert.equal(
    (
      await post({ operation: "download-export", authorization }, a.token, {
        Origin: "https://attacker.test"
      })
    ).status,
    403
  );
  const response = await post(
    { operation: "download-export", authorization },
    a.token
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-disposition")!,
    /^attachment; filename="godschurches-account.json"$/
  );
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("set-cookie"), null);
  const content = await response.text();
  assert.equal(JSON.parse(content).account.email, a.user.email);
  assert.ok(!content.includes(b.user.email));
  assert.ok(!content.includes(authorization));
  const page = await fetch(origin + "/platform/settings", {
    headers: { Cookie: "church_platform_session=" + a.token }
  });
  const html = await page.text();
  assert.match(html, /Download your account data/);
  assert.ok(!html.includes(a.user.email));
  assert.ok(!html.includes(authorization));
});
