import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchNotifications } from "@/lib/platform/notification-queue";
import { handleNativeReactionRequest } from "@/lib/platform/native-reaction-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = async (
  request: Request,
  context: { params: Promise<{ postId: string }> }
) =>
  handleNativeReactionRequest(
    prisma,
    request,
    "like",
    await context.params,
    (postId) => {
      after(async () => {
        try {
          await dispatchNotifications(prisma, postId);
        } catch {
          console.error("reaction_handoff_incomplete");
        }
      });
    }
  );
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
export const HEAD = GET;
