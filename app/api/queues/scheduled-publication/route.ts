import { handleCallback } from "@vercel/queue";
import { prisma } from "@/lib/prisma";
import { advanceScheduledPost } from "@/lib/platform/scheduled-publication";
export const runtime = "nodejs";
export const maxDuration = 60;
class EarlyPublication extends Error {
  constructor(readonly seconds: number) {
    super("Publication is not due.");
  }
}
const handler = handleCallback(
  async (value: unknown) => {
    if (
      !value ||
      typeof value !== "object" ||
      Object.keys(value).length !== 2 ||
      !("id" in value) ||
      !("version" in value) ||
      typeof value.id !== "string" ||
      !/^[\w-]{1,80}$/.test(value.id) ||
      typeof value.version !== "number" ||
      !Number.isSafeInteger(value.version) ||
      value.version < 1
    )
      return;
    const result = await advanceScheduledPost(prisma, value.id, value.version);
    if (result.retryAfterSeconds)
      throw new EarlyPublication(result.retryAfterSeconds);
    if (result.failed)
      throw Error("Publication notification handoff needs retry.");
    if (value.id.startsWith("probe-"))
      console.info("scheduled_publication_queue_probe_completed", {
        applicationWrites: 0
      });
  },
  {
    visibilityTimeoutSeconds: 60,
    retry: (error) => ({
      afterSeconds:
        error instanceof EarlyPublication ? Math.min(3600, error.seconds) : 60
    })
  }
);
export async function POST(request: Request) {
  return handler(request);
}
