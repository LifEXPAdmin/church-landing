import type { PrismaClient } from "@prisma/client";
import {
  journalRetentionControls,
  protectedRetentionControls
} from "./retention-controls";
export async function protectDiscoveryRecovery(
  db: PrismaClient,
  ownerId: string,
  signal?: AbortSignal
) {
  try {
    const result = await journalRetentionControls(
      db,
      protectedRetentionControls(),
      ownerId,
      signal
    );
    return !result.failed && !result.pending;
  } catch {
    return false;
  }
}
