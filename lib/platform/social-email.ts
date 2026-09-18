import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SocialEvent } from "@prisma/client";
import { accountConfig, type AccountConfig } from "./account-config";
import { sendResendEmail } from "./resend-delivery";

export const socialEmailCategories = ["replies", "reactions"] as const;
export type SocialEmailCategory = (typeof socialEmailCategories)[number];
export function socialEmailAvailable() {
  if (process.env.SOCIAL_EMAIL_ENABLED !== "true") return false;
  try {
    return accountConfig().delivery !== "disabled";
  } catch {
    return false;
  }
}
// Only these canonical intents have an optional email contract. A category
// string alone must never authorize a new sender (including prayer activity).
export function socialEmailCategory(
  event: Pick<SocialEvent, "kind" | "notificationCategory">
): SocialEmailCategory | null {
  if (
    event.kind === "COMMENT_ACTIVITY" &&
    event.notificationCategory === "replies"
  )
    return "replies";
  if (
    ["POST_REACTION", "COMMENT_REACTION"].includes(event.kind) &&
    event.notificationCategory === "reactions"
  )
    return "reactions";
  return null;
}
export type SocialEmailIntent = { deliveryId: string; email: string };
export type SocialEmailTransport = (
  intent: SocialEmailIntent
) => Promise<number>;
export function socialEmailTransport(
  config: AccountConfig,
  send: typeof fetch = fetch
): SocialEmailTransport {
  return async (intent) => {
    if (!/^[\w-]{1,100}$/.test(intent.deliveryId)) return 400;
    const href = new URL(
      `/platform/notifications/${intent.deliveryId}`,
      config.origin
    ).toString();
    const settings = new URL(
      "/platform/settings/notifications/availability",
      config.origin
    ).toString();
    const subject = "New activity on God’s Churches";
    const text = `You have new activity in a category you chose to receive by email.\n\nOpen the activity: ${href}\n\nChange your email choices: ${settings}\n\nSign in to your own account to open this activity. This email does not include names or contents. Access may have changed since it was sent.`;
    // No source, author or mutable preference text enters the template. The
    // recipient credential version is checked before every attempt. Template
    // v1 and the delivery ID remain identical within Resend's idempotency window.
    const body = JSON.stringify({
      from: `God’s Churches <${config.resend?.from ?? "test@example.invalid"}>`,
      to: [intent.email],
      subject,
      text,
      headers: { "Auto-Submitted": "auto-generated" },
      tags: [{ name: "category", value: "selected_social_update" }]
    });
    if (config.delivery === "test-sink" && config.sinkDirectory) {
      await mkdir(config.sinkDirectory, { recursive: true, mode: 0o700 });
      const file = join(
        config.sinkDirectory,
        `social-${intent.deliveryId}.json`
      );
      try {
        await writeFile(file, body, { mode: 0o600, flag: "wx" });
      } catch (error) {
        if (
          !(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "EEXIST"
          )
        )
          throw error;
        if ((await readFile(file, "utf8")) !== body) return 409;
      }
      return 200;
    }
    if (config.delivery !== "resend" || !config.resend) return 503;
    return sendResendEmail(
      config.resend.apiKey,
      body,
      `social/v1/${intent.deliveryId}`,
      send
    );
  };
}
export const sendSocialEmail: SocialEmailTransport = (intent) =>
  socialEmailTransport(accountConfig())(intent);
