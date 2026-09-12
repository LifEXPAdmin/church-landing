import { prisma } from "@/lib/prisma";
import { handleRepostRequest } from "@/lib/platform/repost-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleRepostRequest(prisma, request);
export const POST = (request: Request) => handleRepostRequest(prisma, request);
