import { prisma } from "@/lib/prisma";
import { handleNotificationMaintenance } from "@/lib/platform/notification-maintenance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = (request: Request) =>
  handleNotificationMaintenance(prisma, request);
