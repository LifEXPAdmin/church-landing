import { dispatchNotifications } from "@/lib/platform/notification-queue";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "@/lib/platform/social-boundary";
import { PortalError } from "@/lib/platform/portal-policy";
import { prayerCommand } from "@/lib/platform/prayer-commands";
import {
  readPrayerTarget,
  readPrayerUpdates,
  readSavedPrayers
} from "@/lib/platform/prayer-reads";
import {
  advanceCommentFollowers,
  dispatchCommentFollowers
} from "@/lib/platform/comment-followers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    if (
      [...q.keys()].some(
        (key) => !["view", "postId", "commentId", "after"].includes(key)
      )
    )
      throw new PortalError(400, "Choose a supported prayer view.");
    const view = q.get("view") ?? "target";
    if (!["target", "updates", "saved"].includes(view))
      throw new PortalError(400, "Choose a supported prayer view.");
    const token = requestSessionToken(request);
    const input = {
      postId: q.get("postId"),
      commentId: q.get("commentId"),
      after: q.get("after")
    };
    const result =
      view === "saved"
        ? await readSavedPrayers(prisma, token, input.after)
        : view === "updates"
          ? await readPrayerUpdates(prisma, token, input)
          : await readPrayerTarget(prisma, token, input);
    const expected = request.headers.get("x-expected-account");
    if (expected && result.ownerId !== expected)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload your private prayer choices."
      );
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    return socialError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { input, token } = await socialWriteInput(prisma, request, "prayers");
    const result = await prayerCommand(prisma, token, input);
    if (input.operation === "update")
      after(async () => {
        try {
          // A small first page from each subscription stream; native continuation
          // handles the rest without asking the author to resend a committed update.
          for (let page = 0; page < 2; page++) {
            if ((await advanceCommentFollowers(prisma, result.id)).done) return;
          }
          await dispatchCommentFollowers(prisma, result.id);
        } catch {
          console.error("prayer_update_handoff_incomplete");
        }
      });
    if (input.operation === "acknowledge")
      after(async () => {
        try {
          await dispatchNotifications(prisma, result.id);
        } catch {
          console.error("prayer_acknowledgment_handoff_incomplete");
        }
      });
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    return socialError(error);
  }
}
