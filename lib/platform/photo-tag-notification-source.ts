import type { Prisma, SocialEvent } from "@prisma/client";
import type { PostContext } from "./post-access";
import {
  photoTagInclude,
  photoTagRequestAllowed,
  tagContextCache,
  visiblePhotoTag
} from "./photo-tag-policy";
import type { NotificationSource } from "./notification-source";

export async function photoTagNotificationSources(
  tx: Prisma.TransactionClient,
  events: SocialEvent[],
  context: PostContext
) {
  const result = new Map<string, NotificationSource>();
  if (
    !context.actorId ||
    !context.eligible ||
    !events.length ||
    events.length > 50 ||
    events.some((e) => e.recipientId !== context.actorId)
  )
    return result;
  const tags = await tx.photoTag.findMany({
    where: { id: { in: events.map((e) => e.sourceId!) } },
    include: photoTagInclude,
    take: 50
  });
  const contexts = tagContextCache(tx, context);
  for (const event of events) {
    const tag = tags.find((t) => t.id === event.sourceId);
    if (
      !tag ||
      event.actorId === context.actorId ||
      event.notificationCategory !== "photos" ||
      tag.version < (event.sourceVersion ?? Infinity) ||
      (event.kind === "PHOTO_TAG_REQUEST"
        ? tag.recipientId !== context.actorId ||
          tag.requesterId !== event.actorId
        : tag.requesterId !== context.actorId ||
          tag.recipientId !== event.actorId ||
          tag.state !== "APPROVED")
    )
      continue;
    if (
      context.mutedIds?.includes(event.actorId) ||
      !(await photoTagRequestAllowed(tx, tag.requesterId, tag.recipientId))
    )
      continue;
    const asset = await visiblePhotoTag(tx, context, tag, contexts);
    if (
      !asset ||
      (asset.post?.authorChurchId &&
        context.mutedChurchIds?.includes(asset.post.authorChurchId))
    )
      continue;
    result.set(event.id, {
      category: "photos",
      href: `/platform/photo-tags?tag=${tag.id}`,
      group: `photo-tag:${tag.id}`
    });
  }
  return result;
}
