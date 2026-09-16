import { advanceExchangeHandoff } from "./exchange-handoff-queue";
import type { PrismaClient } from "@prisma/client";
import { advanceCommentFollowers } from "./comment-followers";
import { advanceNotificationFanout } from "./notification-fanout";
import { advanceScheduledPost } from "./scheduled-publication";
import { NOTIFICATION_WORK_TOPIC } from "./notification-work-message";

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
 * Keep the existing queue/consumer identity and exact legacy comment payload;
 * sharing a function does not merge jobs, consent or authorization owners.
 */
export async function consumeNotificationWork(
  db: PrismaClient,
  topic: string,
  value: unknown
) {
  if (
    topic !== NOTIFICATION_WORK_TOPIC ||
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !/^[\w-]{1,80}$/.test(value.id)
  )
    return;
  const kind = "kind" in value ? value.kind : "comment";
  if (kind === "handoff") {
    if (Object.keys(value).length !== 3 || !("version" in value) || typeof value.version !== "number" ||
      !Number.isSafeInteger(value.version) || value.version < 1) return;
    const result = await advanceExchangeHandoff(db, value.id, value.version);
    if (result.failed) throw Error("Exchange handoff work needs retry.");
    if (result.retryAfterSeconds) throw new RetryNotificationWork(Math.min(604799, result.retryAfterSeconds));
    if (value.id.startsWith("probe-")) console.info("exchange_handoff_queue_probe_completed", { applicationWrites: 0 });
    return;
  }
  if (kind === "scheduled") {
    if (
      Object.keys(value).length !== 3 ||
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
  if (
    kind === "comment"
      ? Object.keys(value).length !== 1
      : kind !== "activity" || Object.keys(value).length !== 2
  )
    return;
  const advance =
    kind === "comment" ? advanceCommentFollowers : advanceNotificationFanout;
  for (let i = 0; i < 3; i++) {
    const result = await advance(db, value.id);
    if (result.failed) throw Error("Notification handoff needs retry.");
    if (result.done) {
      if (value.id.startsWith("probe-"))
        console.info(
          kind === "comment"
            ? "comment_follower_queue_probe_completed"
            : "activity_fanout_queue_probe_completed",
          { applicationWrites: 0 }
        );
      return;
    }
  }
  throw new RetryNotificationWork(1);
}
