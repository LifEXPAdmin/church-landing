import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchNotifications } from "@/lib/platform/notification-queue";
import { handleNativeCommentLikeRequest } from "@/lib/platform/native-comment-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const POST = async (
  request: Request,
  context: { params: Promise<{ postId: string; commentId: string }> }
) =>
  handleNativeCommentLikeRequest(
    prisma,
    request,
    await context.params,
    (commentId) => {
      after(async () => {
        try {
          await dispatchNotifications(prisma, commentId);
        } catch {
          console.error("comment_like_handoff_incomplete");
        }
      });
    }
  );
export const GET = POST;
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
export const HEAD = POST;
