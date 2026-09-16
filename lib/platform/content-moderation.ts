import type {
  CommunityReport,
  ContentModerationState,
  Prisma
} from "@prisma/client";
import type { PostContext, PostTx } from "./post-access";
import { expected, PortalError } from "./portal-policy";
import { postField, postId } from "./post-input";
import { exchangeAuthority, exchangeManagementWhere } from "./exchange-policy";
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
  if (report.targetType === "EXCHANGE_LISTING") {
    const listing = await tx.exchangeListing.findUnique({ where: { id: report.targetId },
      select: { id: true, ownerId: true, ownerChurchId: true, version: true,
        moderationState: true, state: true, erasedAt: true, recoveryRequired: true } });
    return listing && { id: listing.id, authorId: listing.ownerId, authorChurchId: listing.ownerChurchId,
      version: listing.version, moderationState: listing.moderationState, type: "EXCHANGE_LISTING" as const,
      contextVersion: 0, authorWithdrawn: listing.state === "ARCHIVED" || listing.state === "DRAFT" || !!listing.erasedAt || listing.recoveryRequired };
  }
  if (report.targetType === "TOPIC") {
    const topic = await tx.topicCommunity.findUnique({
      where: { id: report.targetId },
      select: {
        id: true,
        ownerId: true,
        version: true,
        moderationState: true,
        lifecycle: true,
        recoveryRequired: true
      }
    });
    return (
      topic && {
        id: topic.id,
        authorId: topic.ownerId,
        authorChurchId: null,
        version: topic.version,
        moderationState: topic.moderationState,
        type: "TOPIC" as const,
        contextVersion: 0,
        authorWithdrawn:
          topic.lifecycle === "ARCHIVED" || topic.recoveryRequired
      }
    );
  }
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
    else if (source.type === "TOPIC")
      await tx.topicCommunity.update({ where: { id: source.id }, data });
    else if (source.type === "EXCHANGE_LISTING")
      await tx.exchangeListing.update({ where: { id: source.id }, data: { ...data, moderationVersion: source.version + 1 } });
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

export async function authorDecisionWhere(
  tx: PostTx, context: PostContext
): Promise<Prisma.CommunityReportDecisionWhereInput> {
  const exchange = await exchangeAuthority(tx, context);
  return {
    action: { not: null },
    OR: [
      { authorId: context.actorId ?? "", authorChurchId: null },
      { authorChurchId: { in: [...context.publishers] }, report: { targetType: { not: "EXCHANGE_LISTING" } } },
      { authorChurchId: { in: exchange.managers }, report: { targetType: "EXCHANGE_LISTING" } }
    ]
  };
}
export async function readContentNotices(
  tx: PostTx,
  context: PostContext,
  query: Record<string, unknown>
) {
  const where = await authorDecisionWhere(tx, context);
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
  let ownSource: {
    href: string;
    content: string;
    contentNote?: string | null;
    safeExcerpt?: string | null;
    version: number;
  } | null = null;
  if (query.id && rows[0]) {
    const report = rows[0].report;
    const author = {
      OR: [
        { authorId: context.actorId ?? "", authorChurchId: null },
        { authorChurchId: { in: [...context.publishers] } }
      ]
    };
    if (report.targetType === "EXCHANGE_LISTING") {
      const source = await tx.exchangeListing.findFirst({
        where: { AND: [{ id: report.targetId }, exchangeManagementWhere(context, await exchangeAuthority(tx, context))] },
        select: { id: true, title: true, description: true, state: true, version: true }
      });
      if (source) ownSource = { href: `/platform/exchange/${source.id}/edit`,
        content: source.state === "ARCHIVED" ? "" : `${source.title}\n\n${source.description}`, version: source.version };
    } else if (report.targetType === "POST") {
      const source = await tx.platformPost.findFirst({
        where: { id: report.targetId, ...author },
        select: {
          id: true,
          content: true,
          contentNote: true,
          safeExcerpt: true,
          version: true,
          withdrawnAt: true,
          status: true
        }
      });
      if (source)
        ownSource = {
          href: `/platform/posts/${source.id}`,
          contentNote:
            source.withdrawnAt || source.status === "WITHDRAWN"
              ? null
              : source.contentNote,
          safeExcerpt:
            source.withdrawnAt || source.status === "WITHDRAWN"
              ? null
              : source.safeExcerpt,
          content:
            source.withdrawnAt || source.status === "WITHDRAWN"
              ? ""
              : source.content,
          version: source.version
        };
    } else if (report.targetType === "TOPIC") {
      const topic = await tx.topicCommunity.findFirst({
        where: { id: report.targetId, ownerId: context.actorId ?? "" },
        select: {
          slug: true,
          name: true,
          description: true,
          rules: true,
          version: true
        }
      });
      if (topic)
        ownSource = {
          href: `/platform/topics/${topic.slug}/manage`,
          content: `${topic.name}\n\n${topic.description}\n\n${topic.rules}`,
          version: topic.version
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
