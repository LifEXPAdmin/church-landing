import { handleCallback } from "@vercel/queue";
import { prisma } from "@/lib/prisma";
import {
  consumeNotificationWork,
  retryNotificationWork
} from "@/lib/platform/notification-consumer";
export const runtime = "nodejs";
export const maxDuration = 60;
const handler = handleCallback(
  (value: unknown, metadata) =>
    consumeNotificationWork(prisma, metadata.topicName, value),
  {
    visibilityTimeoutSeconds: 60,
    retry: retryNotificationWork
  }
);
export async function POST(request: Request) {
  return handler(request);
}
