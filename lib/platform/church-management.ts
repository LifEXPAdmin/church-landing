import { Prisma, type PrismaClient } from "@prisma/client";
import { ADULT_POLICY } from "./portal-types";
type Tx = Prisma.TransactionClient;
export async function verifiedChurchManagement(
  db: Tx | PrismaClient,
  ids: string[]
) {
  if (!ids.length) return new Set<string>();
  const rows = await db.$queryRaw<
    { churchId: string }[]
  >`SELECT DISTINCT g."churchId" FROM "ChurchCapabilityGrant" g
    JOIN "PlatformUser" u ON u.id = g."userId" JOIN "ChurchClaim" c ON c.id = g."sourceClaimId"
    LEFT JOIN "ChurchConnection" d ON d.id = g."dependencyConnectionId"
    WHERE g."churchId" IN (${Prisma.join(ids)}) AND g."revokedAt" IS NULL
    AND g.capability IN ('MANAGE_CHURCH_PROFILE', 'MANAGE_CHURCH_ACCESS')
    AND c.status = 'APPROVED' AND c."activatedAt" IS NOT NULL AND c."ownerId" = g."userId" AND c."churchId" = g."churchId"
    AND u."suspendedAt" IS NULL AND u."deactivatedAt" IS NULL AND u."emailVerifiedAt" IS NOT NULL
    AND u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion" = ${ADULT_POLICY}
    AND (g."dependencyConnectionId" IS NULL OR (d."userId" = g."userId" AND d."churchId" = g."churchId" AND d.state = 'APPROVED'))`;
  return new Set(rows.map((row) => row.churchId));
}
