import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import type { Prisma } from "@prisma/client";
import {
  postReadableWhere,
  type PostContext,
  type PostTx
} from "./post-access";
import { effectiveChurchGrants } from "./church-permissions";
import { PortalError } from "./portal-policy";
import { postPreviewText } from "./post-options";

export function churchWelcomePosts(
  context: PostContext,
  churchId: string
): Prisma.PlatformPostWhereInput {
  return {
    AND: [
      postReadableWhere(context),
      {
        topicCommunityId: null,
        repostKind: null,
        OR: [
          { authorChurchId: churchId },
          { audience: "CHURCH", audienceChurchId: churchId }
        ]
      }
    ]
  };
}
export function churchWeekEvents(
  churchId: string,
  from: Date,
  until: Date
): Prisma.CalendarOccurrenceWhereInput {
  return {
    canceledAt: null,
    startAt: { lt: until },
    endAt: { gt: from },
    event: {
      canceledAt: null,
      visibility: { in: ["PUBLIC", "CHURCH"] },
      calendar: { churchId, archivedAt: null }
    }
  };
}
export async function requireWelcomeMember(
  tx: PostTx,
  context: PostContext,
  churchId: string,
  host = false
) {
  if (!context.actorId) throw new PortalError(401, "Sign in to continue.");
  if (!context.churches.includes(churchId))
    throw new PortalError(
      403,
      "A current approved church connection is required."
    );
  if (
    host &&
    !(
      await effectiveChurchGrants(
        tx,
        context.actorId,
        [churchId],
        ["HOST_CHURCH_WELCOME"]
      )
    ).length
  )
    throw new PortalError(
      403,
      "A current church welcome host permission is required."
    );
  if (host) await requirePrivilegedAuthentication(tx, context.actorId);
}
export const welcomePostSelect = {
  id: true,
  content: true,
  contentNote: true,
  safeExcerpt: true
} as const;
export function welcomePostLink(post: {
  id: string;
  content: string;
  contentNote: string | null;
  safeExcerpt: string | null;
}) {
  return {
    id: post.id,
    label: postPreviewText(post).slice(0, 160),
    href: "/platform/posts/" + post.id
  };
}
export async function currentChurchWelcome(
  tx: PostTx,
  context: PostContext,
  churchId: string,
  postId: string | null
) {
  if (!postId || !context.churches.includes(churchId)) return null;
  const post = await tx.platformPost.findFirst({
    where: {
      AND: [
        churchWelcomePosts(context, churchId),
        { id: postId, authorChurchId: churchId }
      ]
    },
    select: welcomePostSelect
  });
  return post ? welcomePostLink(post) : null;
}
