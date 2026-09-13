import type { Prisma } from "@prisma/client";
import { ADULT_POLICY } from "./portal-types";
import type {
  MessageActivity,
  MessageAlertChoices
} from "./adult-message-types";
import { enqueueNotification } from "./notification-outbox";
import { pushAvailable } from "./push-config";
type Tx = Prisma.TransactionClient;
export async function messageAlertChoices(
  tx: Tx,
  ownerId: string
): Promise<MessageAlertChoices> {
  const row = await tx.socialPreferences.findUnique({
    where: { ownerId },
    select: {
      version: true,
      requestAlerts: true,
      messageAlerts: true,
      founderAnnouncements: true
    }
  });
  return {
    version: row?.version ?? 0,
    requests: row?.requestAlerts ?? true,
    founder: row?.founderAnnouncements ?? true,
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
  if (preferences.messages || preferences.founder) {
    const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM "SocialEvent" e
      JOIN "AdultMessage" m ON m."id" = e."messageId" AND m."conversationId" = e."conversationId" AND m."senderId" = e."actorId"
      JOIN "AdultConversation" c ON c."id" = m."conversationId"
      JOIN "PlatformUser" other ON other."id" = m."senderId"
      LEFT JOIN "AdultConversationState" s ON s."conversationId" = c."id" AND s."ownerId" = ${ownerId}
      WHERE e."recipientId" = ${ownerId} AND e."kind" = 'ADULT_MESSAGE_CREATED'
        AND (c."participantAId" = ${ownerId} OR c."participantBId" = ${ownerId})
        AND m."senderId" <> ${ownerId} AND (c."sendingAllowed" = true OR
          (m.kind IN ('FOUNDER_WELCOME','FOUNDER_ANNOUNCEMENT') AND EXISTS (SELECT 1 FROM "FounderWelcome" w WHERE w."conversationId" = c.id
            AND w."recipientId" = ${ownerId} AND w."founderId" = m."senderId" AND w."revokedAt" IS NULL)))
        AND ((m.kind = 'FOUNDER_ANNOUNCEMENT' AND ${preferences.founder ?? true}) OR
             (m.kind <> 'FOUNDER_ANNOUNCEMENT' AND ${preferences.messages}))
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
    channels: { inApp: true, email: false, push: pushAvailable() }
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
  if (
    await tx.socialEvent.findUnique({
      where: { key: event.key },
      select: { id: true }
    })
  )
    return;
  const row = await tx.socialEvent.create({ data: event });
  await enqueueNotification(tx, row);
}
