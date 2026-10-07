import { prisma } from "@/lib/prisma";
import { handleNativeSessionRequest } from "@/lib/platform/native-session-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = (request: Request) =>
  handleNativeSessionRequest(prisma, request, "activity");
export const POST = (request: Request) =>
  handleNativeSessionRequest(prisma, request, "activity");
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
export const HEAD = POST;
