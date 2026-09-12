import type { Prisma, PrismaClient } from "@prisma/client";
import { readAccountSession } from "./accounts";

/** Shared read boundary; permission writers retain the same exclusive gate. */
export function withAccountRead<T>(
  db: PrismaClient,
  token: unknown,
  work: (tx: Prisma.TransactionClient, ownerId: string | null) => Promise<T>
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock_shared(730221, 2)`;
      const user = await readAccountSession(tx as PrismaClient, token);
      return work(tx, user?.id ?? null);
    },
    { maxWait: 10000, timeout: 15000 }
  );
}
