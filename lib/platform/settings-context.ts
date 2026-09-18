import type { PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import {
  accountDeliveryAvailable,
  accountDeletionAvailable
} from "./account-availability";
import { googleAvailable } from "./google-availability";
import { photoLibraryEnabled } from "./personal-photo-policy";
import { isEligible, PortalError } from "./portal-policy";
import { accountSignInMethods } from "./google-accounts";
import { socialPrivacyIn } from "./social-privacy";
import { regionalSelect, regionalState } from "./regional-preferences";
import { settingsChurchIn } from "./settings-church";

/** Private settings summaries; mutations remain in their owning services. */
export function readSettingsContext(
  db: PrismaClient,
  token: unknown,
  expectedAccount?: string | null,
  includeChurch = false
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
          ...regionalSelect,
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
            where: {
              userId: user.id,
              ...(includeChurch ? {} : { state: "APPROVED" as const })
            },
            select: {
              state: true,
              church: { select: { id: true, name: true } }
            },
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            take: 201
          })
        : [];
      const churchError =
        connections.length > 200
          ? "Your church connections need a size review. Personal settings remain available."
          : null;
      const safeConnections = churchError ? [] : connections;
      const churches = safeConnections
        .filter((c) => c.state === "APPROVED")
        .map((c) => c.church);
      const at = user.email.lastIndexOf("@");
      return {
        ownerId: user.id,
        regional: regionalState(user),
        name: user.name,
        username: user.username,
        emailLabel:
          at > 0
            ? `${user.email[0]}•••${user.email.slice(at)}`
            : "Private sign-in email",
        emailVerified: !!user.emailVerifiedAt,
        emailAvailable: accountDeliveryAvailable(),
        deletionAvailable: accountDeletionAvailable(),
        googleAvailable: googleAvailable(),
        methods: await accountSignInMethods(tx, session),
        privacy: await socialPrivacyIn(tx, user.id),
        photosAvailable: photoLibraryEnabled(),
        churches,
        churchError,
        church: includeChurch
          ? await settingsChurchIn(
              tx,
              user.id,
              isEligible(user),
              safeConnections
            )
          : null
      };
    },
    true
  );
}
export type SettingsContext = Awaited<ReturnType<typeof readSettingsContext>>;
