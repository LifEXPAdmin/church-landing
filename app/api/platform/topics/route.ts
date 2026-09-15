import { prisma } from "@/lib/prisma";
import { handleTopicRequest } from "@/lib/platform/topic-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleTopicRequest(prisma, request);
export const POST = GET;
