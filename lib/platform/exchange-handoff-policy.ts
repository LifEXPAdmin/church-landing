import { createHash } from "node:crypto";
import type { ExchangeInquiry, ExchangeListing } from "@prisma/client";
import { contactAudience, contactPolicy } from "./adult-contact-policy";
import { effectiveChurchGrants } from "./church-permissions";
import { postContext, type PostContext, type PostTx } from "./post-access";
import { exchangeReadableWhere } from "./exchange-policy";
import { eligibleWhere, PortalError } from "./portal-policy";
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
  now = new Date(),
  sourceFor = exchangeInquirySource
) {
  if (
    row.recoveryRequired ||
    !row.listingId ||
    !row.requesterId ||
    !row.receiverId
  )
    return null;
  if (activeExchangeInquiry(row.state) && row.expiresAt <= now) return null;
  const source = await sourceFor(
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

// This cache belongs to one bounded, read-only permission transaction. Keep the
// canonical listing predicate and receiver epoch owner; batch only repeated
// participant/pair inputs. Mutes affect discovery, not retained handoff access.
export async function exchangeInquiryReadSources(
  tx: PostTx,
  rows: ExchangeInquiry[]
) {
  if (rows.length > 20)
    throw new Error("Bound the inquiry page before loading access");
  const requesterIds = [
    ...new Set(rows.flatMap((r) => (r.requesterId ? [r.requesterId] : [])))
  ];
  const participantIds = [
    ...new Set(
      rows.flatMap((r) =>
        [r.requesterId, r.receiverId].filter((id): id is string => !!id)
      )
    )
  ];
  const people = await tx.platformUser.findMany({
    where: { id: { in: participantIds }, ...eligibleWhere },
    select: {
      id: true,
      name: true,
      username: true,
      socialPreferences: { select: { contactRequests: true } }
    }
  });
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const blocks = await tx.socialRelationship.findMany({
    where: {
      blocked: true,
      OR: [
        { ownerId: { in: requesterIds } },
        { targetUserId: { in: requesterIds } }
      ]
    },
    select: { ownerId: true, targetUserId: true },
    take: requesterIds.length * 2000 + 1
  });
  const connections = await tx.churchConnection.findMany({
    where: { userId: { in: requesterIds }, state: "APPROVED" },
    select: {
      id: true,
      userId: true,
      churchId: true,
      state: true,
      version: true
    },
    take: requesterIds.length * 200 + 1
  });
  const followed = await tx.platformFollow.findMany({
    where: {
      followerId: { in: participantIds },
      followingId: { in: requesterIds }
    },
    select: { followerId: true, followingId: true }
  });
  const contexts = new Map<string, PostContext>();
  for (const requesterId of requesterIds) {
    const related = blocks.filter(
      (b) => b.ownerId === requesterId || b.targetUserId === requesterId
    );
    const joined = connections.filter((c) => c.userId === requesterId);
    if (related.length > 2000 || joined.length > 200)
      throw new PortalError(
        503,
        "These inquiry permissions need a size review."
      );
    contexts.set(requesterId, {
      actorId: requesterId,
      eligible: peopleById.has(requesterId),
      blockedIds: related.flatMap((b) =>
        b.targetUserId
          ? [b.ownerId === requesterId ? b.targetUserId : b.ownerId]
          : []
      ),
      churches: joined.map((c) => c.churchId),
      publishers: new Set(),
      moderators: new Set(),
      volunteers: new Set()
    });
  }
  const keys = new Map<
    string,
    Awaited<ReturnType<typeof exchangeReceiverKey>>
  >();
  const sources = new Map<
    string,
    Awaited<ReturnType<typeof exchangeInquirySource>>
  >();
  const sourceFor: typeof exchangeInquirySource = async (
    _tx,
    listingId,
    requesterId,
    pending = true
  ) => {
    if (_tx !== tx)
      throw new Error("Inquiry access belongs to its read transaction");
    const pair = JSON.stringify([listingId, requesterId, pending]);
    if (sources.has(pair)) return sources.get(pair)!;
    const context = contexts.get(requesterId);
    if (!context?.eligible) return null;
    const listing = await tx.exchangeListing.findFirst({
      where: {
        AND: [
          { id: listingId, inquiriesEnabled: true },
          exchangeReadableWhere(context)
        ]
      }
    });
    if (!listing?.inquiryReceiverId || !listing.inquiryAuthorityKey)
      return null;
    if (!keys.has(listing.id))
      keys.set(
        listing.id,
        await exchangeReceiverKey(tx, listing, listing.inquiryReceiverId)
      );
    const receiverKey = keys.get(listing.id);
    const receiver = peopleById.get(listing.inquiryReceiverId);
    if (
      !receiverKey ||
      receiverKey !== listing.inquiryAuthorityKey ||
      !receiver ||
      requesterId === receiver.id ||
      context.blockedIds?.includes(receiver.id)
    )
      return null;
    const audience = contactAudience(
      receiver.socialPreferences?.contactRequests
    );
    if (
      pending &&
      audience !== "EVERYONE" &&
      !(
        audience === "FOLLOWED" &&
        followed.some(
          (f) => f.followerId === receiver.id && f.followingId === requesterId
        )
      )
    )
      return null;
    const connection = listing.audienceChurchId
      ? connections.find(
          (c) =>
            c.userId === requesterId && c.churchId === listing.audienceChurchId
        )
      : null;
    if (listing.audience === "CHURCH" && !connection) return null;
    // Match the single-source epoch's exact selected shape and property order.
    const epoch = connection
      ? {
          id: connection.id,
          version: connection.version,
          state: connection.state
        }
      : null;
    const result = {
      listing,
      receiver: {
        id: receiver.id,
        name: receiver.name,
        username: receiver.username
      },
      authorityKey: digest([receiverKey, epoch])
    };
    sources.set(pair, result);
    return result;
  };
  return { sourceFor, people: peopleById };
}
