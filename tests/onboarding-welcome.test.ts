import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  requestConnection
} from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { readOnboarding, saveOnboarding } from "../lib/platform/onboarding";
import {
  readChurchWelcomeHost,
  welcomeDateRange
} from "../lib/platform/church-welcome-host";
import {
  readWelcomePost,
  saveChurchWelcome
} from "../lib/platform/church-welcome-commands";
import { portalCommand, PortalError } from "../lib/platform/portal";
import { postCommand } from "../lib/platform/post-commands";
import { commentCommand } from "../lib/platform/comment-commands";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { getPostParticipation } from "../lib/platform/post-participation-reads";
import { relationshipCommand } from "../lib/platform/relationships";
import { safeAccountReturn } from "../lib/platform/account-entry";
const db = new PrismaClient();
let f: Awaited<ReturnType<typeof seedParticipation>>;
before(async () => {
  await assertPortalTestDatabase(db);
  f = await seedParticipation(db);
});
after(() => db.$disconnect());
const denied = (work: Promise<unknown>, status: number) =>
  assert.rejects(
    work,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
const tag = (
  token: string,
  id: string,
  purpose = "INTRODUCTION",
  version = 0
) =>
  saveChurchWelcome(db, token, {
    operation: "tag",
    churchId: f.churchA.id,
    postId: id,
    purpose,
    expectedVersion: version,
    mutationId: randomUUID()
  });
const host = (token = f.lee.token, more: Record<string, unknown> = {}) =>
  readChurchWelcomeHost(db, token, { churchId: f.churchA.id, ...more });
const post = (content: string) =>
  postCommand(db, f.lee.token, {
    operation: "create",
    requestKey: randomUUID(),
    audienceChurchId: f.churchA.id,
    audience: "CHURCH",
    content
  });

test("first steps resume by current account, with optional hints isolated from consent, credentials and grants", async () => {
  const newcomer = await createPortalActor(db, "firststeps");
  let view = await readOnboarding(db, newcomer.token);
  assert.equal(view.ownerId, newcomer.id);
  assert.equal(view.week, null);
  assert.ok(view.steps.every((s) => s.optional && !s.dismissed));
  const input = {
    operation: "onboarding",
    step: "all",
    dismissed: true,
    expectedVersion: 0,
    mutationId: randomUUID()
  };
  const result = await saveOnboarding(db, newcomer.token, input);
  assert.deepEqual(await saveOnboarding(db, newcomer.token, input), result);
  view = await readOnboarding(db, newcomer.token);
  assert.ok(view.steps.every((s) => s.dismissed));
  assert.equal(view.version, 1);
  await denied(
    Promise.resolve().then(() =>
      saveOnboarding(db, newcomer.token, { ...input, ownerId: f.lee.id })
    ),
    400
  );
  await denied(
    Promise.resolve().then(() =>
      saveOnboarding(db, newcomer.token, {
        ...input,
        step: "grant-owner",
        mutationId: randomUUID()
      })
    ),
    400
  );
  await denied(
    saveOnboarding(db, newcomer.token, {
      ...input,
      step: "profile",
      mutationId: randomUUID()
    }),
    409
  );
  assert.equal(
    await db.churchCapabilityGrant.count({ where: { userId: newcomer.id } }),
    0
  );
  assert.equal(
    await db.socialRelationship.count({ where: { ownerId: newcomer.id } }),
    0
  );
  assert.equal(
    await db.churchDirectoryPreference.count({
      where: { connection: { userId: newcomer.id } }
    }),
    0
  );
  assert.ok(
    (await readOnboarding(db, f.lee.token)).steps.every((s) => !s.dismissed)
  );
  await saveOnboarding(db, newcomer.token, {
    ...input,
    dismissed: false,
    expectedVersion: 1,
    mutationId: randomUUID()
  });
  assert.ok(
    (await readOnboarding(db, newcomer.token)).steps.every((s) => !s.dismissed)
  );
  await denied(readOnboarding(db, null), 401);
});

test("account export includes owned hints and author labels only; permanent closure removes their retained metadata", async () => {
  const owner = await createPortalActor(db, "onboardprivacy");
  const connection = await requestConnection(db, owner, f.churchA.id);
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  await saveOnboarding(db, owner.token, {
    operation: "onboarding",
    step: "profile",
    dismissed: true,
    expectedVersion: 0,
    mutationId: randomUUID()
  });
  const created = await postCommand(db, owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    audienceChurchId: f.churchA.id,
    audience: "CHURCH",
    content: "Fictional account-owned welcome label"
  });
  await tag(owner.token, created.id, "QUESTION");
  const { prepareAccountExport, downloadAccountExport } =
    await import("../lib/platform/account-export");
  const secret = "fictional-onboarding-export-secret".repeat(3);
  const proof = await prepareAccountExport(
    db,
    owner.token,
    owner.password,
    secret
  );
  const exported = JSON.parse(
    await downloadAccountExport(db, owner.token, proof.authorization, secret)
  );
  assert.deepEqual(exported.socialPreferences[0].onboardingDismissed, [
    "profile"
  ]);
  assert.equal(exported.socialPreferences[0].onboardingVersion, 1);
  assert.equal(exported.posts.length, 1);
  assert.equal(exported.posts[0].id, created.id);
  assert.deepEqual(exported.posts[0].welcomeThread, { purpose: "QUESTION" });
  assert.ok(!Object.hasOwn(exported, "churchWelcomeThreads"));
  const { requestPermanentAccountDeletion } =
    await import("../lib/platform/account-deletion");
  const { eraseRequestedAccountData } =
    await import("../lib/platform/account-erasure");
  const { createSessionToken } = await import("../lib/platform/auth");
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    owner.token,
    owner.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: owner.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  assert.equal(
    await db.socialPreferences.findUnique({ where: { ownerId: owner.id } }),
    null
  );
  assert.equal(
    await db.churchWelcomeThread.findUnique({ where: { postId: created.id } }),
    null
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: created.id } }))
      .status,
    "WITHDRAWN"
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: f.post.id } }))
      .status,
    "PUBLISHED"
  );
});

test("pending newcomer sees no church cards; ordinary approval unlocks real events, notices and progress without any follows", async () => {
  const newcomer = await createPortalActor(db, "resuming");
  const connection = await requestConnection(db, newcomer, f.churchA.id);
  assert.equal((await readOnboarding(db, newcomer.token)).week, null);
  await denied(readOnboarding(db, newcomer.token, f.churchA.id), 403);
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  const view = await readOnboarding(
    db,
    newcomer.token,
    f.churchA.id,
    new Date(Date.now() + 86400000)
  );
  assert.equal(view.week?.church.id, f.churchA.id);
  assert.ok(view.week?.events.some((e) => e.id === f.occurrence.id));
  assert.ok(view.week?.notices.some((p) => p.id === f.post.id));
  assert.equal(view.steps.find((s) => s.id === "church")?.done, true);
  assert.equal(
    await db.socialRelationship.count({ where: { ownerId: newcomer.id } }),
    0
  );
  assert.doesNotMatch(
    JSON.stringify(view),
    /private-login@example|Fictional-only-|fictional-shared-|555 0199/
  );
  await denied(readOnboarding(db, newcomer.token, f.churchB.id), 403);
  const created = await postCommand(db, newcomer.token, {
    operation: "create",
    requestKey: randomUUID(),
    audienceChurchId: f.churchA.id,
    audience: "CHURCH",
    content: "An explicitly published fictional introduction."
  });
  await tag(newcomer.token, created.id);
  assert.equal(
    (await readOnboarding(db, newcomer.token)).steps.find(
      (s) => s.id === "contribute"
    )?.done,
    true
  );
});

test("host permission is explicitly granted; publishers can choose current church voice welcome but cannot read the host queue", async () => {
  await denied(host(), 403);
  assert.equal((await host(f.ada.token)).host, false);
  assert.equal((await host(f.ada.token)).totals, null);
  await denied(
    saveChurchWelcome(db, f.lee.token, {
      operation: "welcome",
      churchId: f.churchA.id,
      postId: f.post.id,
      expectedVersion: 0,
      mutationId: randomUUID()
    }),
    403
  );
  const input = {
    operation: "welcome",
    churchId: f.churchA.id,
    postId: f.post.id,
    expectedVersion: 0,
    mutationId: randomUUID()
  };
  await saveChurchWelcome(db, f.ada.token, input);
  assert.equal(
    (await readOnboarding(db, f.lee.token)).week?.welcome?.id,
    f.post.id
  );
  assert.equal((await readOnboarding(db, f.blake.token)).week?.welcome, null);
  const personal = await post("A member speaks personally, not as the church.");
  await denied(
    saveChurchWelcome(db, f.ada.token, {
      ...input,
      postId: personal.id,
      expectedVersion: 1,
      mutationId: randomUUID()
    }),
    403
  );
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.lee.id,
    capability: "HOST_CHURCH_WELCOME",
    expectedVersion: 0
  });
  assert.equal((await host()).host, true);
  assert.equal((await host()).canPublish, false);
  await denied(
    readChurchWelcomeHost(db, f.lee.token, { churchId: f.churchB.id }),
    403
  );
});

test("deliberate tags and private handled state do not change audience; own replies do not answer, blocked/deleted replies do not count", async () => {
  const p = await post("Fictional introduction for welcome follow-up.");
  assert.equal(
    (await host()).threads.some((t) => t.id === p.id),
    false
  );
  await tag(f.lee.token, p.id);
  assert.equal(
    (await host()).threads.some((t) => t.id === p.id),
    true
  );
  const c = (token: string, content: string) =>
    commentCommand(db, token, {
      operation: "create",
      postId: p.id,
      content,
      mutationId: randomUUID()
    });
  await c(f.lee.token, "My own added detail is not somebody answering.");
  assert.equal(
    (await host()).threads.some((t) => t.id === p.id),
    true
  );
  const reply = await c(
    f.val.token,
    "A fictional welcome reply from another person."
  );
  assert.equal(
    (await host()).threads.some((t) => t.id === p.id),
    false
  );
  await relationshipCommand(db, f.lee.token, {
    operation: "block",
    kind: "person",
    targetId: f.val.id,
    desired: true,
    expectedVersion: 0,
    mutationId: randomUUID()
  });
  assert.equal(
    (await host()).threads.some((t) => t.id === p.id),
    true
  );
  const rel = await db.socialRelationship.findUniqueOrThrow({
    where: {
      ownerId_targetUserId: { ownerId: f.lee.id, targetUserId: f.val.id }
    }
  });
  await relationshipCommand(db, f.lee.token, {
    operation: "block",
    kind: "person",
    targetId: f.val.id,
    desired: false,
    expectedVersion: rel.version,
    mutationId: randomUUID()
  });
  await commentCommand(db, f.val.token, {
    operation: "delete",
    postId: p.id,
    commentId: reply.id,
    expectedVersion: reply.version,
    mutationId: randomUUID()
  });
  assert.equal(
    (await host()).threads.some((t) => t.id === p.id),
    true
  );
  const input = {
    operation: "handled",
    churchId: f.churchA.id,
    postId: p.id,
    handled: true,
    expectedVersion: 1,
    mutationId: randomUUID()
  };
  const receipt = await saveChurchWelcome(db, f.lee.token, input);
  assert.deepEqual(await saveChurchWelcome(db, f.lee.token, input), receipt);
  assert.equal(
    (await host()).threads.some((t) => t.id === p.id),
    false
  );
  assert.equal(
    (await host(f.lee.token, { queue: "handled" })).threads.some(
      (t) => t.id === p.id
    ),
    true
  );
  await denied(tag(f.val.token, p.id, "QUESTION", 2), 403);
  await denied(
    saveChurchWelcome(db, f.val.token, { ...input, mutationId: randomUUID() }),
    403
  );
  await tag(f.lee.token, p.id, "QUESTION", 2);
  assert.equal(
    (await host()).threads.some((t) => t.id === p.id),
    true
  );
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: p.id } })).audience,
    "CHURCH"
  );
  await tag(f.lee.token, p.id, "NONE", 3);
  assert.equal(
    (await host()).threads.some((t) => t.id === p.id),
    false
  );
});

test("operational counts reconcile actual permitted rows and current event participation without identities or prayer records", async () => {
  await f.poll();
  await f.slot();
  const participation = await getPostParticipation(db, f.lee.token, f.post.id);
  await f.command(f.lee, {
    operation: "vote",
    pollVersion: participation.poll!.version,
    expectedVersion: 0,
    optionIds: [participation.poll!.options[0].id]
  });
  await calendarCommand(db, f.lee.token, {
    operation: "rsvp",
    eventId: f.event.id,
    occurrenceId: f.occurrence.id,
    occurrenceVersion: f.occurrence.version,
    expectedVersion: 0,
    state: "GOING"
  });
  // Existing volunteer owner enforces capacity and version; use its real command.
  await f.command(f.lee, {
    operation: "volunteer",
    slotId: participation.slots[0].id,
    slotVersion: participation.slots[0].version,
    expectedVersion: 0
  });
  const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    until = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const view = await host(f.lee.token, { from, until });
  assert.equal(view.totals?.ballots, 1);
  assert.deepEqual(view.totals?.responses, [{ state: "GOING", count: 1 }]);
  assert.equal(view.totals?.confirmedVolunteers, 1);
  assert.equal(view.totals?.openVolunteerPlaces, 0);
  const snapshot = JSON.stringify(view.totals);
  for (const privateValue of [
    f.lee.id,
    f.lee.email,
    f.val.id,
    "prayer",
    "phone",
    "contactEmail",
    "reading"
  ])
    assert.ok(!snapshot.includes(privateValue));
  const home = await readOnboarding(
    db,
    f.lee.token,
    f.churchA.id,
    new Date(Date.now() + 86400000)
  );
  assert.equal(
    home.week?.events.find((e) => e.id === f.occurrence.id)?.response,
    "GOING"
  );
  assert.ok(home.week?.roles.some((r) => r.committed));
  await db.calendarEvent.update({
    where: { id: f.event.id },
    data: { visibility: "PRIVATE" }
  });
  const hidden = await host(f.lee.token, { from, until });
  assert.deepEqual(hidden.totals?.responses, []);
  assert.equal(hidden.totals?.confirmedVolunteers, 0);
  assert.ok(
    !(await readOnboarding(db, f.lee.token, f.churchA.id)).week?.events.some(
      (e) => e.id === f.occurrence.id
    )
  );
  assert.equal((await readOnboarding(db, f.lee.token)).week?.welcome, null);
  await db.calendarEvent.update({
    where: { id: f.event.id },
    data: { visibility: "CHURCH" }
  });
});

test("revocation removes host reads, source actions and exact replay; new members of either church use the same ordinary boundaries", async () => {
  const p = await post(
    "Private source must leave the host queue on revocation."
  );
  await tag(f.lee.token, p.id);
  const input = {
    operation: "handled",
    churchId: f.churchA.id,
    postId: p.id,
    handled: true,
    expectedVersion: 1,
    mutationId: randomUUID()
  };
  await saveChurchWelcome(db, f.lee.token, input);
  const grant = await db.churchCapabilityGrant.findFirstOrThrow({
    where: {
      churchId: f.churchA.id,
      userId: f.lee.id,
      capability: "HOST_CHURCH_WELCOME",
      revokedAt: null
    }
  });
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() }
  });
  await denied(host(), 403);
  await denied(saveChurchWelcome(db, f.lee.token, input), 403);
  await db.churchConnection.update({
    where: { userId_churchId: { userId: f.lee.id, churchId: f.churchA.id } },
    data: { state: "REMOVED" }
  });
  assert.equal((await readOnboarding(db, f.lee.token)).week, null);
  await denied(readWelcomePost(db, f.lee.token, f.churchA.id, p.id), 403);
  await denied(readOnboarding(db, f.lee.token, f.churchA.id), 403);
  const other = await readOnboarding(db, f.blake.token, f.churchB.id);
  assert.equal(other.week?.church.id, f.churchB.id);
  assert.deepEqual(other.week?.events, []);
  assert.ok(!JSON.stringify(other).includes(p.id));
});

test("welcome queue pagination advances across answered candidates and never truncates remaining unanswered threads", async () => {
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchB.id,
    userId: f.blake.id,
    capability: "HOST_CHURCH_WELCOME",
    expectedVersion: 0
  });
  const prefix = "q_" + randomUUID(),
    ids = Array.from(
      { length: 121 },
      (_, i) => prefix + "_" + String(i).padStart(3, "0")
    );
  await db.platformPost.createMany({
    data: ids.map((id) => ({
      id,
      authorId: f.blake.id,
      audienceChurchId: f.churchB.id,
      audience: "CHURCH" as const,
      content: "Fictional bounded queue fixture"
    }))
  });
  await db.churchWelcomeThread.createMany({
    data: ids.map((postId) => ({
      postId,
      churchId: f.churchB.id,
      purpose: "QUESTION"
    }))
  });
  // A different currently active identity answers the first 100. These rows are
  // isolated pagination fixtures; no production rows or notification send exists.
  await db.platformPostComment.createMany({
    data: ids.slice(0, 100).map((postId) => ({
      postId,
      authorId: f.reviewerB.id,
      content: "Fictional reply for pagination"
    }))
  });
  let page = await readChurchWelcomeHost(db, f.blake.token, {
    churchId: f.churchB.id
  });
  assert.deepEqual(page.threads, []);
  assert.equal(page.nextCursor, ids[99]);
  page = await readChurchWelcomeHost(db, f.blake.token, {
    churchId: f.churchB.id,
    after: page.nextCursor
  });
  assert.deepEqual(
    page.threads.map((t) => t.id),
    ids.slice(100, 120)
  );
  assert.equal(page.nextCursor, ids[119]);
  page = await readChurchWelcomeHost(db, f.blake.token, {
    churchId: f.churchB.id,
    after: page.nextCursor
  });
  assert.deepEqual(
    page.threads.map((t) => t.id),
    ids.slice(120)
  );
  assert.equal(page.nextCursor, null);
});

test("date windows and account return destinations reject unsupported inputs without replaying actions", () => {
  assert.equal(welcomeDateRange("2026-09-01", "2026-09-02").from, "2026-09-01");
  for (const [from, until] of [
    ["2026-02-30", "2026-03-03"],
    ["2026-09-02", "2026-09-01"],
    ["2026-01-01", "2026-12-31"],
    ["x", "y"]
  ])
    assert.throws(() => welcomeDateRange(from, until), PortalError);
  assert.equal(
    safeAccountReturn("/platform/getting-started"),
    "/platform/getting-started"
  );
  assert.equal(
    safeAccountReturn("/platform/churches/ordinary-id/welcome"),
    "/platform/churches/ordinary-id/welcome"
  );
  assert.equal(
    safeAccountReturn("https://other.test/platform/getting-started"),
    "/platform"
  );
});
