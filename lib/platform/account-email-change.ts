import { Prisma, type PrismaClient } from "@prisma/client";
import { AccountError, normalizeEmail } from "./accounts";
import { withOwnedSession } from "./account-sessions";
import { requireAccountCredential } from "./account-credential";
import { createSessionToken, hashSessionToken, validToken } from "./auth";

export class AccountEmailChangeError extends Error {}
type Delivery = (
  email: string,
  purpose: "CHANGE_EMAIL",
  token: string
) => Promise<void>;

// The returned work is for the server's response lifecycle, never a response DTO.
// Recipient availability and provider latency occur after the neutral response.
export async function requestEmailChange(
  db: PrismaClient,
  sessionToken: unknown,
  currentPassword: unknown,
  newEmailInput: unknown,
  deliver: Delivery
) {
  const newEmail = normalizeEmail(newEmailInput);
  if (!newEmail)
    throw new AccountEmailChangeError("Enter a valid new sign-in email.");
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const ownerId = await withOwnedSession(
    db,
    sessionToken,
    async (tx, current) => {
      await requireAccountCredential(
        tx,
        current,
        currentPassword,
        "request-email-change"
      );
      const data = {
        tokenHash,
        newEmail,
        credentialVersion: current.credentialVersion,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      };
      await tx.platformEmailChange.upsert({
        where: { userId: current.userId },
        create: { ...data, userId: current.userId },
        update: data
      });
      return current.userId;
    }
  );
  return async () => {
    try {
      const shouldSend = await withOwnedSession(
        db,
        sessionToken,
        async (tx, current) => {
          const pending = await tx.platformEmailChange.findUnique({
            where: { userId: current.userId }
          });
          if (
            !pending ||
            pending.tokenHash !== tokenHash ||
            pending.credentialVersion !== current.credentialVersion ||
            pending.expiresAt <= new Date()
          )
            return false;
          // Never merge an existing account, including passwordless legacy records.
          return !(await tx.platformUser.findUnique({
            where: { email: newEmail },
            select: { id: true }
          }));
        }
      );
      if (!shouldSend) return;
      await deliver(newEmail, "CHANGE_EMAIL", token);
    } catch (error) {
      // Cleanup is conditional so a failed older send cannot erase a newer request.
      await db.platformEmailChange.deleteMany({
        where: { userId: ownerId, tokenHash }
      });
      if (error instanceof AccountError && error.code === "session") return;
      throw new Error("Account email-change delivery failed");
    }
  };
}

export async function confirmEmailChange(
  db: PrismaClient,
  sessionToken: unknown,
  currentPassword: unknown,
  token: unknown
) {
  if (!validToken(token)) throw new AccountError("grant");
  try {
    await withOwnedSession(
      db,
      sessionToken,
      async (tx, current) => {
        await requireAccountCredential(
          tx,
          current,
          currentPassword,
          "confirm-email-change"
        );
        const pending = await tx.platformEmailChange.findUnique({
          where: { userId: current.userId }
        });
        if (
          !pending ||
          pending.tokenHash !== hashSessionToken(token) ||
          pending.expiresAt <= new Date() ||
          pending.credentialVersion !== current.credentialVersion
        )
          throw new AccountError("grant");
        if (
          await tx.platformUser.findUnique({
            where: { email: pending.newEmail },
            select: { id: true }
          })
        )
          throw new AccountEmailChangeError(
            "This email change cannot be completed. Request a new link for a different address."
          );
        const now = new Date();
        await tx.platformUser.update({
          where: { id: current.userId },
          data: {
            email: pending.newEmail,
            emailVerifiedAt: now,
            credentialVersion: { increment: 1 },
            portalVersion: { increment: 1 }
          }
        });
        await tx.platformSession.deleteMany({
          where: { userId: current.userId }
        });
        await tx.platformAccountGrant.updateMany({
          where: { userId: current.userId, consumedAt: null },
          data: { consumedAt: now }
        });
        await tx.platformEmailChange.delete({
          where: { userId: current.userId }
        });
      },
      true
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new AccountEmailChangeError(
        "This email change cannot be completed. Request a new link for a different address."
      );
    throw error;
  }
}
