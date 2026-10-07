import { prisma } from "@/lib/prisma";
import { handleNativeBookmarkRequest } from "@/lib/platform/native-bookmark-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = async (
  request: Request,
  context: { params: Promise<{ postId: string }> }
) =>
  handleNativeBookmarkRequest(
    prisma,
    request,
    "bookmarkStatus",
    await context.params
  );
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
export const HEAD = GET;
