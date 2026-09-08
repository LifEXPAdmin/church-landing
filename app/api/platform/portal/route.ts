import { prisma } from "@/lib/prisma";
import { handlePortalRequest } from "@/lib/platform/portal-boundary";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (request: Request) => handlePortalRequest(prisma, request);
export const POST = (request: Request) => handlePortalRequest(prisma, request);
