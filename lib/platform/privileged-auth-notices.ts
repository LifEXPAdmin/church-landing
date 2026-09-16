import type { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { accountConfig, type AccountConfig } from "./account-config";
import { sendResendEmail } from "./resend-delivery";
import { privilegedMode } from "./privileged-auth-policy";

export function privilegedNoticeDelivery(config: AccountConfig, send: typeof fetch = fetch) {
  return async (notice: { id: string; email: string; action: string; createdAt: Date }) => {
    const text = [
      "Your God's Churches authenticator changed.",
      `Action: ${notice.action}. Time: ${notice.createdAt.toISOString()}.`,
      "If you made this change, keep your recovery codes somewhere private and separate from your authenticator.",
      "If you did not make this change, sign in through your saved website address, change your password and review your signed-in devices. Contact your trusted operator using an established contact method.",
      "Email recovery alone cannot remove authenticator protection for assigned duties. This notice contains no setup key or recovery code."
    ].join("\n\n");
    if (config.delivery === "test-sink" && config.sinkDirectory) {
      await mkdir(config.sinkDirectory, { recursive: true, mode: 0o700 });
      await writeFile(join(config.sinkDirectory, `security-${notice.id}.json`),
        JSON.stringify({ purpose: "PRIVILEGED_SECURITY", email: notice.email, text }), { mode: 0o600 });
      return;
    }
    if (config.delivery !== "resend" || !config.resend) throw Error("Security notice unavailable");
    const status = await sendResendEmail(config.resend.apiKey, JSON.stringify({
      from: `God's Churches <${config.resend.from}>`, to: [notice.email],
      subject: "Your God's Churches authenticator changed", text,
      headers: { "Auto-Submitted": "auto-generated" }, tags: [{ name: "category", value: "account_security" }]
    }), `account-security/${notice.id}`, send);
    if (status < 200 || status >= 300) throw Error("Security notice could not be confirmed");
  };
}

export async function dispatchPrivilegedNotices(
  db: PrismaClient, userId?: string,
  deliver?: ReturnType<typeof privilegedNoticeDelivery>
) {
  if (privilegedMode() === "off") return { delivered: 0, pending: 0 };
  const delivery = deliver ?? privilegedNoticeDelivery(accountConfig());
  const rows = await db.privilegedSecurityNotice.findMany({
    where: { ...(userId ? { userId } : {}), deliveredAt: null, attempts: { lt: 5 },
      OR: [{ attemptedAt: null }, { attemptedAt: { lt: new Date(Date.now() - 60000) } }] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 5
  });
  let delivered = 0, pending = 0;
  for (const row of rows) {
    const claimed = await db.privilegedSecurityNotice.updateMany({
      where: { id: row.id, attempts: row.attempts, deliveredAt: null },
      data: { attempts: { increment: 1 }, attemptedAt: new Date() }
    });
    if (!claimed.count) continue;
    const user = await db.platformUser.findFirst({
      where: { id: row.userId, emailVerifiedAt: { not: null }, deactivatedAt: null, suspendedAt: null },
      select: { email: true }
    });
    if (!user) { pending++; continue; }
    try {
      await delivery({ id: row.id, email: user.email, action: row.action, createdAt: row.createdAt });
      await db.privilegedSecurityNotice.update({ where: { id: row.id }, data: { deliveredAt: new Date() } });
      delivered++;
    } catch { pending++; }
  }
  return { delivered, pending };
}
