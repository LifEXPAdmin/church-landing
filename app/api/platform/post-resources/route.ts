import { prisma } from "@/lib/prisma";
import { handlePostResourceRequest } from "@/lib/platform/post-resource-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handlePostResourceRequest(prisma, request);
