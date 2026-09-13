import { handleCallback } from "@vercel/queue";
import { prisma } from "@/lib/prisma";
import { deliverFounderWelcome } from "@/lib/platform/founder-welcome";
import { dispatchNotifications } from "@/lib/platform/notification-queue";
export const runtime = "nodejs";
export const maxDuration = 60;
const handleWelcome = handleCallback(
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
    const result = await deliverFounderWelcome(prisma, value.id);
    if (result.status === "unavailable")
      throw Error("Founder welcome is waiting for authorized operations.");
    if (
      "messageId" in result &&
      result.messageId &&
      (await dispatchNotifications(prisma, result.messageId)).failed
    )
      throw Error("Welcome saved; notification handoff needs retry.");
  },
  { visibilityTimeoutSeconds: 60, retry: () => ({ afterSeconds: 300 }) }
);
export async function POST(request: Request) {
  return handleWelcome(request);
}
