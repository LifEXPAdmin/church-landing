import { prisma } from "@/lib/prisma";
import { handleParticipationRequest } from "@/lib/platform/post-participation-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return handleParticipationRequest(prisma, request);
}
export function POST(request: Request) {
  return handleParticipationRequest(prisma, request);
}
