import type { PrismaClient } from "@prisma/client";
import { PortalError } from "./portal-policy";
import { withPostRead } from "./post-access";
import { listPostsIn } from "./post-reads";
import { readerDate, readerId } from "./reader-navigation";

export function topicFollowingStream(
  db: PrismaClient,
  token: unknown,
  query: { before?: unknown; cursor?: unknown } = {}
) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to read topics you follow.");
    // The selection and its authorized page share the existing read transaction
    // and revocation gate. Never fetch a public page and filter it afterward.
    const all = await listPostsIn(tx, context, {
      followedTopics: true,
      before: readerDate(query.before),
      cursor: readerId(query.cursor),
      limit: 21
    });
    const posts = all.slice(0, 20),
      last = posts.at(-1);
    return {
      accountId: context.actorId,
      following: [...(context.topicFollowing ?? [])].sort(),
      posts,
      next:
        all.length > 20 && last
          ? { before: last.createdAt.toISOString(), cursor: last.id }
          : null
    };
  });
}

export type TopicFollowingStream = Awaited<
  ReturnType<typeof topicFollowingStream>
>;
