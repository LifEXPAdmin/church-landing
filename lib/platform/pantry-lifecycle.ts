import type { PantryRequest, Prisma } from "@prisma/client";
import type { PostTx } from "./post-access";
import { recordDiscoveryControl } from "./retention-controls";
import { recordDomainActivity } from "./domain-activity";
import { pantryActive } from "./pantry-options";
import { currentPantryRequest } from "./pantry-policy";

export async function recordPantryChange(
  tx: PostTx,
  hubId: string,
  actorId: string,
  action: string,
  details: {
    targetId?: string;
    reason?: string;
    previousQuantity?: number;
    quantity?: number;
  } = {}
) {
  const hub = await tx.pantryHub.update({
    where: { id: hubId },
    data: { version: { increment: 1 } }
  });
  await tx.pantryEvent.create({
    data: { hubId, version: hub.version, actorId, action, ...details }
  });
  await recordDiscoveryControl(tx, "PANTRY_HUB", actorId, hubId, hub.version);
  return hub;
}
export async function pantryNotice(
  tx: PostTx,
  row: PantryRequest,
  actorId: string
) {
  const recipientId =
    actorId === row.requesterId ? row.coordinatorId : row.requesterId;
  if (recipientId && recipientId !== actorId)
    await recordDomainActivity(tx, {
      kind: "PANTRY_REQUEST",
      category: "assistance",
      sourceId: row.id,
      sourceVersion: row.version,
      actorId,
      recipientId
    });
}
export async function endPantryRequest(
  tx: PostTx,
  row: PantryRequest,
  actorId: string,
  state: "CANCELED" | "DECLINED" | "REVOKED"
) {
  if (!pantryActive.includes(row.state) && state !== "REVOKED") return row;
  if (state === "REVOKED" && !row.authorityKey) return row;
  const saved = await tx.pantryRequest.update({
    where: { id: row.id },
    data: {
      state: pantryActive.includes(row.state) ? state : row.state,
      endedAt: row.endedAt ?? new Date(),
      ...(state === "REVOKED" ? { authorityKey: null } : {}),
      version: { increment: 1 }
    }
  });
  await recordPantryChange(tx, row.hubId, actorId, state, { targetId: row.id });
  if (state !== "REVOKED") await pantryNotice(tx, saved, actorId);
  return saved;
}
export async function revokePantryRequests(
  tx: PostTx,
  where: Prisma.PantryRequestWhereInput,
  actorId: string
) {
  let after: string | undefined;
  for (;;) {
    const rows = await tx.pantryRequest.findMany({
      where: {
        AND: [
          where,
          { authorityKey: { not: null } },
          ...(after ? [{ id: { gt: after } }] : [])
        ]
      },
      orderBy: { id: "asc" },
      take: 100
    });
    for (const row of rows) await endPantryRequest(tx, row, actorId, "REVOKED");
    if (rows.length < 100) return;
    after = rows.at(-1)!.id;
  }
}
export async function settlePantrySession(
  tx: PostTx,
  sessionId: string,
  actorId: string
) {
  const rows = await tx.pantryRequest.findMany({
    where: { sessionId, state: "ASSIGNED" },
    take: 101
  });
  for (const row of rows)
    if (!(await currentPantryRequest(tx, row)))
      await endPantryRequest(tx, row, actorId, "REVOKED");
}
export async function disablePantryCoordinator(
  tx: PostTx,
  hubId: string,
  actorId: string
) {
  await revokePantryRequests(tx, { hubId }, actorId);
  await tx.pantryHub.update({
    where: { id: hubId },
    data: {
      coordinatorKey: null,
      intakeEnabled: false,
      consentVersion: { increment: 1 }
    }
  });
  await recordPantryChange(tx, hubId, actorId, "CONSENT_ENDED");
}
