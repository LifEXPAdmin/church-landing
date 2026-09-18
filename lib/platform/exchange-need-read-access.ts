import { createHash } from "node:crypto";
import type { ExchangeNeedContribution } from "@prisma/client";
import { contactAudience } from "./adult-contact-policy";
import { needCoordinatorCurrent, needSource } from "./exchange-need-policy";
import { NEED_PAGE } from "./exchange-need-options";
import { exchangeReadableWhere } from "./exchange-policy";
import type { PostContext, PostTx } from "./post-access";
import { eligibleWhere, PortalError } from "./portal-policy";

export type NeedContributionReadSource = {
  need: NonNullable<Awaited<ReturnType<typeof needSource>>>;
  contributorName: string;
};

// One bounded read transaction owns these inputs. Reuse the canonical listing
// predicate and coordinator epoch; do not cache permissions across requests or
// use this projection to authorize a mutation. Mutes do not revoke access.
export async function needContributionReadSources(
  tx: PostTx,
  rows: ExchangeNeedContribution[]
) {
  if (rows.length > NEED_PAGE) throw Error("Bound Needs access before reading");
  const result = new Map<string, NeedContributionReadSource>();
  if (!rows.length) return result;
  const contributors = [
    ...new Set(rows.flatMap((r) => (r.contributorId ? [r.contributorId] : [])))
  ];
  const participants = [
    ...new Set(
      rows.flatMap((r) =>
        [r.contributorId, r.coordinatorId].filter((id): id is string => !!id)
      )
    )
  ];
  const people = await tx.platformUser.findMany({
    where: { id: { in: participants }, ...eligibleWhere },
    select: {
      id: true,
      name: true,
      socialPreferences: { select: { contactRequests: true } }
    }
  });
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const blocks = await tx.socialRelationship.findMany({
    where: {
      blocked: true,
      OR: [
        { ownerId: { in: contributors } },
        { targetUserId: { in: contributors } }
      ]
    },
    select: { ownerId: true, targetUserId: true },
    take: contributors.length * 2000 + 1
  });
  const connections = await tx.churchConnection.findMany({
    where: { userId: { in: contributors }, state: "APPROVED" },
    select: {
      id: true,
      userId: true,
      churchId: true,
      state: true,
      version: true
    },
    take: contributors.length * 200 + 1
  });
  const followed = await tx.platformFollow.findMany({
    where: {
      followerId: { in: participants },
      followingId: { in: contributors }
    },
    select: { followerId: true, followingId: true }
  });
  const contexts = new Map<string, PostContext>();
  for (const id of contributors) {
    const related = blocks.filter(
      (b) => b.ownerId === id || b.targetUserId === id
    );
    const joined = connections.filter((c) => c.userId === id);
    if (related.length > 2000 || joined.length > 200)
      throw new PortalError(503, "These Needs permissions need a size review.");
    contexts.set(id, {
      actorId: id,
      eligible: peopleById.has(id),
      blockedIds: related.flatMap((b) =>
        b.targetUserId ? [b.ownerId === id ? b.targetUserId : b.ownerId] : []
      ),
      churches: joined.map((c) => c.churchId),
      publishers: new Set(),
      moderators: new Set(),
      volunteers: new Set()
    });
  }
  const coordinators = new Map<string, boolean>();
  const sources = new Map<string, Awaited<ReturnType<typeof needSource>>>();
  for (const row of rows) {
    if (!row.contributorId || !row.coordinatorId) continue;
    const context = contexts.get(row.contributorId);
    if (!context?.eligible) continue;
    // Identical canonical predicates may share a source read within this
    // transaction. Different membership or block scopes retain separate reads.
    const pair = JSON.stringify([row.needId, exchangeReadableWhere(context)]);
    if (!sources.has(pair))
      sources.set(pair, await needSource(tx, row.needId, context));
    const need = sources.get(pair);
    if (
      !need?.coordinatorId ||
      need.coordinatorId !== row.coordinatorId ||
      need.consentVersion !== row.consentVersion
    )
      continue;
    if (!coordinators.has(need.id))
      coordinators.set(need.id, await needCoordinatorCurrent(tx, need));
    if (!coordinators.get(need.id)) continue;
    const coordinator = peopleById.get(need.coordinatorId);
    if (
      !coordinator ||
      coordinator.id === row.contributorId ||
      context.blockedIds?.includes(coordinator.id)
    )
      continue;
    const audience = contactAudience(
      coordinator.socialPreferences?.contactRequests
    );
    if (
      ["QUOTED", "WAITLISTED"].includes(row.state) &&
      audience !== "EVERYONE" &&
      !(
        audience === "FOLLOWED" &&
        followed.some(
          (f) =>
            f.followerId === coordinator.id &&
            f.followingId === row.contributorId
        )
      )
    )
      continue;
    const connection =
      need.listing!.audience === "CHURCH" && need.listing!.audienceChurchId
        ? connections.find(
            (c) =>
              c.userId === row.contributorId &&
              c.churchId === need.listing!.audienceChurchId
          )
        : null;
    if (need.listing!.audience === "CHURCH" && !connection) continue;
    // Exact selected shape/order matches needPair's canonical consent epoch.
    const epoch = connection
      ? {
          id: connection.id,
          version: connection.version,
          state: connection.state
        }
      : null;
    const key = createHash("sha256")
      .update(JSON.stringify([need.coordinatorKey, need.consentVersion, epoch]))
      .digest("hex");
    if (key === row.authorityKey)
      result.set(row.id, {
        need,
        contributorName: peopleById.get(row.contributorId)!.name
      });
  }
  return result;
}
