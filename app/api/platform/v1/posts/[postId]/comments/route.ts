import { prisma } from "@/lib/prisma";
import { after } from "next/server";
import {
  advanceCommentFollowers,
  dispatchCommentFollowers
} from "@/lib/platform/comment-followers";
import {
  handleNativeCommentReadRequest,
  handleNativeCommentCreateRequest
} from "@/lib/platform/native-comment-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(
  request: Request,
  context: { params: Promise<{ postId: string }> }
) {
  return handleNativeCommentReadRequest(prisma, request, await context.params);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> }
) {
  return handleNativeCommentCreateRequest(
    prisma,
    request,
    await context.params,
    (commentId) => {
      after(async () => {
        try {
          const advanced = await advanceCommentFollowers(prisma, commentId);
          if (!advanced.done) await dispatchCommentFollowers(prisma, commentId);
        } catch {
          // The canonical comment/outbox/continuation already committed.
          console.error("comment_follower_handoff_incomplete");
        }
      });
    }
  );
}
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
export const HEAD = POST;
