import { prisma } from "@/lib/prisma";
import { handleImageMaintenance } from "@/lib/platform/media-maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request: Request) {
  return handleImageMaintenance(prisma, request);
}
