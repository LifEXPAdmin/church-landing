import type { Prisma } from "@prisma/client";
import { eligibleWhere } from "./portal-policy";
import { SUPPORT_NOTICE } from "./support-types";
export const supportRecipientSelect = {
  id: true,
  version: true,
  userId: true,
  user: { select: { id: true, name: true } }
} as const;
export function supportRecipient(
  tx: Prisma.TransactionClient,
  grantId: unknown
) {
  if (typeof grantId !== "string") return Promise.resolve(null);
  return tx.supportCapabilityGrant.findFirst({
    where: {
      id: grantId,
      capability: "RESPOND",
      revokedAt: null,
      user: eligibleWhere
    },
    select: supportRecipientSelect
  });
}
export async function defaultSupportRecipient(tx: Prisma.TransactionClient) {
  if (process.env.SUPPORT_INTAKE_ENABLED !== "true") return null;
  const config = await tx.supportIntakeSetting.findUnique({
    where: { id: "default" }
  });
  return config?.enabled && config.approvedNoticeVersion === SUPPORT_NOTICE
    ? supportRecipient(tx, config.ownerGrantId)
    : null;
}
