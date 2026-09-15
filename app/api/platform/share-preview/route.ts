import { prisma } from "@/lib/prisma";
import { sharePreviewResponse } from "@/lib/platform/share-preview-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return sharePreviewResponse(prisma, request);
}
