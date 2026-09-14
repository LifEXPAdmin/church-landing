import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  loginAccount,
  readAccountSession,
  registerAccount,
  updateAccountProfile
} from "../lib/platform/accounts";
import {
  getMemberProfile,
  getProfileEditor,
  getVisitorProfilePreview
} from "../lib/platform/profiles";
import { postCommand } from "../lib/platform/post-commands";
import { listPosts } from "../lib/platform/post-reads";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("Exploring Faith survives verified signup and login without authority or public disclosure", async () => {
  const actor = await createPortalActor(db, "exploring", {
    role: "EXPLORING_FAITH"
  });
  const other = await createPortalActor(db, "reader");
  const saved = await db.platformUser.findUniqueOrThrow({
    where: { id: actor.id }
  });
  assert.equal(saved.role, "EXPLORING_FAITH");
  assert.ok(saved.emailVerifiedAt);
  assert.ok(saved.adultAcknowledgedAt);
  const token = await loginAccount(db, saved.email, actor.password, null);
  assert.equal((await readAccountSession(db, token))?.role, "EXPLORING_FAITH");
  assert.equal((await getProfileEditor(db, token)).role, "EXPLORING_FAITH");
  assert.equal(
    await db.churchConnection.count({ where: { userId: actor.id } }),
    0
  );
  assert.equal(
    await db.platformOperatorGrant.count({ where: { userId: actor.id } }),
    0
  );
  const post = await postCommand(db, token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "A fictional reader introduction",
    audience: "PUBLIC"
  });
  const member = await getMemberProfile(db, other.token, actor.username);
  assert.equal(member.role, null);
  assert.ok(!JSON.stringify(member).includes("EXPLORING_FAITH"));
  assert.ok(
    !JSON.stringify(
      await getMemberProfile(db, token, actor.username, { preview: "member" })
    ).includes("EXPLORING_FAITH")
  );
  assert.ok(
    !JSON.stringify(
      await getVisitorProfilePreview(db, token, actor.username)
    ).includes("EXPLORING_FAITH")
  );
  const guest = await listPosts(db, null, { authorId: actor.id });
  assert.ok(guest.some((p) => p.id === post.id));
  assert.ok(!JSON.stringify(guest).includes("EXPLORING_FAITH"));
});

test("participation edits use owner and version checks, preserve old clients, and keep existing choices", async () => {
  const actor = await createPortalActor(db, "choices", { role: "CREATOR" });
  const fields = {
    name: actor.name,
    role: "EXPLORING_FAITH",
    expectedVersion: 0
  };
  await updateAccountProfile(db, actor.token, fields);
  assert.equal(
    (await getProfileEditor(db, actor.token)).role,
    "EXPLORING_FAITH"
  );
  await assert.rejects(
    updateAccountProfile(db, actor.token, { ...fields, role: "BELIEVER" }),
    /profile-conflict/
  );
  await updateAccountProfile(db, actor.token, {
    name: actor.name,
    bio: "Old client preserved choice"
  });
  assert.equal(
    (await getProfileEditor(db, actor.token)).role,
    "EXPLORING_FAITH"
  );
  for (const role of ["ADMIN", "REVIEW_COMMUNITY_REPORTS", null, 1])
    await assert.rejects(
      updateAccountProfile(db, actor.token, {
        ...fields,
        expectedVersion: 2,
        role
      })
    );
  for (const role of [
    "BELIEVER",
    "CHURCH",
    "CREATOR",
    "BUSINESS",
    "BUILDER"
  ] as const) {
    const prior = await getProfileEditor(db, actor.token);
    await updateAccountProfile(db, actor.token, {
      name: actor.name,
      role,
      expectedVersion: prior.presentation.version
    });
    assert.equal((await getProfileEditor(db, actor.token)).role, role);
  }
  assert.equal(
    await db.churchConnection.count({ where: { userId: actor.id } }),
    0
  );
  assert.equal(
    await db.platformOperatorGrant.count({ where: { userId: actor.id } }),
    0
  );
  await db.platformSession.deleteMany({ where: { userId: actor.id } });
  await assert.rejects(
    updateAccountProfile(db, actor.token, { ...fields, expectedVersion: 7 })
  );
});

test("duplicate Exploring Faith registration never reclassifies an existing account", async () => {
  const actor = await createPortalActor(db, "original", { role: "CREATOR" });
  const original = await db.platformUser.findUniqueOrThrow({
    where: { id: actor.id }
  });
  await registerAccount(db, {
    name: "Another name",
    username: `new_${randomUUID().slice(0, 8)}`,
    email: original.email,
    password: "Fictional-password-99",
    confirmPassword: "Fictional-password-99",
    role: "EXPLORING_FAITH"
  });
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: actor.id } }),
    original
  );
});
