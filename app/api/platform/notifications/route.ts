import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleNotificationRequest } from "@/lib/platform/notification-boundary";
import { dispatchNotifications } from "@/lib/platform/notification-queue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handleNotificationRequest(prisma, request);
export const POST = (request: Request) =>
  handleNotificationRequest(prisma, request, (sourceId) =>
    after(async () => {
      await dispatchNotifications(prisma, sourceId);
    })
  );
