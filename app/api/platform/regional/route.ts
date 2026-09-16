import { prisma } from "@/lib/prisma";
import { handleRegionalRequest } from "@/lib/platform/regional-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
export const GET = (request: Request) => handleRegionalRequest(prisma, request);
export const POST = (request: Request) =>
  handleRegionalRequest(prisma, request);
