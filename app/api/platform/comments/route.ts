import { prisma } from "@/lib/prisma";
import { after } from "next/server";
import { dispatchNotifications } from "@/lib/platform/notification-queue";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  socialWriteInput,
  socialError,
  socialHeaders
} from "@/lib/platform/social-boundary";
import { commentCommand } from "@/lib/platform/comment-commands";
import { readComments, readCommentDrafts } from "@/lib/platform/comment-reads";
import { protectReportedWithdrawal } from "@/lib/platform/retention-controls";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams,
      token = requestSessionToken(request);
    const result =
      q.get("view") === "drafts"
        ? await readCommentDrafts(prisma, token, {
            id: q.get("draftId"),
            postId: q.get("postId"),
            replyToId: q.get("replyToId"),
            after: q.get("after")
          })
        : await readComments(prisma, token, {
            postId: q.get("postId"),
            view: q.get("view") ?? "roots",
            sort: q.get("sort") ?? "oldest",
            rootId: q.get("rootId"),
            commentId: q.get("commentId"),
            q: q.get("q"),
            after: q.get("after")
          });
    return Response.json(result, { headers: socialHeaders });
  } catch (e) {
    return socialError(e);
  }
}
export async function POST(request: Request) {
  try {
    const { input, token } = await socialWriteInput(
      prisma,
      request,
      "comments"
    );
    const result = await commentCommand(prisma, token, input);
    if (
      input.operation === "delete" &&
      !(await protectReportedWithdrawal(prisma, "COMMENT", result.id))
    )
      return Response.json(
        {
          ...result,
          message:
            "Your comment removal is saved. Backup recovery protection is pending and will be retried automatically."
        },
        { status: 202, headers: socialHeaders }
      );
    if (input.operation === "create" || input.operation === "edit")
      after(async () => {
        await dispatchNotifications(prisma, result.id);
      });
    return Response.json(result, {
      headers: socialHeaders
    });
  } catch (e) {
    return socialError(e);
  }
}
