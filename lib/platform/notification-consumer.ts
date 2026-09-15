import type { PrismaClient } from "@prisma/client";
import {
  advanceCommentFollowers,
  COMMENT_FOLLOWER_TOPIC
} from "./comment-followers";
import {
  advanceNotificationFanout,
  NOTIFICATION_FANOUT_TOPIC
} from "./notification-fanout";
import {
  advanceScheduledPost,
  SCHEDULED_PUBLICATION_TOPIC
} from "./scheduled-publication";

class RetryNotificationWork extends Error {
  readonly seconds: number;
  constructor(seconds: number) {
    super("Notification work needs another queue delivery.");
    this.seconds = seconds;
  }
}

export function retryNotificationWork(error: unknown) {
  return {
    afterSeconds: error instanceof RetryNotificationWork ? error.seconds : 60
  };
}

/** Called only inside the SDK callback, using its verified topic metadata.
 * Keep the existing comment consumer identity and domain-specific payloads;
 * sharing a function does not merge jobs, consent or authorization owners.
 */
export async function consumeNotificationWork(
  db: PrismaClient,
  topic: string,
  value: unknown
) {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !/^[\w-]{1,80}$/.test(value.id)
  )
    return;
  if (topic === SCHEDULED_PUBLICATION_TOPIC) {
    if (
      Object.keys(value).length !== 2 ||
      !("version" in value) ||
      typeof value.version !== "number" ||
      !Number.isSafeInteger(value.version) ||
      value.version < 1
    )
      return;
    const result = await advanceScheduledPost(db, value.id, value.version);
    if (result.retryAfterSeconds)
      throw new RetryNotificationWork(Math.min(3600, result.retryAfterSeconds));
    if (result.failed)
      throw Error("Publication notification handoff needs retry.");
    if (value.id.startsWith("probe-"))
      console.info("scheduled_publication_queue_probe_completed", {
        applicationWrites: 0
      });
    return;
  }
  if (Object.keys(value).length !== 1) return;
  const advance =
    topic === COMMENT_FOLLOWER_TOPIC
      ? advanceCommentFollowers
      : topic === NOTIFICATION_FANOUT_TOPIC
        ? advanceNotificationFanout
        : null;
  if (!advance) return;
  for (let i = 0; i < 3; i++) {
    const result = await advance(db, value.id);
    if (result.failed) throw Error("Notification handoff needs retry.");
    if (result.done) {
      if (value.id.startsWith("probe-"))
        console.info(
          topic === COMMENT_FOLLOWER_TOPIC
            ? "comment_follower_queue_probe_completed"
            : "activity_fanout_queue_probe_completed",
          { applicationWrites: 0 }
        );
      return;
    }
  }
  throw new RetryNotificationWork(1);
}
