import { Prisma, type SocialEvent } from "@prisma/client";
import { eligibleWhere } from "./portal-policy";
import {
  ideaFamilies,
  publicIdeaRows,
  publicIdeaSource
} from "./feedback-idea-access";
import {
  feedbackChannelAllowed,
  feedbackFollowupEnabled,
  type FeedbackChannel
} from "./feedback-followup-policy";
import type { NotificationSource } from "./notification-source";
type Tx = Prisma.TransactionClient;

// Filter per-source opt-outs before Activity pagination and unread counts. The
// normal source resolver still rechecks canonical evidence before returning a link.
export function feedbackActivityWhere(ownerId: string) {
  if (!feedbackFollowupEnabled())
    return Prisma.sql`e.kind NOT IN ('FEEDBACK_CASE','FEEDBACK_IDEA')`;
  return Prisma.sql`(
    (e.kind <> 'FEEDBACK_CASE' OR EXISTS (SELECT 1 FROM "FeedbackSubmission" f JOIN "SupportCase" c ON c.id=f."caseId"
      WHERE f."caseId"=e."sourceId" AND c."requesterId"=${ownerId} AND f."contactAllowed" AND f."redactedAt" IS NULL AND f."contactInAppSince"<e."createdAt"))
    AND (e.kind <> 'FEEDBACK_IDEA' OR (${process.env.FEEDBACK_IDEAS_ENABLED === "true"} AND EXISTS (
      WITH RECURSIVE visible AS (${publicIdeaSource}), family(id,path) AS (
        SELECT id,ARRAY[id] FROM visible WHERE id=e."sourceId" AND "mergedIntoId" IS NULL AND "publishedAt"<=e."createdAt"
        UNION ALL SELECT c.id,f.path||c.id FROM family f JOIN visible c ON c."mergedIntoId"=f.id
          WHERE cardinality(f.path)<5 AND NOT c.id=ANY(f.path) AND c."publishedAt"<=e."createdAt"
          AND EXISTS (SELECT 1 FROM (SELECT action,"toMergedIntoId","createdAt" FROM "FeedbackIdeaEvent" x WHERE x."ideaId"=c.id AND action IN ('MERGE','UNMERGE') ORDER BY version DESC LIMIT 1) edge
            WHERE edge.action='MERGE' AND edge."toMergedIntoId"=f.id AND edge."createdAt"<e."createdAt")
      ) SELECT 1 FROM family f JOIN "FeedbackIdeaSubscription" s ON s."ideaId"=f.id WHERE s."userId"=${ownerId} AND s."inAppSince"<e."createdAt"
    )))
  )`;
}

// Only a currently public root and memberships already established at the
// update time may fan out. Original subscriptions remain with their own ideas.
export async function feedbackNotificationFamily(
  tx: Tx,
  ideaId: string,
  at: Date
) {
  if (process.env.FEEDBACK_IDEAS_ENABLED !== "true") return [];
  const [root] = await publicIdeaRows(tx, Prisma.sql`i.id=${ideaId}`, 1);
  if (!root || root.mergedIntoId || root.publishedAt > at) return [];
  const family = await ideaFamilies(tx, [ideaId]);
  const publicRows = await publicIdeaRows(
    tx,
    Prisma.sql`i.id IN (${Prisma.join(family.map((r) => r.id))})`,
    50
  );
  const visible = new Map(publicRows.map((r) => [r.id, r]));
  const edges = await tx.$queryRaw<
    { ideaId: string; toMergedIntoId: string | null; createdAt: Date }[]
  >(Prisma.sql`
    SELECT DISTINCT ON ("ideaId") "ideaId","toMergedIntoId","createdAt" FROM "FeedbackIdeaEvent"
    WHERE "ideaId" IN (${Prisma.join(family.map((r) => r.id))}) AND action IN ('MERGE','UNMERGE')
    ORDER BY "ideaId",version DESC`);
  const merges = new Map(edges.map((e) => [e.ideaId, e]));
  return publicRows
    .filter((candidate) => {
      let row = candidate;
      const visited = new Set<string>();
      while (row.id !== ideaId) {
        const edge = merges.get(row.id);
        if (
          visited.has(row.id) ||
          visited.size >= 4 ||
          row.publishedAt > at ||
          !row.mergedIntoId ||
          !edge ||
          edge.toMergedIntoId !== row.mergedIntoId ||
          edge.createdAt >= at
        )
          return false;
        visited.add(row.id);
        const parent = visible.get(row.mergedIntoId);
        if (!parent) return false;
        row = parent;
      }
      return true;
    })
    .map((r) => r.id);
}

export async function feedbackNotificationSources(
  tx: Tx,
  events: SocialEvent[],
  channel: FeedbackChannel
) {
  const result = new Map<string, NotificationSource>();
  const ownerId = events[0]?.recipientId;
  if (
    !feedbackFollowupEnabled() ||
    !ownerId ||
    events.length > 50 ||
    events.some((e) => e.recipientId !== ownerId)
  )
    return result;
  if (
    !(await tx.platformUser.findFirst({
      where: { id: ownerId, ...eligibleWhere, erasedAt: null },
      select: { id: true }
    }))
  )
    return result;
  const cases = events.filter(
    (e) => e.kind === "FEEDBACK_CASE" && e.sourceId && e.sourceVersion
  );
  const rows = cases.length
    ? await tx.feedbackSubmission.findMany({
        where: {
          caseId: { in: cases.map((e) => e.sourceId!) },
          redactedAt: null,
          contactAllowed: true,
          case: {
            requesterId: ownerId,
            ownerGrant: {
              revokedAt: null,
              capability: "RESPOND",
              user: eligibleWhere
            }
          }
        },
        select: {
          caseId: true,
          contactInAppSince: true,
          contactEmailSince: true,
          contactPushSince: true,
          case: {
            select: {
              ownerGrantVersion: true,
              ownerGrant: {
                select: {
                  version: true,
                  revokedAt: true,
                  capability: true,
                  userId: true,
                  user: {
                    select: {
                      suspendedAt: true,
                      deactivatedAt: true,
                      erasedAt: true
                    }
                  }
                }
              },
              reads: {
                where: { userId: ownerId },
                select: { version: true },
                take: 1
              },
              messages: {
                where: {
                  version: { in: cases.map((e) => e.sourceVersion!) },
                  redactedAt: null,
                  kind: { in: ["REPLY", "TRANSITION", "RESOLUTION", "FEATURE"] }
                },
                select: { version: true, authorId: true, createdAt: true },
                take: 50
              }
            }
          }
        },
        take: 50
      })
    : [];
  for (const e of cases) {
    const row = rows.find((r) => r.caseId === e.sourceId),
      grant = row?.case.ownerGrant;
    if (
      !row ||
      !grant ||
      grant.userId !== e.actorId ||
      grant.revokedAt ||
      grant.capability !== "RESPOND" ||
      row.case.ownerGrantVersion !== grant.version ||
      grant.user.suspendedAt ||
      grant.user.deactivatedAt ||
      grant.user.erasedAt ||
      !row.case.messages.some(
        (m) =>
          m.version === e.sourceVersion &&
          m.authorId === e.actorId &&
          m.createdAt.getTime() === e.createdAt.getTime()
      ) ||
      ((channel === "PUSH" || channel === "EMAIL") &&
        (row.case.reads[0]?.version ?? 0) >= e.sourceVersion!) ||
      !feedbackChannelAllowed(
        {
          inAppSince: row.contactInAppSince,
          emailSince: row.contactEmailSince,
          pushSince: row.contactPushSince
        },
        channel,
        e.createdAt
      )
    )
      continue;
    if (e.notificationCategory === "feedback")
      result.set(e.id, {
        category: "feedback",
        href: `/platform/feedback/cases/${row.caseId}`,
        group: `feedback:${row.caseId}`
      });
  }
  const ideas = events.filter(
    (e) => e.kind === "FEEDBACK_IDEA" && e.sourceId && e.sourceVersion
  );
  const proof = ideas.length
    ? await tx.feedbackIdeaEvent.findMany({
        where: {
          OR: ideas.map((e) => ({
            ideaId: e.sourceId!,
            version: e.sourceVersion!
          })),
          action: "STATUS"
        },
        select: { ideaId: true, version: true, actorId: true, createdAt: true },
        take: 50
      })
    : [];
  for (const e of ideas) {
    if (
      !proof.some(
        (p) =>
          p.ideaId === e.sourceId &&
          p.version === e.sourceVersion &&
          p.actorId === e.actorId &&
          p.createdAt.getTime() === e.createdAt.getTime()
      )
    )
      continue;
    const family = await feedbackNotificationFamily(
      tx,
      e.sourceId!,
      e.createdAt
    );
    if (!family.length) continue;
    const choices = await tx.feedbackIdeaSubscription.findMany({
      where: { userId: ownerId, ideaId: { in: family } },
      select: { inAppSince: true, emailSince: true, pushSince: true },
      take: 50
    });
    if (
      choices.some((row) =>
        feedbackChannelAllowed(row, channel, e.createdAt)
      ) &&
      e.notificationCategory === "feedback"
    )
      result.set(e.id, {
        category: "feedback",
        href: `/platform/feedback/ideas/${e.sourceId}`,
        group: `idea:${e.sourceId}`
      });
  }
  return result;
}
