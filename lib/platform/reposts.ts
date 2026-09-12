import type { PrismaClient } from "@prisma/client";
import { eligibleWhere, expected, PortalError } from "./portal";
import { socialCommand, socialInput } from "./social-operations";
import { postContext, postId, withPostRead } from "./post-access";
import {
  originalForRepost,
  repostDestination,
  requireRepostActor
} from "./repost-policy";
import { getPostViewIn } from "./post-reads";

export function readRepostOptions(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId) throw new PortalError(401, "Sign in to repost.");
    const eligible = !!(await tx.platformUser.findFirst({
      where: { id: context.actorId, ...eligibleWhere },
      select: { id: true }
    }));
    const requested = postId(input.sourceId);
    const destination = repostDestination(context, input);
    let sourceId = requested,
      source = null;
    try {
      const original = await originalForRepost(tx, context, requested);
      sourceId = original.id;
      source = await getPostViewIn(tx, context, original.id);
    } catch (error) {
      if (!(error instanceof PortalError)) throw error;
    }
    const existing = await tx.platformPost.findFirst({
      where: {
        repostKind: "PLAIN",
        repostSourceId: sourceId,
        status: "PUBLISHED",
        withdrawnAt: null,
        authorChurchId: destination.authorChurchId,
        audienceChurchId: destination.audienceChurchId,
        ...(destination.authorChurchId ? {} : { authorId: context.actorId })
      },
      select: { id: true, version: true, audience: true }
    });
    return {
      source,
      sourceId: source?.id ?? null,
      existing,
      canRepost: !!source && eligible,
      message: !eligible
        ? "Verify your email and adult participation before reposting."
        : source
          ? "The original author allows reposting this public post."
          : "This source is currently unavailable for reposting."
    };
  });
}
export function repostCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "sourceId",
    "expectedSourceVersion",
    "id",
    "expectedVersion",
    "authorChurchId",
    "audienceChurchId",
    "audience"
  ]);
  return socialCommand(db, token, "reposts", input, async (tx, ownerId) => {
    const context = await postContext(tx, ownerId);
    if (input.operation === "undo") {
      const row = await tx.platformPost.findUnique({
        where: { id: postId(input.id) }
      });
      if (!row || row.repostKind !== "PLAIN")
        throw new PortalError(404, "Repost unavailable.");
      if (
        row.authorChurchId
          ? !context.publishers.has(row.authorChurchId)
          : row.authorId !== ownerId
      )
        throw new PortalError(403, "You cannot remove this repost.");
      expected(input.expectedVersion, row.version);
      if (row.status !== "PUBLISHED" || row.withdrawnAt)
        throw new PortalError(
          409,
          "This repost was already removed. Refresh its current state."
        );
      const removed = await tx.platformPost.update({
        where: { id: row.id },
        data: {
          status: "WITHDRAWN",
          withdrawnAt: new Date(),
          version: { increment: 1 }
        }
      });
      await tx.postAudit.create({
        data: {
          postId: row.id,
          actorId: ownerId,
          action: "repost-undone",
          version: removed.version
        }
      });
      return {
        id: row.id,
        version: removed.version,
        message: "Repost removed. The original is unchanged."
      };
    }
    if (input.operation !== "repost")
      throw new PortalError(400, "Choose Repost or Undo repost.");
    await requireRepostActor(tx, context);
    const source = await originalForRepost(tx, context, input.sourceId);
    expected(input.expectedSourceVersion, source.version);
    const destination = repostDestination(context, input);
    const existing = await tx.platformPost.findFirst({
      where: {
        repostKind: "PLAIN",
        repostSourceId: source.id,
        status: "PUBLISHED",
        withdrawnAt: null,
        authorChurchId: destination.authorChurchId,
        audienceChurchId: destination.audienceChurchId,
        ...(destination.authorChurchId ? {} : { authorId: ownerId })
      }
    });
    if (existing && existing.audience !== destination.audience)
      throw new PortalError(
        409,
        "This destination already has a repost with a different audience. Review and undo that entry before creating another."
      );
    if (existing)
      return {
        id: existing.id,
        version: existing.version,
        message: "This source is already reposted to this destination."
      };
    const row = await tx.platformPost.create({
      data: {
        authorId: ownerId,
        ...destination,
        content: "",
        repostKind: "PLAIN",
        repostSourceId: source.id,
        discussionClosed: true,
        allowReposts: false,
        publishedAt: new Date()
      }
    });
    await tx.postAudit.create({
      data: {
        postId: row.id,
        actorId: ownerId,
        action: "reposted",
        version: row.version
      }
    });
    return {
      id: row.id,
      version: row.version,
      message: "Reposted with the original author's attribution."
    };
  });
}
