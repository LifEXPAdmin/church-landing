import { prisma } from "@/lib/prisma";
import { handleNativeImageRequest } from "@/lib/platform/native-media-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; variant: string }> }
) {
  return handleNativeImageRequest(prisma, request, await params);
}
