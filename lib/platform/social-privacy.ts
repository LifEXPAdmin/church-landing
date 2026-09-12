import type { Prisma } from "@prisma/client";
import { PortalError } from "./portal";

export type SocialPrivacy = {
  version: number;
  mentions: "EVERYONE" | "FOLLOWED" | "NOBODY";
  showRelationships: boolean;
};

/** The existing owner's effective privacy values; this does not grant access. */
export async function socialPrivacyIn(
  tx: Prisma.TransactionClient,
  ownerId: string
): Promise<SocialPrivacy> {
  const row = await tx.socialPreferences.findUnique({
    where: { ownerId },
    select: { version: true, mentions: true, showRelationships: true }
  });
  if (!row)
    return {
      version: 0,
      mentions: "EVERYONE" as const,
      showRelationships: true
    };
  const mentions = row.mentions;
  if (
    mentions !== "EVERYONE" &&
    mentions !== "FOLLOWED" &&
    mentions !== "NOBODY"
  )
    throw new PortalError(
      503,
      "Your privacy choices could not be checked. Try again."
    );
  return { ...row, mentions };
}
