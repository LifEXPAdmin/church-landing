import { prisma } from "@/lib/prisma";
import { handleRetentionMaintenance } from "@/lib/platform/retention-maintenance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function GET(request: Request) {
  return handleRetentionMaintenance(prisma, request);
}
