import type { PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import { recordDiscoveryControl } from "./retention-controls";
import { protectDiscoveryRecovery } from "./discovery-recovery";

function originalOwner(actual: string, expectedOwner: string) {
  if (!expectedOwner || actual !== expectedOwner)
    throw new PortalError(
      401,
      "Your sign-in changed. Return to the original account to continue."
    );
}
export function readReactionPreferences(
  db: PrismaClient,
  token: unknown,
  expectedOwner: string
) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      originalOwner(session.userId, expectedOwner);
      const row = await tx.socialPreferences.findUnique({
        where: { ownerId: session.userId },
        select: {
          hideAuthoredReactionCounts: true,
          reactionCountVersion: true,
          reactionCountRecoveryRequired: true
        }
      });
      return {
        ownerId: session.userId,
        hideAuthoredReactionCounts: !!(
          row?.hideAuthoredReactionCounts || row?.reactionCountRecoveryRequired
        ),
        version: row?.reactionCountVersion ?? 0,
        recoveryRequired: row?.reactionCountRecoveryRequired ?? false
      };
    },
    true
  );
}
export type ReactionPreferencesState = Awaited<
  ReturnType<typeof readReactionPreferences>
>;

export async function saveReactionPreferences(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>,
  expectedOwner: string
) {
  socialInput(input, [
    "mutationId",
    "expectedVersion",
    "hideAuthoredReactionCounts"
  ]);
  if (typeof input.hideAuthoredReactionCounts !== "boolean")
    throw new PortalError(
      400,
      "Choose whether to hide totals on your own posts and comments."
    );
  const hideAuthoredReactionCounts = input.hideAuthoredReactionCounts;
  const result = await socialCommand(
    db,
    token,
    "reaction-count-preferences",
    input,
    async (tx, ownerId) => {
      const previous = await tx.socialPreferences.findUnique({
        where: { ownerId }
      });
      expected(input.expectedVersion, previous?.reactionCountVersion ?? 0);
      const nextVersion = (previous?.reactionCountVersion ?? 0) + 1;
      await tx.socialPreferences.upsert({
        where: { ownerId },
        create: {
          ownerId,
          hideAuthoredReactionCounts,
          reactionCountVersion: nextVersion
        },
        update: {
          hideAuthoredReactionCounts,
          reactionCountVersion: nextVersion,
          reactionCountRecoveryRequired: false
        }
      });
      await recordDiscoveryControl(
        tx,
        "REACTION_COUNT_PREFERENCES",
        ownerId,
        ownerId,
        nextVersion
      );
      return {
        id: ownerId,
        version: nextVersion,
        message: "Your reaction-count choice is saved."
      };
    },
    async (_tx, ownerId) => originalOwner(ownerId, expectedOwner)
  );
  if (!(await protectDiscoveryRecovery(db, result.id)))
    throw new PortalError(
      503,
      "Your choice is saved; its protected recovery receipt needs confirmation. Retry the same change."
    );
  return result;
}
