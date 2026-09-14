import { handleCallback } from "@vercel/queue";
import { prisma } from "@/lib/prisma";
import { advanceCommentFollowers } from "@/lib/platform/comment-followers";
export const runtime = "nodejs";
export const maxDuration = 60;
class PendingFollowers extends Error {}
const handler = handleCallback(
  async (value: unknown) => {
    if (
      !value ||
      typeof value !== "object" ||
      !("id" in value) ||
      Object.keys(value).length !== 1 ||
      typeof value.id !== "string" ||
      !/^[\w-]{1,80}$/.test(value.id)
    )
      return;
    for (let i = 0; i < 3; i++) {
      const result = await advanceCommentFollowers(prisma, value.id);
      if (result.failed) throw Error("Notification handoff needs retry.");
      if (result.done) {
        if (value.id.startsWith("probe-"))
          console.info("comment_follower_queue_probe_completed", {
            applicationWrites: 0
          });
        return;
      }
    }
    throw new PendingFollowers();
  },
  {
    visibilityTimeoutSeconds: 60,
    retry: (error) => ({
      afterSeconds: error instanceof PendingFollowers ? 1 : 60
    })
  }
);
export async function POST(request: Request) {
  return handler(request);
}
