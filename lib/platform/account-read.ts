import type { Prisma, PrismaClient } from "@prisma/client";
import { readAccountSession } from "./accounts";
import { AccountError } from "./account-error";
import { AccountSessionOwnerError } from "./account-sessions";

/** Optional strict transport identity; existing website readers retain their behavior. */
export type ReadIdentity = {
  expectedOwner: string | null;
  credentialSupplied: boolean;
};
export function requireReadIdentity(
  ownerId: string | null,
  identity?: ReadIdentity
) {
  if (!identity) return;
  if (identity.credentialSupplied && !ownerId)
    throw new AccountError("session");
  if (ownerId !== identity.expectedOwner) throw new AccountSessionOwnerError();
}

/** Shared read boundary; permission writers retain the same exclusive gate. */
export function withAccountRead<T>(
  db: PrismaClient,
  token: unknown,
  work: (tx: Prisma.TransactionClient, ownerId: string | null) => Promise<T>,
  identity?: ReadIdentity
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock_shared(730221, 2)`;
      const user = await readAccountSession(tx as PrismaClient, token);
      requireReadIdentity(user?.id ?? null, identity);
      return work(tx, user?.id ?? null);
    },
    { maxWait: 10000, timeout: 15000 }
  );
}
