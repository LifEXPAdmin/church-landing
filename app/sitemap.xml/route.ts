import { prisma } from "@/lib/prisma";
import { publicSitemapResponse } from "@/lib/platform/public-sitemap";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request) {
  return publicSitemapResponse(prisma, request);
}
