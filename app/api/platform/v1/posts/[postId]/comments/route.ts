import { prisma } from "@/lib/prisma";
import { handleNativeCommentReadRequest } from "@/lib/platform/native-comment-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ postId: string }> }
) {
  return handleNativeCommentReadRequest(prisma, request, await context.params);
}
