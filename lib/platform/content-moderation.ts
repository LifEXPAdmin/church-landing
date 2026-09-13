import type {
  CommunityReport,
  ContentModerationState,
  Prisma
} from "@prisma/client";
import type { PostContext, PostTx } from "./post-access";
import { expected, PortalError } from "./portal-policy";
import { postField, postId } from "./post-input";
import {
  contentDecisionReasons,
  contentReviewActions,
  type ContentDecisionNotice,
  type ContentReviewAction,
  type ContentSourceReview
} from "./content-moderation-types";

// Call only after the shared pinned/current report-scope authorization succeeds.
// No author/audience changes, source copies, or arbitrary source IDs are accepted.
export async function contentReviewSource(tx: PostTx, report: CommunityReport) {
  if (report.targetType !== "POST" && report.targetType !== "COMMENT")
    return null;
  const fields = {
    id: true,
    authorId: true,
    authorChurchId: true,
    version: true,
    moderationState: true
  } as const;
  if (report.targetType === "POST") {
    const post = await tx.platformPost.findUnique({
      where: { id: report.targetId },
      select: { ...fields, status: true, withdrawnAt: true }
    });
    return (
      post && {
        ...post,
        type: "POST" as const,
        contextVersion: 0,
        authorWithdrawn: post.status === "WITHDRAWN" || !!post.withdrawnAt
      }
    );
  }
  const comment = await tx.platformPostComment.findUnique({
    where: { id: report.targetId },
    select: {
      ...fields,
      deletedAt: true,
      post: { select: { version: true, status: true, withdrawnAt: true } }
    }
  });
  return (
    comment && {
      ...comment,
      type: "COMMENT" as const,
      contextVersion: comment.post.version,
      authorWithdrawn:
        !!comment.deletedAt ||
        comment.post.status === "WITHDRAWN" ||
        !!comment.post.withdrawnAt
    }
  );
}
export function contentSourceView(
  source: Awaited<ReturnType<typeof contentReviewSource>>
): ContentSourceReview | null {
  return (
    source && {
      type: source.type,
      version: source.version,
      contextVersion: source.contextVersion,
      visibility: source.moderationState,
      authorWithdrawn: source.authorWithdrawn
    }
  );
}

export async function moderateReportedContent(
  tx: PostTx,
  report: CommunityReport,
  input: Record<string, unknown>
) {
  const source = await contentReviewSource(tx, report);
  if (!source)
    throw new PortalError(
      409,
      "This selected source is unavailable for content moderation. Refresh the report."
    );
  expected(input.expectedSourceVersion, source.version);
  expected(input.expectedContextVersion, source.contextVersion);
  if (
    typeof input.action !== "string" ||
    !Object.hasOwn(contentReviewActions, input.action)
  )
    throw new PortalError(400, "Choose a supported content decision.");
  if (
    typeof input.authorReason !== "string" ||
    !Object.hasOwn(contentDecisionReasons, input.authorReason)
  )
    throw new PortalError(
      400,
      "Choose the explanation the author will receive."
    );
  const action = input.action as ContentReviewAction;
  const resolved = ["NO_VIOLATION", "CORRECTION_COMPLETE"].includes(
    input.authorReason
  );
  if (["NO_VIOLATION", "RESTORE"].includes(action) !== resolved)
    throw new PortalError(
      400,
      "Choose an author explanation that matches the decision."
    );
  const reason = postField(input.decisionReason, 1000, 5);
  let visibility = source.moderationState;
  if (action === "HIDE") visibility = "HIDDEN";
  if (action === "REMOVE") visibility = "REMOVED";
  if (action === "RESTORE") visibility = "VISIBLE";
  if (
    ["HIDE", "REMOVE", "RESTORE"].includes(action) &&
    visibility === source.moderationState
  )
    throw new PortalError(
      409,
      "This restriction is already in that state. Refresh the source review."
    );
  if (action === "NO_VIOLATION" && source.moderationState !== "VISIBLE")
    throw new PortalError(
      400,
      "Use Lift the content restriction to remove an existing restriction."
    );
  // Lifting a moderation restriction never changes source status, deletion,
  // audience, reply audience, author, media lifecycle, or discussion settings.
  const changed = visibility !== source.moderationState;
  const data = {
    moderationState: visibility as ContentModerationState,
    version: { increment: 1 }
  };
  if (changed) {
    if (source.type === "POST")
      await tx.platformPost.update({ where: { id: source.id }, data });
    else
      await tx.platformPostComment.update({ where: { id: source.id }, data });
  }
  return {
    action,
    reason,
    authorReason: input.authorReason,
    authorId: source.authorChurchId ? null : source.authorId,
    authorChurchId: source.authorChurchId,
    fromVisibility: source.moderationState,
    toVisibility: visibility,
    sourceVersion: source.version + Number(changed),
    contextVersion: source.contextVersion,
    status: (["HIDE", "REQUEST_CORRECTION"].includes(action)
      ? "FOLLOW_UP_REQUIRED"
      : "CLOSED") as "FOLLOW_UP_REQUIRED" | "CLOSED"
  };
}

export function authorDecisionWhere(
  context: PostContext
): Prisma.CommunityReportDecisionWhereInput {
  return {
    action: { not: null },
    OR: [
      { authorId: context.actorId ?? "", authorChurchId: null },
      { authorChurchId: { in: [...context.publishers] } }
    ]
  };
}
export async function readContentNotices(
  tx: PostTx,
  context: PostContext,
  query: Record<string, unknown>
) {
  const where = authorDecisionWhere(context);
  const select = {
    id: true,
    action: true,
    authorReason: true,
    toVisibility: true,
    createdAt: true,
    authorChurchId: true,
    report: { select: { targetType: true, targetId: true } }
  } as const;
  const after = query.after ? postId(query.after) : null;
  if (
    after &&
    !(await tx.communityReportDecision.findFirst({
      where: { AND: [{ id: after }, where] },
      select: { id: true }
    }))
  )
    throw new PortalError(
      409,
      "Refresh your content decisions. Their access or retention changed."
    );
  const rows = await tx.communityReportDecision.findMany({
    where: { AND: [where, ...(query.id ? [{ id: postId(query.id) }] : [])] },
    select,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.id ? 1 : 21,
    ...(after ? { cursor: { id: after }, skip: 1 } : {})
  });
  if (query.id && !rows.length)
    throw new PortalError(404, "This content decision is unavailable.");
  const notices = rows.slice(0, 20).map((row) => ({
    id: row.id,
    type: row.report.targetType,
    action: row.action,
    reason: row.authorReason,
    visibility: row.toVisibility,
    createdAt: row.createdAt.toISOString(),
    church: !!row.authorChurchId
  })) as ContentDecisionNotice[];
  // Only the current logical author can identify the selected source using its
  // canonical text. This owner view never changes the ordinary reader predicate.
  let ownSource: { href: string; content: string; version: number } | null =
    null;
  if (query.id && rows[0]) {
    const report = rows[0].report;
    const author = {
      OR: [
        { authorId: context.actorId ?? "", authorChurchId: null },
        { authorChurchId: { in: [...context.publishers] } }
      ]
    };
    if (report.targetType === "POST") {
      const source = await tx.platformPost.findFirst({
        where: { id: report.targetId, ...author },
        select: {
          id: true,
          content: true,
          version: true,
          withdrawnAt: true,
          status: true
        }
      });
      if (source)
        ownSource = {
          href: `/platform/posts/${source.id}`,
          content:
            source.withdrawnAt || source.status === "WITHDRAWN"
              ? ""
              : source.content,
          version: source.version
        };
    } else if (report.targetType === "COMMENT") {
      const source = await tx.platformPostComment.findFirst({
        where: { id: report.targetId, ...author },
        select: {
          id: true,
          postId: true,
          content: true,
          version: true,
          deletedAt: true
        }
      });
      if (source)
        ownSource = {
          href: `/platform/posts/${source.postId}?comment=${source.id}`,
          content: source.deletedAt ? "" : source.content,
          version: source.version
        };
    }
  }
  return {
    ownerId: context.actorId!,
    ownSource,
    notices,
    after: rows.length > 20 ? rows[19].id : null
  };
}
