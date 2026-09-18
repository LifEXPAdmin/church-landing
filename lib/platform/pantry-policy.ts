import { createHash } from "node:crypto";
import type { PantryHub, PantryRequest, Prisma } from "@prisma/client";
import { contactPolicy } from "./adult-contact-policy";
import { effectiveChurchGrants } from "./church-permissions";
import { postContext, type PostContext, type PostTx } from "./post-access";
import { eligibleWhere, PortalError } from "./portal-policy";
import {
  privilegedProjectionAvailable,
  requirePrivilegedAuthentication
} from "./privileged-auth-policy";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const unavailablePantry = () =>
  new PortalError(
    404,
    "This assistance record is unavailable to your current account or duties."
  );
export function pantryReadableWhere(
  context: PostContext
): Prisma.PantryHubWhereInput {
  return {
    recoveryRequired: false,
    published: true,
    churchId: { not: null },
    OR: [
      { audience: "PUBLIC", church: { communityListed: true } },
      { audience: "CHURCH", churchId: { in: context.churches } }
    ]
  };
}
export async function pantryManagerKey(
  tx: PostTx,
  churchId: string,
  actorId: string
) {
  const person = await tx.platformUser.findFirst({
    where: {
      id: actorId,
      ...eligibleWhere,
      erasedAt: null,
      deletionRequestedAt: null
    },
    select: { id: true }
  });
  if (!person) return null;
  const connection = await tx.churchConnection.findUnique({
    where: { userId_churchId: { userId: actorId, churchId } },
    select: { id: true, version: true, state: true }
  });
  if (connection?.state !== "APPROVED") return null;
  const grants = await effectiveChurchGrants(
    tx,
    actorId,
    [churchId],
    ["MANAGE_CHURCH_ASSISTANCE"]
  );
  if (!grants.length) return null;
  const church = await tx.church.findUnique({
    where: { id: churchId },
    select: { version: true, communityListed: true }
  });
  if (!church) return null;
  return hash([
    "pantry-coordinator-v1",
    actorId,
    churchId,
    connection,
    church,
    grants
      .map((g) => [
        g.id,
        g.version,
        g.source,
        g.assignmentId,
        g.dependency?.id,
        g.dependency?.version
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  ]);
}
export async function requirePantryManager(
  tx: PostTx,
  churchId: string,
  actorId: string
) {
  const key = await pantryManagerKey(tx, churchId, actorId);
  if (!key) throw unavailablePantry();
  await requirePrivilegedAuthentication(tx, actorId);
  return key;
}
export async function currentPantryCoordinator(tx: PostTx, hub: PantryHub) {
  if (
    !hub.churchId ||
    !hub.coordinatorId ||
    !hub.coordinatorKey ||
    hub.recoveryRequired
  )
    return false;
  const church = await tx.church.findUnique({
    where: { id: hub.churchId },
    select: { communityListed: true }
  });
  return (
    !!church &&
    (hub.audience !== "PUBLIC" || church.communityListed) &&
    (await pantryManagerKey(tx, hub.churchId, hub.coordinatorId)) ===
      hub.coordinatorKey
  );
}
export async function requirePantryCoordinator(
  tx: PostTx,
  hub: PantryHub,
  actorId: string
) {
  if (
    hub.coordinatorId !== actorId ||
    !(await currentPantryCoordinator(tx, hub))
  )
    throw unavailablePantry();
  await requirePrivilegedAuthentication(tx, actorId);
}
export async function pantryPair(
  tx: PostTx,
  hub: PantryHub,
  requesterId: string,
  initial = false
) {
  const context = await postContext(tx, requesterId);
  if (
    !context.eligible ||
    !hub.coordinatorId ||
    !(await currentPantryCoordinator(tx, hub))
  )
    return null;
  const source = await tx.pantryHub.findFirst({
    where: { AND: [{ id: hub.id }, pantryReadableWhere(context)] },
    select: { id: true }
  });
  if (!source) return null;
  const pair = await contactPolicy(tx, requesterId, hub.coordinatorId);
  if (!pair || (initial && (!pair.allowed || !hub.intakeEnabled))) return null;
  const connection =
    hub.audience === "CHURCH" && hub.churchId
      ? await tx.churchConnection.findUnique({
          where: {
            userId_churchId: { userId: requesterId, churchId: hub.churchId }
          },
          select: { id: true, version: true, state: true }
        })
      : null;
  if (hub.audience === "CHURCH" && connection?.state !== "APPROVED")
    return null;
  return {
    context,
    coordinator: pair.recipient,
    authorityKey: hash([
      hub.coordinatorKey,
      hub.consentVersion,
      hub.accessVersion,
      connection
    ])
  };
}
export async function currentPantryRequest(
  tx: PostTx,
  row: PantryRequest,
  hub?: PantryHub | null
) {
  if (!row.requesterId || !row.coordinatorId || !row.authorityKey) return null;
  hub ??= await tx.pantryHub.findUnique({ where: { id: row.hubId } });
  if (
    !hub ||
    row.consentVersion !== hub.consentVersion ||
    row.coordinatorId !== hub.coordinatorId
  )
    return null;
  const pair = await pantryPair(tx, hub, row.requesterId);
  return pair?.authorityKey === row.authorityKey ? { hub, ...pair } : null;
}
export async function pantryManagedChurches(tx: PostTx, context: PostContext) {
  if (
    !context.actorId ||
    !context.eligible ||
    !(await privilegedProjectionAvailable(tx, context.actorId))
  )
    return [];
  const grants = await effectiveChurchGrants(
    tx,
    context.actorId,
    context.churches,
    ["MANAGE_CHURCH_ASSISTANCE"]
  );
  return [
    ...new Map(
      grants.map((g) => [g.churchId, { id: g.churchId, name: g.church.name }])
    ).values()
  ];
}
