import { handleCspReport } from "@/lib/security/csp-report";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export function POST(request: Request) {
  return handleCspReport(prisma, request);
}
