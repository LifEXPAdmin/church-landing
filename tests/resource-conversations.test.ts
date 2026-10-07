import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedVolunteerApplications } from "./seed-volunteer-applications";
import { readComments, readCommentDrafts } from "../lib/platform/comment-reads";

import { randomUUID } from "node:crypto";
import { commentCommand } from "../lib/platform/comment-commands";
import { volunteerCommand } from "../lib/platform/volunteer-commands";
import { readVolunteerOpportunity } from "../lib/platform/volunteer-reads";
import { PortalError } from "../lib/platform/portal-policy";
const action = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (work: Promise<unknown>, status: number) =>
  assert.rejects(work, (e) => e instanceof PortalError && e.status === status);
async function thread(token: unknown, postId: string, query = {}) {
  const value = await readComments(db, token, { postId, ...query });
  assert.equal(value.kind, "thread");
  if (value.kind !== "thread") throw new Error("Expected thread");
  return value;
}
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("an embedded discussion read rejects a different original account in its permission transaction", async () => {
  const f = await seedVolunteerApplications(db, false);
  await assert.rejects(
    readComments(db, f.ada.token, { postId: f.opportunityPost.id }, f.blake.id),
    /sign-in changed/
  );
});

test("two eligible recruitment pages reuse one canonical thread and exact receipt without creating applications", async () => {
  const f = await seedVolunteerApplications(db, false);
  const second = await volunteerCommand(db, f.ada.token, {
    ...f.saveInput,
    id: randomUUID(),
    mutationId: randomUUID(),
    title: "Fictional second role"
  });
  const firstPage = await readVolunteerOpportunity(
    db,
    f.lee.token,
    f.opportunity.id
  );
  const secondPage = await readVolunteerOpportunity(db, f.lee.token, second.id);
  assert.equal(firstPage.opportunity.postId, secondPage.opportunity.postId);
  const input = action("create", {
    postId: firstPage.opportunity.postId,
    content: "Where does the shared welcome team meet?"
  });
  const saved = await commentCommand(db, f.lee.token, input);
  assert.deepEqual(await commentCommand(db, f.lee.token, input), saved);
  const first = await thread(f.lee.token, firstPage.opportunity.postId);
  const other = await thread(f.val.token, secondPage.opportunity.postId);
  assert.equal(first.items[0].id, saved.id);
  assert.equal(other.items[0].id, saved.id);
  assert.equal(first.visibleCount, 1);
  assert.equal(other.visibleCount, 1);
  assert.equal(
    await db.volunteerApplication.count({
      where: { opportunityId: { in: [f.opportunity.id, second.id] } }
    }),
    0
  );
  assert.equal(
    await db.postVolunteerSignup.count({ where: { userId: f.lee.id } }),
    0
  );
});

test("private application and decision history never become comment text, identifiers or counts", async () => {
  const f = await seedVolunteerApplications(db, false);
  const statement = "Fictional confidential application availability marker";
  const application = await volunteerCommand(
    db,
    f.lee.token,
    f.application(statement)
  );
  const note = "Fictional confidential review decision marker";
  await volunteerCommand(
    db,
    f.ada.token,
    action("decline", { id: application.id, expectedVersion: 1, note })
  );
  for (const actor of [f.lee, f.ada, f.val]) {
    const page = await thread(actor.token, f.opportunityPost.id);
    assert.equal(page.visibleCount, 0);
    assert.deepEqual(page.items, []);
    const raw = JSON.stringify(page);
    for (const marker of [
      statement,
      note,
      application.id,
      "availability",
      "decisionNote"
    ])
      assert.ok(!raw.includes(marker), marker);
  }
  const own = await readVolunteerOpportunity(db, f.lee.token, f.opportunity.id);
  assert.ok(JSON.stringify(own.application).includes(statement));
});

test("application closure and discussion closure remain independent current controls", async () => {
  const f = await seedVolunteerApplications(db, false);
  await db.volunteerOpportunity.update({
    where: { id: f.opportunity.id },
    data: { closedAt: new Date() }
  });
  await denied(volunteerCommand(db, f.lee.token, f.application()), 409);
  const saved = await commentCommand(
    db,
    f.lee.token,
    action("create", {
      postId: f.opportunityPost.id,
      content: "A shared question after recruitment closes"
    })
  );
  assert.equal(
    (await thread(f.val.token, f.opportunityPost.id)).items[0].id,
    saved.id
  );
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { discussionClosed: true }
  });
  const closed = await thread(f.lee.token, f.opportunityPost.id);
  assert.equal(closed.discussionClosed, true);
  assert.equal(closed.canReply, false);
  assert.equal(closed.visibleCount, 1);
  await denied(
    commentCommand(
      db,
      f.lee.token,
      action("create", {
        postId: f.opportunityPost.id,
        content: "Cannot add after discussion closes"
      })
    ),
    403
  );
});

test("public discussion uses current post reply audience while applications still require eligibility", async () => {
  const f = await seedVolunteerApplications(db, false);
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { audience: "PUBLIC", replyAudience: "CHURCH_MEMBERS" }
  });
  assert.equal((await thread(null, f.opportunityPost.id)).viewerId, null);
  assert.equal(
    (await thread(f.blake.token, f.opportunityPost.id)).canReply,
    false
  );
  assert.equal(
    (await readVolunteerOpportunity(db, f.blake.token, f.opportunity.id))
      .eligible,
    false
  );
  await denied(
    commentCommand(
      db,
      f.blake.token,
      action("create", {
        postId: f.opportunityPost.id,
        content: "Not a current church member"
      })
    ),
    403
  );
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { replyAudience: "VIEWERS" }
  });
  await commentCommand(
    db,
    f.blake.token,
    action("create", {
      postId: f.opportunityPost.id,
      content: "Public question without applying"
    })
  );
  assert.equal((await thread(null, f.opportunityPost.id)).visibleCount, 1);
  await denied(volunteerCommand(db, f.blake.token, f.application()), 404);
  assert.equal(
    await db.volunteerApplication.count({
      where: { opportunityId: f.opportunity.id }
    }),
    0
  );
  await denied(
    readComments(db, f.lee.token, { postId: f.opportunityPost.id }, null),
    401
  );
});

test("current membership, blocking and source withdrawal govern every page and fresh write", async () => {
  const f = await seedVolunteerApplications(db, false);
  await db.platformPostComment.createMany({
    data: Array.from({ length: 21 }, (_, i) => ({
      postId: f.opportunityPost.id,
      authorId: f.lee.id,
      content: "Fictional paginated recruitment question " + i
    }))
  });
  const first = await thread(f.lee.token, f.opportunityPost.id);
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const concealed = async () => {
    await denied(
      readVolunteerOpportunity(db, f.lee.token, f.opportunity.id),
      404
    );
    await denied(thread(f.lee.token, f.opportunityPost.id), 404);
    await denied(
      thread(f.lee.token, f.opportunityPost.id, { after: first.nextCursor }),
      404
    );
    await denied(
      commentCommand(
        db,
        f.lee.token,
        action("create", {
          postId: f.opportunityPost.id,
          content: "Cannot write to revoked source"
        })
      ),
      404
    );
  };
  const connection = {
    userId_churchId: { userId: f.lee.id, churchId: f.churchA.id }
  };
  await db.churchConnection.update({
    where: connection,
    data: { state: "REMOVED" }
  });
  await concealed();
  await db.churchConnection.update({
    where: connection,
    data: { state: "APPROVED" }
  });
  assert.equal(
    (
      await thread(f.lee.token, f.opportunityPost.id, {
        after: first.nextCursor
      })
    ).items.length,
    1
  );
  await db.socialRelationship.create({
    data: { ownerId: f.val.id, targetUserId: f.lee.id, blocked: true }
  });
  const blocked = await thread(f.val.token, f.opportunityPost.id);
  assert.equal(blocked.visibleCount, 0);
  assert.deepEqual(blocked.items, []);
  assert.equal(
    (await readVolunteerOpportunity(db, f.val.token, f.opportunity.id))
      .opportunity.id,
    f.opportunity.id
  );
  await db.socialRelationship.deleteMany({
    where: { ownerId: f.val.id, targetUserId: f.lee.id }
  });
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  await concealed();
});

test("private comment drafts remain original-owner scoped alongside resource applications", async () => {
  const f = await seedVolunteerApplications(db, false);
  const draftId = randomUUID();
  const content = "Unsent personal draft with exact whitespace  ";
  await commentCommand(
    db,
    f.lee.token,
    action("draft-save", {
      postId: f.opportunityPost.id,
      draftId,
      expectedVersion: 0,
      content
    })
  );
  assert.equal(
    (await readCommentDrafts(db, f.lee.token, { id: draftId }, f.lee.id))
      .items[0].content,
    content
  );
  await denied(
    readCommentDrafts(db, f.val.token, { id: draftId }, f.lee.id),
    401
  );
  assert.deepEqual(
    (await readCommentDrafts(db, f.val.token, { id: draftId }, f.val.id)).items,
    []
  );
  assert.equal(
    (await thread(f.lee.token, f.opportunityPost.id)).visibleCount,
    0
  );
  assert.equal(
    await db.volunteerApplication.count({
      where: { opportunityId: f.opportunity.id }
    }),
    0
  );
});
