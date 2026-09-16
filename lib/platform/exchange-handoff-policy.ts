import { createHash } from "node:crypto";
import type { ExchangeInquiry, ExchangeListing } from "@prisma/client";
import { contactPolicy } from "./adult-contact-policy";
import { effectiveChurchGrants } from "./church-permissions";
import { postContext, type PostTx } from "./post-access";
import { exchangeReadableWhere } from "./exchange-policy";
import { eligibleWhere } from "./portal-policy";
import { privilegedProjectionAvailable } from "./privileged-auth-policy";

export const activeExchangeInquiry = (state: string) =>
  ["INQUIRED", "SELECTED", "RESERVED"].includes(state);
export const heldExchangeInquiry = (state: string) =>
  state === "SELECTED" || state === "RESERVED";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Consent belongs to the actual adult and the current appointment/connection
// epoch. A replaced grant or regained membership cannot revive the old choice.
export async function exchangeReceiverKey(
  tx: PostTx,
  listing: ExchangeListing,
  receiverId: string
) {
  const receiver = await tx.platformUser.findFirst({
    where: {
      id: receiverId,
      ...eligibleWhere,
      erasedAt: null,
      deletionRequestedAt: null
    },
    select: { id: true }
  });
  if (!receiver) return null;
  const churchId = listing.ownerChurchId ?? listing.audienceChurchId;
  const connection = churchId
    ? await tx.churchConnection.findUnique({
        where: { userId_churchId: { userId: receiverId, churchId } },
        select: { id: true, version: true, state: true }
      })
    : null;
  if (churchId && connection?.state !== "APPROVED") return null;
  if (!listing.ownerChurchId) {
    return listing.ownerId === receiverId
      ? digest(["exchange-receiver-v1", receiverId, connection])
      : null;
  }
  if (!(await privilegedProjectionAvailable(tx, receiverId))) return null;
  const grants = await effectiveChurchGrants(
    tx,
    receiverId,
    [listing.ownerChurchId],
    ["MANAGE_EXCHANGE_LISTINGS"]
  );
  if (!grants.length) return null;
  const church = await tx.church.findUnique({
    where: { id: listing.ownerChurchId },
    select: { version: true, communityListed: true }
  });
  if (!church || (listing.audience === "PUBLIC" && !church.communityListed))
    return null;
  return digest([
    "exchange-receiver-v1",
    receiverId,
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

export async function exchangeInquirySource(
  tx: PostTx,
  listingId: string,
  requesterId: string,
  pending = true
) {
  const context = await postContext(tx, requesterId);
  if (!context.eligible) return null;
  const listing = await tx.exchangeListing.findFirst({
    where: {
      AND: [
        { id: listingId, inquiriesEnabled: true },
        exchangeReadableWhere(context)
      ]
    }
  });
  if (!listing?.inquiryReceiverId || !listing.inquiryAuthorityKey) return null;
  const receiverKey = await exchangeReceiverKey(
    tx,
    listing,
    listing.inquiryReceiverId
  );
  if (!receiverKey || receiverKey !== listing.inquiryAuthorityKey) return null;
  const policy = await contactPolicy(
    tx,
    requesterId,
    listing.inquiryReceiverId
  );
  if (!policy || (pending && !policy.allowed)) return null;
  const connection = listing.audienceChurchId
    ? await tx.churchConnection.findUnique({
        where: {
          userId_churchId: {
            userId: requesterId,
            churchId: listing.audienceChurchId
          }
        },
        select: { id: true, version: true, state: true }
      })
    : null;
  if (listing.audience === "CHURCH" && connection?.state !== "APPROVED")
    return null;
  return {
    listing,
    receiver: policy.recipient,
    authorityKey: digest([receiverKey, connection])
  };
}

export async function currentExchangeInquiry(
  tx: PostTx,
  row: ExchangeInquiry,
  now = new Date()
) {
  if (
    row.recoveryRequired ||
    !row.listingId ||
    !row.requesterId ||
    !row.receiverId
  )
    return null;
  if (activeExchangeInquiry(row.state) && row.expiresAt <= now) return null;
  const source = await exchangeInquirySource(
    tx,
    row.listingId,
    row.requesterId,
    row.state === "INQUIRED"
  );
  if (
    !source ||
    source.listing.inquiryContactVersion !== row.contactVersion ||
    source.listing.inquiryReceiverId !== row.receiverId ||
    source.authorityKey !== row.authorityKey
  )
    return null;
  if (heldExchangeInquiry(row.state) && source.listing.state !== "RESERVED")
    return null;
  if (
    row.state === "INQUIRED" &&
    !["ACTIVE", "RESERVED"].includes(source.listing.state)
  )
    return null;
  return source;
}

export const exchangeInquiryParticipant = (
  row: ExchangeInquiry,
  ownerId: string
) => row.requesterId === ownerId || row.receiverId === ownerId;
export const exchangeInquiryCleared = (
  row: ExchangeInquiry,
  ownerId: string
) =>
  row.requesterId === ownerId ? row.requesterClearedAt : row.receiverClearedAt;
