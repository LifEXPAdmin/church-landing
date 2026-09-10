import { prisma } from "@/lib/prisma";
import { handlePostRequest } from "@/lib/platform/post-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return handlePostRequest(prisma, request);
}
export function POST(request: Request) {
  return handlePostRequest(prisma, request);
}
