import { prisma } from "@/lib/prisma";
import { handleAccountSessionRequest } from "@/lib/platform/account-session-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = (request: Request) =>
  handleAccountSessionRequest(prisma, request);
export const POST = (request: Request) =>
  handleAccountSessionRequest(prisma, request);
