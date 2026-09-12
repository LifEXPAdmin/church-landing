import type { Prisma, PlatformPost } from "@prisma/client";
import { eligibleWhere, PortalError } from "./portal-policy";
import {
  postContext,
  postReadableWhere,
  type PostContext,
  type PostTx
} from "./post-access";
import { postId } from "./post-input";

/** The source must remain public even when the viewer can read church content. */
export function repostSourceWhere(
  context: PostContext,
  now = new Date()
): Prisma.PlatformPostWhereInput {
  return {
    AND: [
      { repostKind: null, allowReposts: true, audience: "PUBLIC" },
      postReadableWhere(
        {
          actorId: null,
          churches: [],
          publishers: new Set(),
          moderators: new Set(),
          volunteers: new Set()
        },
        now
      ),
      postReadableWhere(context, now)
    ]
  };
}
export async function requireRepostActor(tx: PostTx, context: PostContext) {
  if (!context.actorId) throw new PortalError(401, "Sign in to repost.");
  if (
    !(await tx.platformUser.findFirst({
      where: { id: context.actorId, ...eligibleWhere },
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "Verify your email and adult participation before reposting."
    );
}
/** Normalize readable public entry links to one original; never copy quote words. */
export async function originalForRepost(
  tx: PostTx,
  context: PostContext,
  value: unknown
): Promise<PlatformPost> {
  let id = postId(value);
  const seen = new Set<string>(),
    anonymous = await postContext(tx);
  for (let depth = 0; depth < 10; depth++) {
    if (seen.has(id)) break;
    seen.add(id);
    const row = await tx.platformPost.findFirst({
      where: {
        AND: [
          { id, audience: "PUBLIC" },
          postReadableWhere(anonymous),
          postReadableWhere(context)
        ]
      }
    });
    if (!row) break;
    if (!row.repostKind) {
      if (row.allowReposts) return row;
      break;
    }
    if (!row.repostSourceId) break;
    id = row.repostSourceId;
  }
  throw new PortalError(
    403,
    "This source is unavailable for reposting. It must be public and its author must allow reposts."
  );
}
export function repostDestination(
  context: PostContext,
  input: Record<string, unknown>
) {
  const authorChurchId = input.authorChurchId
    ? postId(input.authorChurchId)
    : null;
  const audienceChurchId = input.audienceChurchId
    ? postId(input.audienceChurchId)
    : authorChurchId;
  const audience = input.audience ?? (audienceChurchId ? "CHURCH" : "PUBLIC");
  if (audience !== "PUBLIC" && audience !== "CHURCH")
    throw new PortalError(400, "Choose Public or Church.");
  if (audience === "CHURCH" && !audienceChurchId)
    throw new PortalError(400, "Choose a church destination.");
  if (authorChurchId && authorChurchId !== audienceChurchId)
    throw new PortalError(
      400,
      "The church identity and destination must match."
    );
  if (audienceChurchId && !context.publishers.has(audienceChurchId))
    throw new PortalError(
      403,
      "An approved church publisher must repost to this church page."
    );
  return { authorChurchId, audienceChurchId, audience } as const;
}
