import { prisma } from "@/lib/prisma";
import { handleNativeCommentDeleteRequest } from "@/lib/platform/native-comment-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
type Context = { params: Promise<{ postId: string; commentId: string }> };

export async function POST(request: Request, context: Context) {
  return handleNativeCommentDeleteRequest(
    prisma,
    request,
    await context.params
  );
}

export const GET = POST;
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
export const HEAD = POST;
