import type { PrismaClient } from "@prisma/client";
import { withOwnedSession, requireSessionOwner } from "./account-sessions";

/** Project only public identity after the canonical session and account lock. */
export function readNativeSession(
  db: PrismaClient,
  token: string,
  expectedOwner?: string
) {
  return withOwnedSession(
    db,
    token,
    async (tx, current) => {
      requireSessionOwner(current, expectedOwner);
      const account = await tx.platformUser.findUniqueOrThrow({
        where: { id: current.userId },
        select: { id: true, name: true, username: true }
      });
      return { state: "authenticated" as const, account };
    },
    "shared"
  );
}
