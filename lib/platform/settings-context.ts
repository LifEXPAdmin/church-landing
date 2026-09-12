import type { PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { accountDeliveryAvailable } from "./account-availability";
import { googleAvailable } from "./google-availability";
import { photoLibraryEnabled } from "./personal-photo-policy";
import { isEligible, PortalError } from "./portal";

/** Private navigation context only; values remain in their owning service. */
export function readSettingsContext(
  db: PrismaClient,
  token: unknown,
  expectedAccount?: string | null
) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      if (expectedAccount && expectedAccount !== session.userId)
        throw new PortalError(
          401,
          "Your sign-in changed. Reload settings before continuing."
        );
      const user = await tx.platformUser.findUniqueOrThrow({
        where: { id: session.userId },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          emailVerifiedAt: true,
          adultAcknowledgedAt: true,
          adultPolicyVersion: true,
          suspendedAt: true,
          deactivatedAt: true
        }
      });
      const connections = isEligible(user)
        ? await tx.churchConnection.findMany({
            where: { userId: user.id, state: "APPROVED" },
            select: { church: { select: { id: true, name: true } } },
            orderBy: { id: "asc" },
            take: 201
          })
        : [];
      const churchError =
        connections.length > 200
          ? "Your church connections need a size review. Personal settings remain available."
          : null;
      const churches = churchError ? [] : connections.map((c) => c.church);
      const at = user.email.lastIndexOf("@");
      return {
        ownerId: user.id,
        name: user.name,
        username: user.username,
        emailLabel:
          at > 0
            ? `${user.email[0]}•••${user.email.slice(at)}`
            : "Private sign-in email",
        emailVerified: !!user.emailVerifiedAt,
        emailAvailable: accountDeliveryAvailable(),
        googleAvailable: googleAvailable(),
        photosAvailable: photoLibraryEnabled(),
        churches,
        churchError
      };
    },
    true
  );
}
export type SettingsContext = Awaited<ReturnType<typeof readSettingsContext>>;
