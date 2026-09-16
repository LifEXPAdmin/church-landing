import type { Prisma, PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import {
  regionalDateFormats,
  regionalTimeFormats,
  regionalPresentation
} from "./regional-format";

export const regionalSelect = {
  dateFormat: true,
  timeFormat: true,
  regionalVersion: true
} as const;
export function regionalState(user: {
  id: string;
  dateFormat: string;
  timeFormat: string;
  regionalVersion: number;
}) {
  return {
    ownerId: user.id,
    ...regionalPresentation(user),
    version: user.regionalVersion
  };
}
export async function regionalStateIn(
  tx: Prisma.TransactionClient,
  ownerId: string
) {
  return regionalState(
    await tx.platformUser.findUniqueOrThrow({
      where: { id: ownerId },
      select: { id: true, ...regionalSelect }
    })
  );
}
export function readRegionalPreferences(db: PrismaClient, token: unknown) {
  return withOwnedSession(
    db,
    token,
    (tx, current) => regionalStateIn(tx, current.userId),
    "shared"
  );
}
export type RegionalState = Awaited<ReturnType<typeof readRegionalPreferences>>;
export function saveRegionalPreferences(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "mutationId",
    "expectedVersion",
    "dateFormat",
    "timeFormat"
  ]);
  if (
    !regionalDateFormats.some((v) => v === input.dateFormat) ||
    !regionalTimeFormats.some((v) => v === input.timeFormat)
  )
    throw new PortalError(400, "Choose a supported date and time format.");
  return socialCommand(
    db,
    token,
    "regional-preferences",
    input,
    async (tx, ownerId) => {
      const current = await regionalStateIn(tx, ownerId);
      expected(input.expectedVersion, current.version);
      const user = await tx.platformUser.update({
        where: { id: ownerId },
        data: {
          dateFormat: String(input.dateFormat),
          timeFormat: String(input.timeFormat),
          regionalVersion: { increment: 1 }
        },
        select: { regionalVersion: true }
      });
      return {
        id: ownerId,
        version: user.regionalVersion,
        message: "Your date and time formats were saved."
      };
    },
    undefined,
    "shared"
  );
}
