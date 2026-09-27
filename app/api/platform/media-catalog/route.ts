import { prisma } from "@/lib/prisma";
import { handleMediaCatalogRequest } from "@/lib/platform/media-catalog-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handleMediaCatalogRequest(prisma, request);
export const POST = GET;
