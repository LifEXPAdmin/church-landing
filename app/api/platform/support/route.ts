import { prisma } from "@/lib/prisma";
import { handleSupportRequest } from "@/lib/platform/support-boundary";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (request: Request) => handleSupportRequest(prisma, request);
export const POST = (request: Request) => handleSupportRequest(prisma, request);
