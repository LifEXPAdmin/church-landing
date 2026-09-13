import { handleCallback } from "@vercel/queue";
import { prisma } from "@/lib/prisma";
import { deliverAnnouncementRecipient } from "@/lib/platform/founder-announcements";
import { dispatchNotifications } from "@/lib/platform/notification-queue";
export const runtime = "nodejs";
export const maxDuration = 60;
class PendingAnnouncement extends Error {
  constructor(readonly delay: number) {
    super("Announcement delivery has pending work.");
  }
}
const handleAnnouncement = handleCallback(
  async (value: unknown) => {
    if (
      !value ||
      typeof value !== "object" ||
      !("id" in value) ||
      Object.keys(value).length !== 1 ||
      typeof value.id !== "string" ||
      !/^[\w-]{1,80}$/.test(value.id)
    )
      return;
    for (let i = 0; i < 5; i++) {
      const result = await deliverAnnouncementRecipient(prisma, value.id);
      if (
        result.messageId &&
        (await dispatchNotifications(prisma, result.messageId)).failed
      )
        throw new PendingAnnouncement(60);
      if (result.done) return;
      if (result.paused) throw new PendingAnnouncement(300);
    }
    throw new PendingAnnouncement(1);
  },
  {
    visibilityTimeoutSeconds: 60,
    retry: (error) => ({
      afterSeconds: error instanceof PendingAnnouncement ? error.delay : 60
    })
  }
);
export async function POST(request: Request) {
  return handleAnnouncement(request);
}
