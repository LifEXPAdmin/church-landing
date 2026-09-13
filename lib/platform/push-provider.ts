import webpush from "web-push";
import { createHash } from "node:crypto";
import { pushServerConfig } from "./push-config";
import type { PushTransport } from "./notification-outbox";
export const sendWebPush: PushTransport = async (
  subscription,
  payload,
  ttl
) => {
  const vapidDetails = pushServerConfig();
  if (!vapidDetails) return 503;
  try {
    const result = await webpush.sendNotification(
      subscription,
      JSON.stringify(payload),
      {
        vapidDetails,
        TTL: ttl,
        timeout: 10000,
        urgency: "normal",
        topic: createHash("sha256")
          .update(payload.tag)
          .digest("base64url")
          .slice(0, 32)
      }
    );
    return result.statusCode;
  } catch (error) {
    // Never log/persist WebPush errors: they can include the recipient endpoint.
    return error &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
      ? error.statusCode
      : 0;
  }
};
