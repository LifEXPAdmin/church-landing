import type { PrismaClient } from "@prisma/client";
import { withAdmin } from "./admin-authority";
import { adminQueueCounts } from "./admin-queue";
import { defaultAdminFilters } from "./admin-types";

export function readAdminOverview(db: PrismaClient, token: unknown) {
  return withAdmin(db, token, async (tx, a) => {
    const checkedAt = new Date();
    return {
      navigation: a.navigation,
      checkedAt: checkedAt.toISOString(),
      requests: a.canQueue
        ? await adminQueueCounts(tx, a, defaultAdminFilters, checkedAt)
        : null
    };
  });
}
export type AdminOverviewSnapshot = Awaited<
  ReturnType<typeof readAdminOverview>
>;
