import { createHash } from "node:crypto";
import type { PantryHub, PantryRequest } from "@prisma/client";
import { contactAudience } from "./adult-contact-policy";
import { currentPantryCoordinator, pantryReadableWhere } from "./pantry-policy";
import type { PostContext, PostTx } from "./post-access";
import { eligibleWhere, PortalError } from "./portal-policy";
import { PANTRY_PAGE } from "./pantry-options";

export type PantryReadSource = { hub: PantryHub; requesterName: string };
// Read-only projection within one permission transaction. Commands always use
// canonical pair authorization; these facts are never retained across requests.
export async function pantryRequestReadSources(
  tx: PostTx,
  rows: PantryRequest[]
) {
  if (rows.length > PANTRY_PAGE)
    throw Error("Bound pantry access before reading");
  const result = new Map<string, PantryReadSource>();
  if (!rows.length) return result;
  const requesters = [
    ...new Set(rows.flatMap((r) => (r.requesterId ? [r.requesterId] : [])))
  ];
  const participants = [
    ...new Set(
      rows.flatMap((r) =>
        [r.requesterId, r.coordinatorId].filter((id): id is string => !!id)
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
        { ownerId: { in: requesters } },
        { targetUserId: { in: requesters } }
      ]
    },
    select: { ownerId: true, targetUserId: true },
    take: requesters.length * 2000 + 1
  });
  const connections = await tx.churchConnection.findMany({
    where: { userId: { in: requesters }, state: "APPROVED" },
    select: {
      id: true,
      userId: true,
      churchId: true,
      state: true,
      version: true
    },
    take: requesters.length * 200 + 1
  });
  const sources = new Map<string, PantryHub | null>();
  const coordinators = new Map<string, boolean>();
  for (const row of rows) {
    if (
      !row.requesterId ||
      !row.coordinatorId ||
      !row.authorityKey ||
      !peopleById.has(row.requesterId)
    )
      continue;
    const joined = connections.filter((c) => c.userId === row.requesterId),
      related = blocks.filter(
        (b) =>
          b.ownerId === row.requesterId || b.targetUserId === row.requesterId
      );
    if (joined.length > 200 || related.length > 2000)
      throw new PortalError(
        503,
        "These assistance permissions need a size review."
      );
    const context: PostContext = {
      actorId: row.requesterId,
      eligible: true,
      churches: joined.map((c) => c.churchId),
      publishers: new Set(),
      moderators: new Set(),
      volunteers: new Set()
    };
    const predicate = pantryReadableWhere(context),
      key = JSON.stringify([row.hubId, predicate]);
    if (!sources.has(key))
      sources.set(
        key,
        await tx.pantryHub.findFirst({
          where: { AND: [{ id: row.hubId }, predicate] }
        })
      );
    const hub = sources.get(key);
    if (
      !hub ||
      hub.coordinatorId !== row.coordinatorId ||
      hub.consentVersion !== row.consentVersion
    )
      continue;
    if (!coordinators.has(hub.id))
      coordinators.set(hub.id, await currentPantryCoordinator(tx, hub));
    if (!coordinators.get(hub.id)) continue;
    const coordinator = peopleById.get(row.coordinatorId);
    if (
      !coordinator ||
      row.coordinatorId === row.requesterId ||
      related.some(
        (b) =>
          b.ownerId === row.coordinatorId ||
          b.targetUserId === row.coordinatorId
      )
    )
      continue;
    contactAudience(coordinator.socialPreferences?.contactRequests);
    const connection =
      hub.audience === "CHURCH"
        ? joined.find((c) => c.churchId === hub.churchId)
        : null;
    if (hub.audience === "CHURCH" && !connection) continue;
    const epoch = connection
      ? {
          id: connection.id,
          version: connection.version,
          state: connection.state
        }
      : null;
    const authorityKey = createHash("sha256")
      .update(
        JSON.stringify([
          hub.coordinatorKey,
          hub.consentVersion,
          hub.accessVersion,
          epoch
        ])
      )
      .digest("hex");
    if (authorityKey === row.authorityKey)
      result.set(row.id, {
        hub,
        requesterName: peopleById.get(row.requesterId)!.name
      });
  }
  return result;
}
