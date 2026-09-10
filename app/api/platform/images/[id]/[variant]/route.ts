import { prisma } from "@/lib/prisma";
import { handleImageDelivery } from "@/lib/platform/media-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; variant: string }> }
) {
  const { id, variant } = await params;
  return handleImageDelivery(prisma, request, id, variant);
}
