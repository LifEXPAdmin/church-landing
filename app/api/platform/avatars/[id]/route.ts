import { prisma } from "@/lib/prisma";
import { handleAvatarDelivery } from "@/lib/platform/media-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleAvatarDelivery(prisma, request, (await params).id);
}
