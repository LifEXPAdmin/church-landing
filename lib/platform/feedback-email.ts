import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { accountConfig, type AccountConfig } from "./account-config";
import { feedbackFollowupEnabled } from "./feedback-followup-policy";
import { sendResendEmail } from "./resend-delivery";

export function feedbackEmailAvailable() {
  if (!feedbackFollowupEnabled()) return false;
  try {
    return accountConfig().delivery !== "disabled";
  } catch {
    return false;
  }
}
export type FeedbackEmailIntent = {
  deliveryId: string;
  email: string;
  kind: "FEEDBACK_CASE" | "FEEDBACK_IDEA";
  sourceId: string;
};
export type FeedbackEmailTransport = (
  intent: FeedbackEmailIntent
) => Promise<number>;
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
export function feedbackEmailTransport(
  config: AccountConfig,
  send: typeof fetch = fetch
): FeedbackEmailTransport {
  return async (intent) => {
    if (
      !/^[\w-]{1,100}$/.test(intent.sourceId) ||
      !/^[\w-]{1,100}$/.test(intent.deliveryId) ||
      !["FEEDBACK_CASE", "FEEDBACK_IDEA"].includes(intent.kind)
    )
      return 400;
    const href = new URL(
      `/platform/feedback/${intent.kind === "FEEDBACK_CASE" ? "cases" : "ideas"}/${intent.sourceId}`,
      config.origin
    ).toString();
    const settings = new URL(
      "/platform/settings/notifications/availability",
      config.origin
    ).toString();
    const subject = "An update you requested on God’s Churches";
    const text = `There is an update to feedback or an idea you chose to follow.\n\nOpen the update: ${href}\n\nYou can stop these updates using the follow-up choices on that page, or turn off all feedback email in notification settings: ${settings}\n\nSign in to your own account to read private feedback. This email does not include its contents.`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:Arial,sans-serif;line-height:1.6;padding:24px"><main style="max-width:560px;margin:auto"><h1 style="font-size:24px">${escapeHtml(subject)}</h1><p>There is an update to feedback or an idea you chose to follow.</p><p><a href="${escapeHtml(href)}">Open the update and its follow-up choices</a></p><p>You can stop updates on that page, or <a href="${escapeHtml(settings)}">turn off all feedback email in notification settings</a>.</p><p>Sign in to your own account to read private feedback. This email does not include its contents.</p></main></body></html>`;
    // Template v1 and the original source ID are stable across every retry.
    const body = JSON.stringify({
      from: `God’s Churches <${config.resend?.from ?? "test@example.invalid"}>`,
      to: [intent.email],
      subject,
      text,
      html,
      headers: { "Auto-Submitted": "auto-generated" },
      tags: [{ name: "category", value: "selected_feedback_update" }]
    });
    if (config.delivery === "test-sink" && config.sinkDirectory) {
      await mkdir(config.sinkDirectory, { recursive: true, mode: 0o700 });
      const file = join(
        config.sinkDirectory,
        `feedback-${intent.deliveryId}.json`
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
      `feedback/v1/${intent.deliveryId}`,
      send
    );
  };
}
export const sendFeedbackEmail: FeedbackEmailTransport = (intent) =>
  feedbackEmailTransport(accountConfig())(intent);
