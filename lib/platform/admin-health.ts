import type { PrismaClient } from "@prisma/client";
import { withAdmin, requireAdminCapability } from "./admin-authority";
import { readOperationalHealth } from "./operational-health";

export function readAdminHealth(db: PrismaClient, token: unknown) {
  return withAdmin(db, token, async (_tx, a) => {
    requireAdminCapability(a, "VIEW_OPERATIONAL_HEALTH");
    // The outer shared permission gate remains held during this bounded read;
    // access cannot be revoked between authorization and the aggregate result.
    try {
      return {
        navigation: a.navigation,
        available: true as const,
        health: await readOperationalHealth(db)
      };
    } catch {
      return {
        navigation: a.navigation,
        available: false as const,
        health: null
      };
    }
  });
}
