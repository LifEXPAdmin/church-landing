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
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
export const HEAD = GET;
