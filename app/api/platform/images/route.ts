import { prisma } from "@/lib/prisma";
import { handleImageRequest } from "@/lib/platform/media-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function GET(request: Request) {
  return handleImageRequest(prisma, request);
}
export function POST(request: Request) {
  return handleImageRequest(prisma, request);
}
export function DELETE(request: Request) {
  return handleImageRequest(prisma, request);
}
