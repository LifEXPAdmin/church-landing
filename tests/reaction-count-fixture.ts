import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { saveReactionPreferences } from "../lib/platform/reaction-preferences";

export async function seedReactionCounts(db: PrismaClient) {
  await assertPortalTestDatabase(db);
  const a = await createPortalActor(db, "countauthor"),
    b = await createPortalActor(db, "countother"),
    viewer = await createPortalActor(db, "countview");
  const church = await db.church.create({
    data: {
      slug: `counts-${randomUUID()}`,
      name: "Fictional Count Church",
      summary: "Isolated test source"
    }
  });
  const post = await db.platformPost.create({
    data: {
      authorId: a.id,
      content: "Fictional hidden-total source",
      publishedAt: new Date(Date.now() - 1000),
      allowReposts: true
    }
  });
  const other = await db.platformPost.create({
    data: {
      authorId: b.id,
      content: "Fictional other-author source",
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  const churchPost = await db.platformPost.create({
    data: {
      authorId: a.id,
      authorChurchId: church.id,
      content: "Fictional church voice source",
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  const comment = await db.platformPostComment.create({
    data: {
      authorId: a.id,
      postId: churchPost.id,
      content: "Fictional personal reply beneath church speech"
    }
  });
  const reply = await db.platformPostComment.create({
    data: {
      authorId: b.id,
      postId: churchPost.id,
      parentId: comment.id,
      rootId: comment.id,
      content: "Fictional other-author nested reply"
    }
  });
  const churchComment = await db.platformPostComment.create({
    data: {
      authorId: a.id,
      authorChurchId: church.id,
      postId: churchPost.id,
      content: "Fictional church-authored comment"
    }
  });
  await db.commentPin.create({
    data: { postId: churchPost.id, commentId: comment.id }
  });
  await db.platformPostLike.createMany({
    data: [post, other, churchPost].map((p) => ({
      postId: p.id,
      userId: viewer.id,
      active: true
    }))
  });
  await db.commentLike.createMany({
    data: [comment, reply, churchComment].map((c) => ({
      commentId: c.id,
      userId: viewer.id,
      active: true
    }))
  });
  return {
    a,
    b,
    viewer,
    church,
    post,
    other,
    churchPost,
    comment,
    reply,
    churchComment
  };
}
export async function setAuthorCounts(
  db: PrismaClient,
  actor: { id: string; token: string },
  hide: boolean
) {
  const old = await db.socialPreferences.findUnique({
    where: { ownerId: actor.id }
  });
  return saveReactionPreferences(
    db,
    actor.token,
    {
      mutationId: randomUUID(),
      expectedVersion: old?.reactionCountVersion ?? 0,
      hideAuthoredReactionCounts: hide
    },
    actor.id
  );
}
