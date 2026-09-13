import { handleCallback } from "@vercel/queue";
import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/platform/notification-outbox";
import { sendWebPush } from "@/lib/platform/push-provider";
export const runtime = "nodejs";
export const maxDuration = 60;
class DeferredNotification extends Error {
  constructor(readonly afterSeconds: number) {
    super("Notification is waiting for its delivery window.");
  }
}
const handleNotification = handleCallback(
  async (message: unknown) => {
    if (
      !message ||
      typeof message !== "object" ||
      !("id" in message) ||
      Object.keys(message).length !== 1 ||
      typeof message.id !== "string" ||
      !/^[\w-]{1,80}$/.test(message.id)
    )
      return;
    const result = await deliverNotification(prisma, message.id, sendWebPush);
    if (!result.done) throw new DeferredNotification(result.afterSeconds);
  },
  {
    visibilityTimeoutSeconds: 60,
    retry: (error) => ({
      afterSeconds:
        error instanceof DeferredNotification ? error.afterSeconds : 60
    })
  }
);

export async function POST(request: Request) {
  return handleNotification(request);
}
