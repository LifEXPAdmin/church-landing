import { pantryRequestEvidence } from "./pantry-evidence";
import { currentPantryRequest, requirePantryCoordinator } from "./pantry-policy";
import { needContributionEvidence } from "./exchange-need-evidence";
import {
  currentNeedContribution,
  requireNeedCoordinator
} from "./exchange-need-policy";
import {
  currentExchangeInquiry,
  exchangeInquiryCleared,
  exchangeInquiryParticipant
} from "./exchange-handoff-policy";
import { exchangeHandoffEvidence } from "./exchange-handoff-evidence";
import type { CommunityReport, PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { activityBudget } from "./account-limits";
import { activeRoleGrantWhere } from "./church-permissions";
import { commentVisibleWhere } from "./comment-policy";
import {
  communityReportReasons,
  communityReportTargets,
  type CommunityReportTarget
} from "./community-report-types";
import {
  postContext,
  postReadableWhere,
  withPostRead,
  type PostContext,
  type PostTx
} from "./post-access";
import { postField, postId } from "./post-input";
import { eligibleWhere, expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import { socialUserWhere } from "./social-policy";
import { adultMemberWhere } from "./adult-message-policy";
import { topicPublicWhere } from "./topic-policy";
import { topicHref } from "./topic-types";
import {
  recordReportActivity,
  recordContentDecisionActivity
} from "./report-activity";
import { retentionDate } from "./messaging-retention";
import {
  recordContentControl,
  recordHoldControl,
  recordReportControl
} from "./retention-controls";
import {
  reportReviewAuthority,
  reviewReportRows
} from "./community-report-review";
import {
  contentReviewSource,
  contentSourceView,
  moderateReportedContent,
  readContentNotices
} from "./content-moderation";
import { contentAppealOffer } from "./moderation-support";
import { readableFeedbackImage } from "./feedback-image-access";
import { projectImage } from "./media";
import { requirePublicIdea } from "./feedback-idea-access";
import { exchangeReadableWhere, exchangeReportScope } from "./exchange-policy";
import {
  exchangeEvidenceSelect,
  exchangeEvidenceText
} from "./exchange-summary";

type Target = {
  type: CommunityReportTarget;
  id: string;
  version: number;
  contextVersion: number;
  scopeChurchId: string | null;
  scopeTopicId?: string | null;
  source: { label: string; href: string };
  evidencePreview?: string;
};

function targetType(value: unknown): CommunityReportTarget {
  if (!communityReportTargets.includes(value as CommunityReportTarget))
    throw new PortalError(400, "Choose a supported report target.");
  return value as CommunityReportTarget;
}

async function eligibleActor(tx: PostTx, ownerId: string) {
  if (
    !(await tx.platformUser.findFirst({
      where: { id: ownerId, ...eligibleWhere },
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "Verify your email and confirm adult eligibility before submitting or reviewing a report."
    );
}

const churchScope = (post: {
  authorChurchId: string | null;
  audience: string;
  audienceChurchId: string | null;
}) =>
  post.authorChurchId ??
  (post.audience === "CHURCH" ? post.audienceChurchId : null);

// Intake reads source metadata only. Stored evidence is deliberate reporter
// context; authorized case inspection separately reads its selected source.
async function targetIn(
  tx: PostTx,
  context: PostContext,
  kind: unknown,
  value: unknown
): Promise<Target | null> {
  const type = targetType(kind),
    id = postId(value);
  if (type === "PANTRY_REQUEST") {
    const row = await tx.pantryRequest.findUnique({ where: { id }, include: { hub: true } });
    if (!row || !context.actorId || row.hub.recoveryRequired || ![row.requesterId, row.coordinatorId].includes(context.actorId)) return null;
    if (row.requesterId === context.actorId && row.requesterClearedAt) return null;
    if (row.coordinatorId === context.actorId) {
      if (row.coordinatorClearedAt || !(await currentPantryRequest(tx, row, row.hub))) return null;
      await requirePantryCoordinator(tx, row.hub, context.actorId);
    }
    return { type, id, version: row.version, contextVersion: 0, scopeChurchId: null,
      source: { label: "Selected private assistance request", href: "/platform/pantry/mine" }, evidencePreview: pantryRequestEvidence(row) };
  }
  if (type === "NEED_CONTRIBUTION") {
    const row = await tx.exchangeNeedContribution.findUnique({
      where: { id },
      include: { need: true }
    });
    if (
      !row ||
      !context.actorId ||
      row.need.recoveryRequired ||
      ![row.contributorId, row.coordinatorId].includes(context.actorId)
    )
      return null;
    if (context.actorId === row.coordinatorId) {
      if (!(await currentNeedContribution(tx, row))) return null;
      await requireNeedCoordinator(tx, row.need, context.actorId);
    }
    return {
      type,
      id,
      version: row.version,
      contextVersion: 0,
      scopeChurchId: null,
      source: {
        label: "Selected private Church Needs contribution",
        href: "/platform/exchange/needs"
      },
      evidencePreview: needContributionEvidence(row)
    };
  }
  if (type === "EXCHANGE_INQUIRY" || type === "EXCHANGE_HANDOFF") {
    const row = await tx.exchangeInquiry.findUnique({ where: { id } });
    if (
      !row ||
      !context.actorId ||
      !exchangeInquiryParticipant(row, context.actorId) ||
      exchangeInquiryCleared(row, context.actorId) ||
      row.recoveryRequired ||
      row.bodyPurgedAt
    )
      return null;
    if (
      type === "EXCHANGE_HANDOFF" &&
      (row.state !== "RESERVED" || !(await currentExchangeInquiry(tx, row)))
    )
      return null;
    if (
      await tx.retentionPurge.findUnique({
        where: { target_targetId: { target: "EXCHANGE_INQUIRY", targetId: id } }
      })
    )
      return null;
    return {
      type,
      id,
      version: row.version,
      contextVersion: type === "EXCHANGE_HANDOFF" ? row.planVersion : 0,
      scopeChurchId: null,
      source: {
        label:
          type === "EXCHANGE_HANDOFF"
            ? "Selected agreed pickup plan"
            : "Selected private inquiry",
        href: `/platform/exchange/handoffs/${id}`
      },
      evidencePreview: exchangeHandoffEvidence(row, type === "EXCHANGE_HANDOFF")
    };
  }
  if (type === "EXCHANGE_LISTING") {
    const row = await tx.exchangeListing.findFirst({
      where: { AND: [{ id }, exchangeReadableWhere(context)] },
      select: {
        id: true,
        version: true,
        ownerChurchId: true,
        audience: true,
        audienceChurchId: true
      }
    });
    return (
      row && {
        type,
        id,
        version: row.version,
        contextVersion: 0,
        scopeChurchId: exchangeReportScope(row),
        source: {
          label: "Selected Exchange listing",
          href: `/platform/exchange/${id}`
        }
      }
    );
  }
  if (type === "FEEDBACK_IDEA") {
    if (process.env.FEEDBACK_IDEAS_ENABLED !== "true") return null;
    try {
      const idea = await requirePublicIdea(tx, id);
      return {
        type,
        id,
        version: idea.version,
        contextVersion: 0,
        scopeChurchId: null,
        source: {
          label: idea.title,
          href: `/platform/feedback/ideas/${encodeURIComponent(id)}`
        }
      };
    } catch (error) {
      if (error instanceof PortalError && error.status === 404) return null;
      throw error;
    }
  }
  if (type === "FEEDBACK_ATTACHMENT") {
    const asset = await tx.mediaAsset.findFirst({
      where: {
        id,
        purpose: "SUPPORT_ATTACHMENT",
        status: "READY",
        feedbackCaseId: { not: null }
      }
    });
    if (!asset) return null;
    try {
      await readableFeedbackImage(tx, context.actorId, asset);
    } catch (error) {
      if (error instanceof PortalError && [401, 404].includes(error.status))
        return null;
      throw error;
    }
    return {
      type,
      id,
      version: asset.version,
      contextVersion: 0,
      scopeChurchId: null,
      source: {
        label: "Selected private feedback attachment",
        href: `/platform/help/cases/${encodeURIComponent(asset.feedbackCaseId!)}`
      }
    };
  }
  if (type === "MESSAGE") {
    const row = await tx.adultMessage.findFirst({
      where: {
        id,
        conversation: adultMemberWhere(context.actorId ?? "")
      },
      select: {
        id: true,
        sequence: true,
        conversationId: true,
        conversation: {
          select: {
            states: {
              where: { ownerId: context.actorId ?? "" },
              take: 1,
              select: { hiddenThrough: true }
            }
          }
        }
      }
    });
    if (
      !row ||
      row.sequence <= (row.conversation.states[0]?.hiddenThrough ?? 0)
    )
      return null;
    return {
      type,
      id: row.id,
      version: 1,
      contextVersion: 0,
      scopeChurchId: null,
      source: {
        label: "Selected private message",
        href: `/platform/messages/${row.conversationId}?message=${row.id}`
      }
    };
  }
  if (type === "CONTACT_REQUEST") {
    const row = await tx.adultContactRequest.findFirst({
      where: {
        id,
        OR: [
          { senderId: context.actorId ?? "" },
          { recipientId: context.actorId ?? "" }
        ]
      },
      select: { id: true, version: true }
    });
    return (
      row && {
        type,
        id: row.id,
        version: row.version,
        contextVersion: 0,
        scopeChurchId: null,
        source: {
          label: "Selected contact request",
          href: `/platform/messages/requests?id=${encodeURIComponent(row.id)}`
        }
      }
    );
  }
  if (type === "TOPIC") {
    const row = await tx.topicCommunity.findFirst({
      where: { id, ...topicPublicWhere },
      select: { id: true, name: true, slug: true, version: true }
    });
    return (
      row && {
        type,
        id,
        version: row.version,
        contextVersion: 0,
        scopeChurchId: null,
        scopeTopicId: row.id,
        source: { label: row.name, href: topicHref(row.slug) }
      }
    );
  }
  if (type === "POST") {
    const row = await tx.platformPost.findFirst({
      where: { AND: [{ id }, postReadableWhere(context)] },
      select: {
        id: true,
        version: true,
        authorChurchId: true,
        audience: true,
        audienceChurchId: true,
        topicCommunityId: true
      }
    });
    return (
      row && {
        type,
        id,
        version: row.version,
        contextVersion: 0,
        source: { label: "Selected post", href: `/platform/posts/${id}` },
        scopeChurchId: churchScope(row),
        scopeTopicId: row.topicCommunityId
      }
    );
  }
  if (type === "COMMENT") {
    const row = await tx.platformPostComment.findFirst({
      where: {
        AND: [
          { id },
          commentVisibleWhere(context),
          { post: postReadableWhere(context) }
        ]
      },
      select: {
        id: true,
        version: true,
        post: {
          select: {
            id: true,
            version: true,
            authorChurchId: true,
            audience: true,
            audienceChurchId: true,
            topicCommunityId: true
          }
        }
      }
    });
    return (
      row && {
        type,
        id,
        version: row.version,
        contextVersion: row.post.version,
        source: {
          label: "Selected comment",
          href: `/platform/posts/${row.post.id}?comment=${id}`
        },
        scopeChurchId: churchScope(row.post),
        scopeTopicId: row.post.topicCommunityId
      }
    );
  }
  if (type === "PROFILE") {
    const row = await tx.platformUser.findFirst({
      where: { AND: [{ id }, socialUserWhere(context)] },
      select: {
        name: true,
        username: true,
        presentation: { select: { version: true } }
      }
    });
    return (
      row && {
        type,
        id,
        version: row.presentation?.version ?? 0,
        source: { label: row.name, href: `/platform/profile/${row.username}` },
        contextVersion: 0,
        scopeChurchId: null
      }
    );
  }
  if (type === "CHURCH") {
    const row = await tx.church.findUnique({
      where: { id },
      select: { name: true, version: true, managementVersion: true }
    });
    return (
      row && {
        type,
        id,
        version: row.version,
        contextVersion: row.managementVersion,
        source: { label: row.name, href: `/platform/churches/${id}` },
        scopeChurchId: null
      }
    );
  }
  throw new PortalError(400, "Choose a supported report target.");
}

async function requireTarget(
  tx: PostTx,
  context: PostContext,
  kind: unknown,
  id: unknown
) {
  const target = await targetIn(tx, context, kind, id);
  if (!target)
    throw new PortalError(
      404,
      "This item is unavailable. No report was submitted."
    );
  return target;
}

function reportLimit() {
  const value = Number(process.env.COMMUNITY_REPORTS_PER_10_MINUTES ?? 5);
  return Number.isSafeInteger(value) && value >= 1 && value <= 50
    ? value
    : null;
}

export async function communityReportIntakeAvailable(
  tx: PostTx,
  scopeChurchId: string | null,
  scopeTopicId?: string | null,
  targetType?: string
) {
  if (
    process.env.COMMUNITY_REPORTS_ENABLED !== "true" ||
    reportLimit() === null
  )
    return false;
  if (scopeTopicId && targetType !== "TOPIC") {
    const community = await tx.topicCommunity.findFirst({
      where: { id: scopeTopicId, ...topicPublicWhere },
      select: { ownerId: true }
    });
    if (
      community &&
      (await tx.topicMembership.findFirst({
        where: {
          communityId: scopeTopicId,
          joined: true,
          restrictedAt: null,
          user: eligibleWhere,
          OR: [{ moderator: true }, { userId: community.ownerId! }]
        },
        select: { id: true }
      }))
    )
      return true;
  }
  if (!scopeChurchId)
    return !!(await tx.platformOperatorGrant.findFirst({
      where: {
        capability: "REVIEW_COMMUNITY_REPORTS",
        revokedAt: null,
        user: eligibleWhere
      },
      select: { id: true }
    }));
  const churchId = scopeChurchId;
  const capability =
    targetType === "EXCHANGE_LISTING"
      ? "MODERATE_EXCHANGE_LISTINGS"
      : "MODERATE_CHURCH_POSTS";
  const direct = await tx.churchCapabilityGrant.findMany({
    where: {
      churchId,
      capability,
      revokedAt: null,
      user: {
        ...eligibleWhere,
        connections: { some: { churchId, state: "APPROVED" } }
      },
      OR: [
        { dependencyConnectionId: null },
        { dependency: { churchId, state: "APPROVED" } }
      ]
    },
    take: 101,
    select: { id: true, userId: true, dependency: { select: { userId: true } } }
  });
  if (
    direct.some(
      (grant) => !grant.dependency || grant.dependency.userId === grant.userId
    )
  )
    return true;
  return !!(await tx.churchRoleGrant.findFirst({
    where: {
      ...activeRoleGrantWhere(),
      churchId,
      capability
    },
    select: { id: true }
  }));
}

async function requireReview(
  tx: PostTx,
  ownerId: string,
  id: unknown,
  current?: PostContext
) {
  await eligibleActor(tx, ownerId);
  const context = current ?? (await postContext(tx, ownerId));
  const visible = await reviewReportRows(
    tx,
    await reportReviewAuthority(tx, context),
    {
      id: postId(id),
      limit: 1
    }
  );
  if (!visible.length)
    throw new PortalError(404, "This report is unavailable.");
  return tx.communityReport.findUniqueOrThrow({ where: { id: visible[0].id } });
}

function receipt(report: CommunityReport) {
  return {
    id: report.id,
    target: { type: report.targetType, id: report.targetId },
    reason: report.reason,
    details: report.details,
    status: report.status,
    version: report.version,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    ...(report.targetType === "CHURCH" && report.reason === "IMPERSONATION"
      ? {
          relatedReview: `/platform/church-claims/new?churchId=${encodeURIComponent(report.targetId)}`
        }
      : {})
  };
}

export function readCommunityReports(
  db: PrismaClient,
  token: unknown,
  query: Record<string, unknown>
) {
  socialInput(query, [
    "view",
    "id",
    "targetType",
    "targetId",
    "after",
    "status"
  ]);
  return withPostRead(db, token, async (tx, context) => {
    const ownerId = context.actorId;
    if (!ownerId)
      throw new PortalError(401, "Sign in to open your private reports.");
    if (query.view === "decisions") {
      await eligibleActor(tx, ownerId);
      const page = await readContentNotices(tx, context, query);
      const appeal = query.id
        ? (await contentAppealOffer(tx, ownerId, postId(query.id))).offer
        : undefined;
      return {
        ownerId,
        notices: page.notices,
        after: page.after,
        appeal,
        ownSource: page.ownSource
      };
    }
    if (query.view === "target") {
      await eligibleActor(tx, ownerId);
      const target = await requireTarget(
        tx,
        context,
        query.targetType,
        query.targetId
      );
      return {
        ownerId,
        target,
        available: await communityReportIntakeAvailable(
          tx,
          target.scopeChurchId,
          target.scopeTopicId,
          target.type
        )
      };
    }
    if (query.view === "queue") {
      await eligibleActor(tx, ownerId);
      const authority = await reportReviewAuthority(tx, context);
      if (
        !authority.global &&
        !authority.churches.length &&
        !authority.exchangeChurches.length &&
        !authority.topics.length
      )
        throw new PortalError(
          403,
          "Report review is unavailable for this account."
        );
      const status = query.status ?? "OPEN";
      if (status !== "OPEN" && status !== "CLOSED")
        throw new PortalError(400, "Choose open or closed reviews.");
      const after = query.after
        ? (
            await reviewReportRows(tx, authority, {
              id: postId(query.after),
              status,
              limit: 1
            })
          )[0]
        : undefined;
      if (query.after && !after)
        throw new PortalError(
          409,
          "Refresh the review queue. Its access or status has changed."
        );
      const rows = await reviewReportRows(tx, authority, {
        status,
        after,
        limit: 31
      });
      return {
        ownerId,
        status,
        reviews: rows.slice(0, 30).map((row) => ({
          id: row.id,
          type: row.targetType,
          reason: row.reason,
          status: row.status,
          version: row.version,
          churchScoped: !!row.scopeChurchId,
          topicScoped: !!row.scopeTopicId,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString()
        })),
        after: rows.length > 30 ? rows[29].id : null
      };
    }
    if (query.view === "review") {
      const report = await requireReview(tx, ownerId, query.id, context);
      const decisions = await tx.communityReportDecision.findMany({
        where: { reportId: report.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 30,
        select: {
          fromStatus: true,
          toStatus: true,
          reason: true,
          version: true,
          createdAt: true,
          action: true,
          authorReason: true,
          fromVisibility: true,
          toVisibility: true,
          sourceVersion: true,
          contextVersion: true
        }
      });
      const holds = await tx.retentionHold.findMany({
        where: { target: "REPORT", targetId: report.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 30,
        select: {
          id: true,
          version: true,
          reason: true,
          createdAt: true,
          reviewDueAt: true,
          releasedAt: true
        }
      });
      let selectedAttachment;
      let selectedIdea;
      let selectedListing;
      let selectedHandoff;
      if (report.targetType === "PANTRY_REQUEST") {
        const row = await tx.pantryRequest.findUnique({ where: { id: report.targetId }, include: { hub: true } });
        if (row && !row.hub.recoveryRequired) selectedHandoff = { type: report.targetType, content: pantryRequestEvidence(row), version: row.version, createdAt: row.createdAt };
      }
      if (report.targetType === "NEED_CONTRIBUTION") {
        const row = await tx.exchangeNeedContribution.findUnique({
          where: { id: report.targetId },
          include: { need: true }
        });
        if (row && !row.need.recoveryRequired)
          selectedHandoff = {
            type: report.targetType,
            content: needContributionEvidence(row),
            version: row.version,
            createdAt: row.createdAt
          };
      }
      if (
        report.targetType === "EXCHANGE_INQUIRY" ||
        report.targetType === "EXCHANGE_HANDOFF"
      ) {
        const row = await tx.exchangeInquiry.findUnique({
          where: { id: report.targetId }
        });
        if (
          row &&
          !row.recoveryRequired &&
          !row.bodyPurgedAt &&
          (report.targetType !== "EXCHANGE_HANDOFF" ||
            (row.confirmedAt && row.planVersion === report.contextVersion))
        )
          selectedHandoff = {
            type: report.targetType,
            content: exchangeHandoffEvidence(
              row,
              report.targetType === "EXCHANGE_HANDOFF"
            ),
            version: row.version,
            createdAt: row.createdAt
          };
      }
      if (report.targetType === "EXCHANGE_LISTING") {
        const listing = await tx.exchangeListing.findUnique({
          where: { id: report.targetId },
          select: exchangeEvidenceSelect
        });
        if (listing)
          selectedListing = {
            type: "EXCHANGE_LISTING" as const,
            content: exchangeEvidenceText(listing),
            version: listing.version,
            createdAt: listing.createdAt
          };
      }
      if (
        report.targetType === "FEEDBACK_IDEA" &&
        process.env.FEEDBACK_IDEAS_ENABLED === "true"
      ) {
        try {
          const idea = await requirePublicIdea(tx, report.targetId);
          selectedIdea = {
            type: "FEEDBACK_IDEA" as const,
            content: `${idea.title}\n\n${idea.summary}\n\n${idea.explanation}`,
            version: idea.version,
            createdAt: idea.publishedAt
          };
        } catch (error) {
          if (!(error instanceof PortalError && error.status === 404))
            throw error;
        }
      }
      if (report.targetType === "FEEDBACK_ATTACHMENT") {
        const asset = await tx.mediaAsset.findFirst({
          where: {
            id: report.targetId,
            purpose: "SUPPORT_ATTACHMENT",
            status: "READY",
            feedbackCaseId: { not: null }
          }
        });
        if (asset) {
          try {
            // Report authority never grants private case or attachment access.
            await readableFeedbackImage(tx, ownerId, asset);
            selectedAttachment = {
              type: "FEEDBACK_ATTACHMENT" as const,
              attachment: projectImage(asset),
              version: asset.version,
              createdAt: asset.createdAt
            };
          } catch (error) {
            if (
              !(
                error instanceof PortalError &&
                [401, 404].includes(error.status)
              )
            )
              throw error;
          }
        }
      }
      const selectedRequest =
        report.targetType === "CONTACT_REQUEST"
          ? await tx.adultContactRequest.findUnique({
              where: { id: report.targetId },
              select: {
                purpose: true,
                senderId: true,
                recipientId: true,
                createdAt: true
              }
            })
          : undefined;
      const selectedMessage =
        report.targetType === "MESSAGE"
          ? await tx.adultMessage.findUnique({
              where: { id: report.targetId },
              select: {
                content: true,
                senderId: true,
                conversationId: true,
                createdAt: true
              }
            })
          : undefined;
      const selectedText =
        report.targetType === "POST"
          ? await tx.platformPost.findUnique({
              where: { id: report.targetId },
              select: {
                content: true,
                contentNote: true,
                safeExcerpt: true,
                version: true,
                createdAt: true
              }
            })
          : report.targetType === "COMMENT"
            ? await tx.platformPostComment.findUnique({
                where: { id: report.targetId },
                select: { content: true, version: true, createdAt: true }
              })
            : report.targetType === "TOPIC"
              ? await tx.topicCommunity
                  .findUnique({
                    where: { id: report.targetId },
                    select: {
                      name: true,
                      description: true,
                      rules: true,
                      version: true,
                      createdAt: true
                    }
                  })
                  .then((row) =>
                    row
                      ? {
                          content: `${row.name}\n\n${row.description}\n\n${row.rules}`,
                          version: row.version,
                          createdAt: row.createdAt
                        }
                      : null
                  )
              : undefined;
      const source = await contentReviewSource(tx, report);
      const reconsiderationCases = await tx.supportCase.findMany({
        where: {
          moderationDecision: { reportId: report.id, actorId: ownerId }
        },
        select: { id: true, status: true, version: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 20
      });
      return {
        ownerId,
        report: receipt(report),
        decisions,
        holds,
        reviewDueAt: report.reviewDueAt.toISOString(),
        closedAt: report.closedAt?.toISOString() ?? null,
        evidence:
          selectedHandoff ??
          selectedListing ??
          selectedIdea ??
          selectedAttachment ??
          (selectedRequest
            ? { type: "CONTACT_REQUEST" as const, ...selectedRequest }
            : selectedMessage
              ? { type: "MESSAGE" as const, ...selectedMessage }
              : selectedText
                ? {
                    type:
                      report.targetType === "POST"
                        ? ("POST" as const)
                        : ("COMMENT" as const),
                    ...selectedText
                  }
                : undefined),
        reportedVersion: report.targetVersion,
        source: contentSourceView(source),
        reconsiderationCases
      };
    }
    if (query.view === "receipt") {
      const report = await tx.communityReport.findFirst({
        where: { id: postId(query.id), reporterId: ownerId }
      });
      if (!report)
        throw new PortalError(404, "This private receipt is unavailable.");
      return { ownerId, report: receipt(report) };
    }
    if (query.view !== undefined && query.view !== "mine")
      throw new PortalError(400, "Choose a supported report view.");
    const after = query.after ? postId(query.after) : null;
    if (
      after &&
      !(await tx.communityReport.findFirst({
        where: { id: after, reporterId: ownerId },
        select: { id: true }
      }))
    )
      throw new PortalError(409, "Refresh your private report list.");
    const rows = await tx.communityReport.findMany({
      where: { reporterId: ownerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
      ...(after ? { cursor: { id: after }, skip: 1 } : {})
    });
    return {
      ownerId,
      reports: rows.slice(0, 30).map(receipt),
      after: rows.length > 30 ? rows[29].id : null,
      canReview:
        context.moderators.size > 0 ||
        (await reportReviewAuthority(tx, context)).global
    };
  });
}

export function communityReportCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const resolving = input.operation === "resolve";
  const moderating = input.operation === "moderate";
  const holding = ["preserve", "review-hold", "release-hold"].includes(
    String(input.operation)
  );
  if (!resolving && !moderating && !holding && input.operation !== "create")
    throw new PortalError(400, "Choose a supported report action.");
  socialInput(
    input,
    moderating
      ? [
          "operation",
          "mutationId",
          "id",
          "expectedVersion",
          "expectedSourceVersion",
          "expectedContextVersion",
          "action",
          "authorReason",
          "decisionReason"
        ]
      : holding
        ? [
            "operation",
            "mutationId",
            "id",
            "expectedVersion",
            "holdId",
            "decisionReason"
          ]
        : resolving
          ? [
              "operation",
              "mutationId",
              "id",
              "expectedVersion",
              "resolution",
              "decisionReason"
            ]
          : [
              "operation",
              "mutationId",
              "targetType",
              "targetId",
              "expectedTargetVersion",
              "expectedContextVersion",
              "reason",
              "details"
            ]
  );
  let reviewed: CommunityReport | null = null;
  return socialCommand(
    db,
    token,
    "community-report",
    input,
    async (tx, ownerId) => {
      if (moderating) {
        const report = reviewed!;
        expected(input.expectedVersion, report.version);
        const { status: requestedStatus, ...decision } =
          await moderateReportedContent(tx, report, input, ownerId);
        const openAppeals = await tx.supportCase.count({
          where: {
            moderationDecision: { reportId: report.id },
            status: { notIn: ["RESOLVED", "CLOSED"] }
          }
        });
        const status = openAppeals ? "FOLLOW_UP_REQUIRED" : requestedStatus;
        const updated = await tx.communityReport.update({
          where: { id: report.id },
          data: {
            status,
            version: { increment: 1 },
            closedAt:
              status === "CLOSED" ? (report.closedAt ?? new Date()) : null,
            reviewDueAt: retentionDate(new Date(), 30)
          }
        });
        const saved = await tx.communityReportDecision.create({
          data: {
            reportId: report.id,
            actorId: ownerId,
            fromStatus: report.status,
            toStatus: updated.status,
            version: updated.version,
            ...decision
          }
        });
        await recordContentDecisionActivity(tx, saved);
        await recordReportControl(tx, updated, ownerId);
        await recordContentControl(tx, updated, saved);
        return {
          id: report.id,
          version: updated.version,
          message:
            "Content decision recorded. The author has a separate private notice. Original sharing and reply permissions remain in force."
        };
      }
      if (holding) {
        const report = reviewed!;
        expected(input.expectedVersion, report.version);
        const reason = postField(input.decisionReason, 1000, 5);
        const now = new Date();
        let hold;
        if (input.operation === "preserve") {
          if (input.holdId !== undefined)
            throw new PortalError(400, "Select the report being preserved.");
          if (
            await tx.retentionHold.findFirst({
              where: {
                target: "REPORT",
                targetId: report.id,
                releasedAt: null
              },
              select: { id: true }
            })
          )
            throw new PortalError(
              409,
              "This report already has an active hold. Refresh its review."
            );
          hold = await tx.retentionHold.create({
            data: {
              target: "REPORT",
              targetId: report.id,
              operatorId: ownerId,
              reason,
              reviewDueAt: retentionDate(now, 30)
            }
          });
        } else {
          const current = await tx.retentionHold.findFirst({
            where: {
              id: postId(input.holdId),
              target: "REPORT",
              targetId: report.id,
              releasedAt: null
            }
          });
          if (!current)
            throw new PortalError(
              409,
              "This hold changed. Refresh the review."
            );
          hold = await tx.retentionHold.update({
            where: { id: current.id },
            data: {
              reason,
              operatorId: ownerId,
              version: { increment: 1 },
              reviewDueAt: retentionDate(now, 30),
              ...(input.operation === "release-hold" ? { releasedAt: now } : {})
            }
          });
        }
        await tx.retentionHoldEvent.create({
          data: {
            holdId: hold.id,
            operatorId: ownerId,
            reason,
            version: hold.version,
            action:
              input.operation === "preserve"
                ? "PRESERVE"
                : input.operation === "release-hold"
                  ? "RELEASE"
                  : "REVIEW"
          }
        });
        const updated = await tx.communityReport.update({
          where: { id: report.id },
          data: {
            version: { increment: 1 },
            reviewDueAt: retentionDate(now, 30)
          }
        });
        await recordHoldControl(
          tx,
          hold,
          input.operation === "preserve"
            ? "PRESERVE"
            : input.operation === "release-hold"
              ? "RELEASE"
              : "REVIEW"
        );
        await recordReportControl(tx, updated, ownerId);
        return {
          id: report.id,
          version: updated.version,
          message:
            input.operation === "release-hold"
              ? "Preservation hold released. The original retention clock is unchanged."
              : "Selected report evidence preserved. Review is due within 30 days."
        };
      }
      if (resolving) {
        const report = reviewed!;
        expected(input.expectedVersion, report.version);
        if (
          input.resolution !== "CLOSED" &&
          input.resolution !== "FOLLOW_UP_REQUIRED"
        )
          throw new PortalError(
            400,
            "Choose whether this review is closed or requires follow-up."
          );
        const reason = postField(input.decisionReason, 1000, 5);
        if (
          input.resolution === "CLOSED" &&
          (await tx.supportCase.count({
            where: {
              moderationDecision: { reportId: report.id },
              status: { notIn: ["RESOLVED", "CLOSED"] }
            }
          }))
        )
          throw new PortalError(
            409,
            "Resolve the open reconsideration case before closing this report. Content restrictions can still be reviewed separately."
          );
        const updated = await tx.communityReport.update({
          where: { id: report.id },
          data: {
            status: input.resolution,
            version: { increment: 1 },
            closedAt:
              input.resolution === "CLOSED"
                ? (report.closedAt ?? new Date())
                : null,
            reviewDueAt: retentionDate(new Date(), 30)
          }
        });
        await tx.communityReportDecision.create({
          data: {
            reportId: report.id,
            actorId: ownerId,
            fromStatus: report.status,
            toStatus: updated.status,
            reason,
            version: updated.version
          }
        });
        await recordReportControl(tx, updated, ownerId);
        return {
          id: report.id,
          version: updated.version,
          message:
            "Report review recorded. No content or account permissions were changed."
        };
      }
      await eligibleActor(tx, ownerId);
      const target = await requireTarget(
        tx,
        await postContext(tx, ownerId),
        input.targetType,
        input.targetId
      );
      expected(input.expectedTargetVersion, target.version);
      expected(input.expectedContextVersion, target.contextVersion);
      if (
        typeof input.reason !== "string" ||
        !Object.hasOwn(communityReportReasons, input.reason)
      )
        throw new PortalError(400, "Choose a report reason.");
      const reason = input.reason as keyof typeof communityReportReasons;
      const details = postField(input.details ?? "", 2000);
      const duplicate = await tx.communityReport.findFirst({
        where: {
          reporterId: ownerId,
          targetType: target.type,
          targetId: target.id,
          targetVersion: target.version,
          contextVersion: target.contextVersion
        }
      });
      if (duplicate)
        return {
          id: duplicate.id,
          version: duplicate.version,
          message:
            "You already reported this version. Your original private receipt is available."
        };
      if (
        !(await communityReportIntakeAvailable(
          tx,
          target.scopeChurchId,
          target.scopeTopicId,
          target.type
        ))
      )
        throw new PortalError(
          503,
          "Reporting is unavailable for this item right now. Your report has not been submitted."
        );
      const maximum = reportLimit();
      if (maximum === null)
        throw new PortalError(
          503,
          "Reporting is temporarily unavailable. Your report has not been submitted."
        );
      const retryAfter = await activityBudget(
        tx,
        accountConfig().rateSecret,
        ownerId,
        "community-report",
        maximum,
        600
      );
      if (retryAfter)
        throw new PortalError(
          429,
          "You have reached the report limit. Keep your details and try again after the waiting period.",
          retryAfter
        );
      const report = await tx.communityReport.create({
        data: {
          reporterId: ownerId,
          targetType: target.type,
          targetId: target.id,
          targetVersion: target.version,
          contextVersion: target.contextVersion,
          scopeChurchId: target.scopeChurchId,
          scopeTopicId: target.scopeTopicId,
          reason,
          details,
          reviewDueAt: retentionDate(new Date(), 30)
        }
      });
      await recordReportActivity(tx, report);
      await recordReportControl(tx, report, null);
      return {
        id: report.id,
        version: report.version,
        message:
          "Report received. Your receipt is private; no automatic restriction was applied."
      };
    },
    resolving || moderating || holding
      ? async (tx, ownerId) => {
          reviewed = await requireReview(tx, ownerId, input.id);
        }
      : undefined
  );
}
