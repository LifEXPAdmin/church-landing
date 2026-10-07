import { prisma } from "@/lib/prisma";
import { handleNativeReactionRequest } from "@/lib/platform/native-reaction-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = (request: Request) =>
  handleNativeReactionRequest(prisma, request, "reactionPreferences");
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
export const HEAD = GET;
