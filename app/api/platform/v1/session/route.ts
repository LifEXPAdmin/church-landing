import { prisma } from "@/lib/prisma";
import { handleNativeSessionRequest } from "@/lib/platform/native-session-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = (request: Request) =>
  handleNativeSessionRequest(prisma, request, "session");
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
export const HEAD = GET;
