import type { Prisma } from "@prisma/client";
/** Bounded sweep; expiry is enforced on reads even before maintenance runs. */
export async function expireFeedSnapshots(
  db: Pick<Prisma.TransactionClient, "$executeRaw">,
  now = new Date()
) {
  return db.$executeRaw`DELETE FROM "FeedSnapshot" WHERE id IN
    (SELECT id FROM "FeedSnapshot" WHERE "expiresAt" <= ${now.toISOString()}::timestamp ORDER BY "expiresAt", id LIMIT 500)`;
}
