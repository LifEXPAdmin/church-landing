import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { AccountGrantPurpose } from "@prisma/client";
import { accountConfig, type AccountConfig } from "./account-config";
export type AccountDeliveryPurpose = AccountGrantPurpose | "CHANGE_EMAIL";
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]!
  );

// Dependency injection is code-only for isolated tests; no configurable vendor URL.
export function accountGrantDelivery(
  config: AccountConfig,
  send: typeof fetch = fetch
) {
  return async (
    email: string,
    purpose: AccountDeliveryPurpose,
    token: string
  ) => {
    const change = purpose === "CHANGE_EMAIL";
    const url = new URL(
      change
        ? "/platform/account/change-email"
        : purpose === "VERIFY_EMAIL"
          ? "/platform/account/verify"
          : "/platform/account/recover",
      config.origin
    );
    url.hash = new URLSearchParams(
      change ? { token, purpose } : { token }
    ).toString();
    if (config.delivery === "test-sink" && config.sinkDirectory) {
      await mkdir(config.sinkDirectory, { recursive: true, mode: 0o700 });
      await writeFile(
        join(config.sinkDirectory, `${randomUUID()}.json`),
        JSON.stringify({ email, purpose, url: url.toString() }),
        { mode: 0o600, flag: "wx" }
      );
      return;
    }
    if (config.delivery !== "resend" || !config.resend)
      throw new Error("Account delivery unavailable");
    const reset = purpose === "RESET_PASSWORD";
    const subject = reset
      ? "Reset your Godschurches password"
      : change
        ? "Confirm your new Godschurches sign-in email"
        : "Verify your Godschurches email";
    const paragraphs = [
      subject,
      "",
      reset
        ? "Use this link to choose a new password:"
        : change
          ? "Open this link in a browser signed in to the account that requested the change, then confirm your current password:"
          : "Use this link to confirm your email address:",
      url.toString(),
      "",
      "This link expires in 30 minutes and can only be used once.",
      reset
        ? "Resetting your password signs out every device."
        : change
          ? "Your existing sign-in email keeps working until you confirm. Confirmation changes your sign-in email and signs out every device. Your public profile and church directory contacts are unchanged."
          : "Verifying your email does not change your password or sign you in.",
      "If you did not request this, you can ignore this email. Your account is unchanged."
    ];
    const text =
      paragraphs.join("\n") +
      "\n\nIf the link does not open, copy the complete link above into your regular browser. If you found this message in Spam, mark it as not spam so future account emails are easier to find.";
    const action = reset
      ? "Reset password"
      : change
        ? "Confirm new email"
        : "Verify email";
    const href = escapeHtml(url.toString());
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px;background:#f5f5f2;color:#202723;font-family:Arial,sans-serif;font-size:16px;line-height:1.6"><main style="max-width:560px;margin:0 auto;padding:24px;background:#fff;border-radius:12px"><p>Godschurches</p><h1 style="font-size:24px">${escapeHtml(subject)}</h1><p>${escapeHtml(paragraphs[2])}</p><p><a href="${href}" style="display:inline-block;background:#245b47;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold">${action}</a></p><p>${escapeHtml(paragraphs[5])}</p><p>${escapeHtml(paragraphs[6])}</p><p>If the button does not open, copy this complete link into your regular browser:</p><p style="word-break:break-all"><a href="${href}">${href}</a></p><p>${escapeHtml(paragraphs[7])}</p><p style="font-size:14px">If you found this message in Spam, mark it as not spam so future account emails are easier to find.</p></main></body></html>`;
    const body = JSON.stringify({
      from: `Godschurches <${config.resend.from}>`,
      to: [email],
      subject,
      text,
      html,
      headers: { "Auto-Submitted": "auto-generated" },
      tags: [
        {
          name: "category",
          value: reset
            ? "account_reset"
            : change
              ? "account_email_change"
              : "account_verification"
        }
      ]
    });
    const idempotencyKey = `account/${purpose}/${createHash("sha256").update(token).digest("hex")}`;
    // Two bounded attempts fit inside the route's 60-second lifetime. Never log
    // provider errors: they can contain the recipient or recovery link.
    for (let attempt = 0; attempt < 2; attempt++) {
      let retry = true;
      try {
        const response = await send("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.resend.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey
          },
          body,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000)
        });
        if (response.ok) {
          const result: unknown = await response.json();
          if (
            result &&
            typeof result === "object" &&
            "id" in result &&
            typeof result.id === "string" &&
            result.id
          )
            return;
        } else {
          retry = response.status === 429 || response.status >= 500;
          await response.body?.cancel();
        }
      } catch {
        // Network/timeout or an unreadable success response is safe to retry
        // with the identical payload and idempotency key.
      }
      if (!retry || attempt === 1) throw new Error("Account delivery failed");
      await delay(1000);
    }
  };
}

export async function deliverAccountGrant(
  email: string,
  purpose: AccountGrantPurpose,
  token: string
) {
  await accountGrantDelivery(accountConfig())(email, purpose, token);
}
