import { prisma } from "@/lib/prisma";
import { handleOperationalHealth } from "@/lib/platform/operational-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
export function GET(request: Request) {
  return handleOperationalHealth(prisma, request);
}
