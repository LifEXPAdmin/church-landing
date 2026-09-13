import { prisma } from "@/lib/prisma";
import { handleActivityRequest } from "@/lib/platform/activity-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleActivityRequest(prisma, request);
export const POST = (request: Request) =>
  handleActivityRequest(prisma, request);
