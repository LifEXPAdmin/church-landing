import type { Prisma } from "@prisma/client";
import { ADULT_POLICY } from "./portal-types";
import type {
  MessageActivity,
  MessageAlertChoices
} from "./adult-message-types";
type Tx = Prisma.TransactionClient;
export async function messageAlertChoices(
  tx: Tx,
  ownerId: string
): Promise<MessageAlertChoices> {
  const row = await tx.socialPreferences.findUnique({
    where: { ownerId },
    select: { version: true, requestAlerts: true, messageAlerts: true }
  });
  return {
    version: row?.version ?? 0,
    requests: row?.requestAlerts ?? true,
    messages: row?.messageAlerts ?? true
  };
}
export async function messageActivityIn(
  tx: Tx,
  ownerId: string
): Promise<MessageActivity> {
  const preferences = await messageAlertChoices(tx, ownerId);
  // Request badges describe pending operational decisions, even if optional
  // alerts are muted. Event IDs remain durable; all visibility comes from source.
  const requests = await tx.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) AS count FROM "SocialEvent" e
    JOIN "AdultContactRequest" r ON r."id" = e."requestId" AND r."senderId" = e."actorId" AND r."recipientId" = e."recipientId"
    JOIN "PlatformUser" other ON other."id" = r."senderId"
    JOIN "SocialPreferences" p ON p."ownerId" = r."recipientId"
    WHERE e."recipientId" = ${ownerId} AND e."kind" = 'ADULT_REQUEST_CREATED'
      AND r."status" = 'PENDING' AND r."expiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      AND other."emailVerifiedAt" IS NOT NULL AND other."adultAcknowledgedAt" IS NOT NULL
      AND other."adultPolicyVersion" = ${ADULT_POLICY} AND other."suspendedAt" IS NULL AND other."deactivatedAt" IS NULL
      AND (p."contactRequests" = 'EVERYONE' OR (p."contactRequests" = 'FOLLOWED' AND EXISTS (
        SELECT 1 FROM "PlatformFollow" f WHERE f."followerId" = ${ownerId} AND f."followingId" = other."id")))
      AND NOT EXISTS (SELECT 1 FROM "SocialRelationship" b WHERE b."blocked" = true AND
        ((b."ownerId" = ${ownerId} AND b."targetUserId" = other."id") OR (b."ownerId" = other."id" AND b."targetUserId" = ${ownerId})))`;
  const pendingRequests = Number(requests[0].count);
  let messageAlerts = 0;
  if (preferences.messages) {
    const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM "SocialEvent" e
      JOIN "AdultMessage" m ON m."id" = e."messageId" AND m."conversationId" = e."conversationId" AND m."senderId" = e."actorId"
      JOIN "AdultConversation" c ON c."id" = m."conversationId"
      JOIN "PlatformUser" other ON other."id" = m."senderId"
      LEFT JOIN "AdultConversationState" s ON s."conversationId" = c."id" AND s."ownerId" = ${ownerId}
      WHERE e."recipientId" = ${ownerId} AND e."kind" = 'ADULT_MESSAGE_CREATED'
        AND (c."participantAId" = ${ownerId} OR c."participantBId" = ${ownerId})
        AND m."senderId" <> ${ownerId} AND c."sendingAllowed" = true
        AND COALESCE(s."muted", false) = false
        AND m."sequence" > GREATEST(COALESCE(s."readThrough", 0), COALESCE(s."hiddenThrough", 0))
        AND other."emailVerifiedAt" IS NOT NULL AND other."adultAcknowledgedAt" IS NOT NULL
        AND other."adultPolicyVersion" = ${ADULT_POLICY} AND other."suspendedAt" IS NULL AND other."deactivatedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "SocialRelationship" b WHERE b."blocked" = true AND
          ((b."ownerId" = ${ownerId} AND b."targetUserId" = other."id") OR (b."ownerId" = other."id" AND b."targetUserId" = ${ownerId})))`;
    messageAlerts = Number(rows[0].count);
  }
  return {
    pendingRequests,
    requestAlerts: preferences.requests ? pendingRequests : 0,
    messageAlerts,
    preferences,
    channels: { inApp: true, email: false, push: false }
  };
}

export async function recordMessageActivity(
  tx: Tx,
  event: {
    key: string;
    kind:
      | "ADULT_REQUEST_CREATED"
      | "ADULT_REQUEST_ACCEPTED"
      | "ADULT_MESSAGE_CREATED";
    actorId: string;
    recipientId: string;
    requestId?: string;
    conversationId?: string;
    messageId?: string;
    createdAt: Date;
  }
) {
  // An event is an atomic source intent, not a delivery attempt or body copy.
  await tx.socialEvent.upsert({
    where: { key: event.key },
    create: event,
    update: {}
  });
}
