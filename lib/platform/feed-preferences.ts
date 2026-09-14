import type { PrismaClient } from "@prisma/client";
import { expected, PortalError } from "./portal-policy";
import { feedMode } from "./feed-options";
import { socialCommand, socialInput } from "./social-operations";
export function saveFeedPreference(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, ["mode", "mutationId", "expectedVersion"]);
  const mode = feedMode(input.mode);
  if (!mode) throw new PortalError(400, "Choose a supported feed.");
  return socialCommand(
    db,
    token,
    "feed-choice",
    input,
    async (tx, ownerId) => {
      const old = await tx.socialPreferences.findUnique({
        where: { ownerId },
        select: { feedVersion: true }
      });
      expected(input.expectedVersion, old?.feedVersion ?? 0);
      const row = await tx.socialPreferences.upsert({
        where: { ownerId },
        create: { ownerId, feedMode: mode, feedVersion: 1 },
        update: { feedMode: mode, feedVersion: { increment: 1 } }
      });
      return {
        id: ownerId,
        version: row.feedVersion,
        message: "Feed choice saved."
      };
    },
    undefined,
    "shared"
  );
}
