import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ADULT_POLICY } from "./portal-types";
import { eligibleWhere, PortalError } from "./portal-policy";
import type {
  FeedbackIdeaState,
  PublicFeedbackIdea,
  FeedbackIdeaInterest
} from "./feedback-idea-types";
type Tx = Prisma.TransactionClient;
export const ideaUnavailable = () =>
  new PortalError(404, "This reviewed idea is not available.");
type IdeaRow = Omit<
  PublicFeedbackIdea,
  "votes" | "publishedAt" | "updatedAt"
> & { publishedAt: Date; updatedAt: Date };

/** This SQL projection contains no source case IDs, requester IDs or private text. */
export const publicIdeaSource = Prisma.sql`
 SELECT i.id,i.version,i.title,i.summary,i.status,i.explanation,i."releaseId",i."publishedAt",i."updatedAt",i."mergedIntoId",
 CASE WHEN f."publicAttribution" THEN u.name ELSE NULL END AS attribution
 FROM "FeedbackIdea" i JOIN "FeedbackSubmission" f ON f."caseId"=i."sourceCaseId"
 JOIN "SupportCase" c ON c.id=f."caseId" JOIN "PlatformUser" u ON u.id=c."requesterId"
 WHERE i."publishedAt" IS NOT NULL AND i."publishedAt"<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND i."withdrawnAt" IS NULL
   AND f.kind='SUGGESTION' AND f."allowIdea" AND f."redactedAt" IS NULL AND f."sharingVersion">=i."reviewedSharingVersion"
   AND u."erasedAt" IS NULL AND u."suspendedAt" IS NULL AND u."deactivatedAt" IS NULL
   AND u."emailVerifiedAt" IS NOT NULL AND u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion"=${ADULT_POLICY}`;
export async function publicIdeaRows(
  tx: Tx,
  where: Prisma.Sql,
  limit = 21,
  offset = 0
) {
  return tx.$queryRaw<IdeaRow[]>(
    Prisma.sql`${publicIdeaSource} AND (${where}) ORDER BY i."updatedAt" DESC,i.id DESC LIMIT ${limit} OFFSET ${offset}`
  );
}
export async function requirePublicIdea(tx: Tx, id: string) {
  const [row] = await publicIdeaRows(tx, Prisma.sql`i.id=${id}`, 1);
  if (!row) throw ideaUnavailable();
  return row;
}
export async function publicIdeaRoot(tx: Tx, first: IdeaRow) {
  let row = first;
  const visited = new Set<string>();
  while (row.mergedIntoId) {
    if (visited.has(row.id) || visited.size >= 4) throw ideaUnavailable();
    visited.add(row.id);
    row = await requirePublicIdea(tx, row.mergedIntoId);
  }
  return row;
}
/** Public grouping preserves original votes/subscriptions. No private case is moved. */
export async function ideaFamilies(tx: Tx, ids: string[]) {
  if (!ids.length || ids.length > 21) return [];
  const rows = await tx.$queryRaw<
    { root: string; id: string; depth: number }[]
  >(Prisma.sql`
    WITH RECURSIVE family(root,id,depth,path) AS (
      SELECT id,id,0,ARRAY[id] FROM "FeedbackIdea" WHERE id IN (${Prisma.join(ids)})
      UNION ALL SELECT f.root,c.id,f.depth+1,f.path||c.id FROM family f
        JOIN "FeedbackIdea" c ON c."mergedIntoId"=f.id WHERE f.depth<5 AND NOT c.id=ANY(f.path)
    ) SELECT root,id,depth FROM family LIMIT 1051`);
  if (
    rows.length > 1050 ||
    rows.some((r) => r.depth >= 5) ||
    ids.some((id) => rows.filter((r) => r.root === id).length > 50)
  )
    throw new PortalError(
      409,
      "This idea group needs review before making another change."
    );
  return rows;
}
export async function ideaVoteCounts(tx: Tx, roots: string[]) {
  const families = await ideaFamilies(tx, roots),
    counts = new Map(roots.map((id) => [id, 0]));
  if (!families.length) return counts;
  const rows = await tx.$queryRaw<{ root: string; count: number }[]>(Prisma.sql`
    WITH family(root,id) AS (VALUES ${Prisma.join(families.map((r) => Prisma.sql`(${r.root},${r.id})`))})
    SELECT f.root,count(DISTINCT v."userId")::int AS count FROM family f
    JOIN "FeedbackIdeaVote" v ON v."ideaId"=f.id AND v.active JOIN "PlatformUser" u ON u.id=v."userId"
    WHERE u."erasedAt" IS NULL AND u."suspendedAt" IS NULL AND u."deactivatedAt" IS NULL
      AND u."emailVerifiedAt" IS NOT NULL AND u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion"=${ADULT_POLICY}
    GROUP BY f.root`);
  for (const row of rows) counts.set(row.root, row.count);
  return counts;
}
function interestVersion(
  family: string[],
  rows: { ideaId: string; version: number }[]
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        family: [...family].sort(),
        rows: rows
          .map((r) => [r.ideaId, r.version])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      })
    )
    .digest("hex");
}
export async function ideaInterest(
  tx: Tx,
  id: string,
  ownerId: string | null
): Promise<FeedbackIdeaInterest> {
  const family = (await ideaFamilies(tx, [id])).map((r) => r.id);
  const actor =
    ownerId &&
    (await tx.platformUser.findFirst({
      where: { id: ownerId, ...eligibleWhere, erasedAt: null },
      select: { id: true }
    }));
  const votes = ownerId
    ? await tx.feedbackIdeaVote.findMany({
        where: { userId: ownerId, ideaId: { in: family } },
        select: { ideaId: true, version: true, active: true }
      })
    : [];
  const subscriptions = ownerId
    ? await tx.feedbackIdeaSubscription.findMany({
        where: { userId: ownerId, ideaId: { in: family } },
        select: {
          ideaId: true,
          version: true,
          inAppSince: true,
          emailSince: true,
          pushSince: true
        }
      })
    : [];
  return {
    canVote: !!actor,
    voted: votes.some((v) => v.active),
    voteVersion: interestVersion(family, votes),
    subscriptionVersion: interestVersion(family, subscriptions),
    inApp: subscriptions.some((s) => s.inAppSince),
    email: subscriptions.some((s) => s.emailSince),
    push: subscriptions.some((s) => s.pushSince)
  };
}
export function projectPublicIdea(
  row: IdeaRow,
  votes: number
): PublicFeedbackIdea {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    summary: row.summary,
    status: row.status as FeedbackIdeaState,
    explanation: row.explanation,
    releaseId: row.releaseId,
    attribution: row.attribution,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    mergedIntoId: row.mergedIntoId,
    votes
  };
}
