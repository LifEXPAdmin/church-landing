import { dispatchNotificationFanout } from "@/lib/platform/notification-fanout";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAdminRequest } from "@/lib/platform/admin-boundary";
import { dispatchNotifications } from "@/lib/platform/notification-queue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = (request: Request) => handleAdminRequest(prisma, request);
export const POST = (request: Request) =>
  handleAdminRequest(prisma, request, (id) =>
    after(async () => {
      await dispatchNotifications(prisma, id);
      await dispatchNotificationFanout(prisma);
    })
  );
