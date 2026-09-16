import type { PrismaClient, PlatformPost } from "@prisma/client";
import { eligibleWhere, PortalError } from "./portal-policy";
import { postId } from "./post-input";
import { mentionAllowed, socialUserWhere } from "./social-policy";
import {
  postContext,
  postReadableWhere,
  withPostRead,
  type PostContext,
  type PostTx
} from "./post-access";

export function personMentionIds(input: unknown) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 5)
    throw new PortalError(400, "Choose at most five people to mention.");
  const ids = input.map(postId);
  if (new Set(ids).size !== ids.length)
    throw new PortalError(400, "Choose each mention once.");
  return ids;
}

export async function postMentionAllowed(
  tx: PostTx,
  senderId: string,
  recipientId: string,
  postId: string
) {
  if (!(await mentionAllowed(tx, senderId, recipientId))) return false;
  const context = await postContext(tx, recipientId);
  return (
    !!context.eligible &&
    !!(await tx.platformPost.findFirst({
      where: { AND: [{ id: postId }, postReadableWhere(context)] },
      select: { id: true }
    }))
  );
}

/** Draft selections are private. Publication rechecks actual source access. */
export async function setPostMentions(
  tx: PostTx,
  context: PostContext,
  post: PlatformPost,
  value: unknown
) {
  const ids = personMentionIds(value);
  if (ids.length && !context.eligible)
    throw new PortalError(
      403,
      "Complete adult account setup before choosing mentions."
    );
  for (const recipientId of ids) {
    const recipient = await tx.platformUser.findFirst({
      where: { id: recipientId, ...eligibleWhere },
      select: { id: true }
    });
    const allowed =
      recipient &&
      context.actorId &&
      (post.status === "PUBLISHED"
        ? await postMentionAllowed(tx, context.actorId, recipientId, post.id)
        : await mentionAllowed(tx, context.actorId, recipientId));
    if (!allowed)
      throw new PortalError(
        400,
        "One or more mentions are unavailable. Remove them and keep your text."
      );
  }
  await tx.postMention.updateMany({
    where: { postId: post.id, recipientId: { notIn: ids } },
    data: { active: false }
  });
  for (const recipientId of ids)
    await tx.postMention.upsert({
      where: { postId_recipientId: { postId: post.id, recipientId } },
      create: { postId: post.id, recipientId },
      update: { active: true }
    });
}

/** Bounded adult suggestions; a selection never promises access to the future post. */
export function readPostMentionSuggestions(
  db: PrismaClient,
  token: unknown,
  q: unknown,
  after?: unknown
) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId || !context.eligible)
      throw new PortalError(
        403,
        "Complete adult account setup before choosing mentions."
      );
    if (typeof q !== "string" || q.trim().length < 2 || q.length > 100)
      throw new PortalError(
        400,
        "Enter at least two characters to find someone."
      );
    const rows = await tx.platformUser.findMany({
      where: {
        AND: [
          eligibleWhere,
          socialUserWhere(context),
          {
            id: {
              not: context.actorId,
              ...(after ? { gt: postId(after) } : {})
            },
            OR: [
              { name: { contains: q.trim(), mode: "insensitive" } },
              {
                username: {
                  contains: q.trim().replace(/^@/, ""),
                  mode: "insensitive"
                }
              }
            ]
          }
        ]
      },
      select: { id: true, name: true, username: true },
      orderBy: { id: "asc" },
      take: 21
    });
    const items = [];
    for (const person of rows.slice(0, 20))
      if (
        person.username &&
        (await mentionAllowed(tx, context.actorId, person.id))
      )
        items.push({ ...person, username: person.username });
    return {
      ownerId: context.actorId,
      items,
      nextCursor: rows.length > 20 ? rows[19].id : null
    };
  });
}
