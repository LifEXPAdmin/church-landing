import { createECDH, randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  type PortalActor
} from "./seed-portal";
import { createSessionToken } from "../lib/platform/auth";
import { pushSubscriptionCommand } from "../lib/platform/push-subscriptions";
import { adultMessageCommand } from "../lib/platform/adult-messages";

export async function seedNotificationDevice(
  db: PrismaClient,
  actor: PortalActor
) {
  await assertPortalTestDatabase(db);
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  return pushSubscriptionCommand(db, actor.token, {
    operation: "subscribe",
    mutationId: randomUUID(),
    ownerId: actor.id,
    binding: createSessionToken(),
    label: "Fictional phone",
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/" + randomUUID(),
      keys: {
        p256dh: pair.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url")
      }
    }
  });
}

export async function seedNotificationPair(db: PrismaClient) {
  const a = await createPortalActor(db, "pushsend"),
    b = await createPortalActor(db, "pushread");
  const ids = [a.id, b.id].sort();
  const conversation = await db.adultConversation.create({
    data: {
      participantAId: ids[0],
      participantBId: ids[1],
      sendingAllowed: true
    }
  });
  const subscription = await seedNotificationDevice(db, b);
  await db.socialPreferences.create({
    data: { ownerId: b.id, messageAlerts: false, pushCategories: ["messages"] }
  });
  const input = {
    operation: "send",
    mutationId: randomUUID(),
    conversationId: conversation.id,
    expectedVersion: conversation.version,
    content: "Private canonical fixture body must never enter push"
  };
  const sent = await adultMessageCommand(db, a.token, input);
  const delivery = await db.notificationDelivery.findFirstOrThrow({
    where: { event: { messageId: sent.id }, ownerId: b.id }
  });
  return { a, b, conversation, subscription, input, sent, delivery };
}
