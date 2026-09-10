import { handleGoogleRequest } from "@/lib/platform/google-boundary";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request: Request) {
  return handleGoogleRequest(prisma, request);
}
