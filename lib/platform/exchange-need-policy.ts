import { createHash } from "node:crypto";
import type { ExchangeNeed, ExchangeNeedContribution } from "@prisma/client";
import { contactPolicy } from "./adult-contact-policy";
import { exchangeReceiverKey } from "./exchange-handoff-policy";
import {
  exchangeAuthority,
  exchangeCanManage,
  exchangeReadableWhere,
  requireExchangeActor
} from "./exchange-policy";
import { postContext, type PostContext, type PostTx } from "./post-access";
import { postId } from "./post-input";
import { PortalError } from "./portal-policy";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";

export const unavailableNeed = () =>
  new PortalError(
    404,
    "This need is unavailable to your current account or duties."
  );
export async function managedNeedListing(
  tx: PostTx,
  ownerId: string,
  id: unknown
) {
  const context = await postContext(tx, ownerId);
  requireExchangeActor(context);
  const listing = await tx.exchangeListing.findUnique({
    where: { id: postId(id) }
  });
  if (
    !listing?.ownerChurchId ||
    listing.intent !== "CHURCH_NEED" ||
    !exchangeCanManage(context, await exchangeAuthority(tx, context), listing)
  )
    throw unavailableNeed();
  await requirePrivilegedAuthentication(tx, ownerId);
  return { context, listing };
}
export async function needSource(tx: PostTx, id: string, context: PostContext) {
  const need = await tx.exchangeNeed.findFirst({
    where: {
      id,
      recoveryRequired: false,
      listing: exchangeReadableWhere(context)
    },
    include: { listing: true }
  });
  if (
    !need?.listing ||
    need.listing.intent !== "CHURCH_NEED" ||
    !need.listing.ownerChurchId
  )
    return null;
  return need;
}
export async function needCoordinatorCurrent(tx: PostTx, need: ExchangeNeed) {
  if (
    !need.coordinatorId ||
    !need.coordinatorKey ||
    !need.listingId ||
    need.recoveryRequired
  )
    return false;
  const listing = await tx.exchangeListing.findUnique({
    where: { id: need.listingId }
  });
  return (
    !!listing &&
    !listing.erasedAt &&
    !listing.recoveryRequired &&
    listing.intent === "CHURCH_NEED" &&
    (await exchangeReceiverKey(tx, listing, need.coordinatorId)) ===
      need.coordinatorKey
  );
}
export async function requireNeedCoordinator(
  tx: PostTx,
  need: ExchangeNeed,
  ownerId: string
) {
  if (
    need.coordinatorId !== ownerId ||
    !(await needCoordinatorCurrent(tx, need))
  )
    throw unavailableNeed();
  await managedNeedListing(tx, ownerId, need.listingId);
}
export async function needPair(
  tx: PostTx,
  needId: string,
  contributorId: string,
  pending = true
) {
  const context = await postContext(tx, contributorId);
  if (!context.eligible) return null;
  const need = await needSource(tx, needId, context);
  if (!need?.coordinatorId || !(await needCoordinatorCurrent(tx, need)))
    return null;
  const policy = await contactPolicy(tx, contributorId, need.coordinatorId);
  if (!policy || (pending && !policy.allowed)) return null;
  const connection =
    need.listing!.audience === "CHURCH" && need.listing!.audienceChurchId
      ? await tx.churchConnection.findUnique({
          where: {
            userId_churchId: {
              userId: contributorId,
              churchId: need.listing!.audienceChurchId
            }
          },
          select: { id: true, version: true, state: true }
        })
      : null;
  if (need.listing!.audience === "CHURCH" && connection?.state !== "APPROVED")
    return null;
  return {
    need,
    context,
    authorityKey: createHash("sha256")
      .update(
        JSON.stringify([need.coordinatorKey, need.consentVersion, connection])
      )
      .digest("hex")
  };
}
export async function currentNeedContribution(
  tx: PostTx,
  row: ExchangeNeedContribution
) {
  if (!row.contributorId || !row.coordinatorId) return null;
  const source = await needPair(
    tx,
    row.needId,
    row.contributorId,
    ["QUOTED", "WAITLISTED"].includes(row.state)
  );
  return source &&
    source.need.coordinatorId === row.coordinatorId &&
    source.need.consentVersion === row.consentVersion &&
    source.authorityKey === row.authorityKey
    ? source
    : null;
}
export function requireNeedOpen(
  need: ExchangeNeed & { listing?: { state: string } | null },
  now = new Date()
) {
  if (
    need.recoveryRequired ||
    need.closedAt ||
    need.canceledAt ||
    !need.deadlineAt ||
    need.deadlineAt <= now ||
    need.listing?.state !== "ACTIVE"
  )
    throw new PortalError(
      409,
      "This need is closed to new commitments. Existing receipts, withdrawals and loan returns remain separate."
    );
}
