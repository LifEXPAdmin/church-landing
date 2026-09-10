import { handleGoogleCallback } from "@/lib/platform/google-boundary";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: Request) {
  return handleGoogleCallback(prisma, request);
}
