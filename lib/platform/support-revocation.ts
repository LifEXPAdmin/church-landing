import type { Prisma } from "@prisma/client";
import { ADULT_POLICY } from "./portal-types";

// Called inside the existing portal transaction gate. No content is selected.
export async function reconcileSupportAccess(tx: Prisma.TransactionClient) {
  const unassigned = await tx.$queryRaw<Array<{ id: string; version: number }>>`
    UPDATE "SupportCase" c SET "ownerGrantId"=NULL, "ownerGrantVersion"=NULL,
      "version"=c."version"+1, "updatedAt"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE c."ownerGrantId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "SupportCapabilityGrant" g JOIN "PlatformUser" u ON u.id=g."userId"
      WHERE g.id=c."ownerGrantId" AND g.version=c."ownerGrantVersion" AND g.capability='RESPOND'
      AND g."revokedAt" IS NULL AND u."suspendedAt" IS NULL AND u."emailVerifiedAt" IS NOT NULL
      AND u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion"=${ADULT_POLICY})
    RETURNING c.id,c.version`;
  const revoked = await tx.$queryRaw<Array<{ caseId: string }>>`
    UPDATE "SupportCoordinatorShare" s SET "revokedAt"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE s."revokedAt" IS NULL AND NOT EXISTS (
      SELECT 1 FROM "ChurchContactAssignment" a
      JOIN "PlatformUser" u ON u.id=a."userId"
      JOIN "ChurchConnection" member ON member.id=a."connectionId"
      JOIN "ChurchConnection" requester ON requester.id=s."requesterConnectionId"
      JOIN "SupportCase" c ON c.id=s."caseId"
      JOIN "PlatformUser" ru ON ru.id=c."requesterId"
      WHERE a.id=s."appointmentId" AND a.version=s."appointmentVersion" AND a."revokedAt" IS NULL
      AND a.slot IN ('PRIMARY','BACKUP') AND a."churchId"=c."churchId"
      AND member."churchId"=c."churchId" AND member."userId"=u.id AND member.state='APPROVED'
      AND requester."churchId"=c."churchId" AND requester."userId"=c."requesterId" AND requester.state='APPROVED'
      AND u."suspendedAt" IS NULL AND u."emailVerifiedAt" IS NOT NULL AND u."adultAcknowledgedAt" IS NOT NULL
      AND u."adultPolicyVersion"=${ADULT_POLICY} AND ru."suspendedAt" IS NULL
      AND ru."emailVerifiedAt" IS NOT NULL AND ru."adultAcknowledgedAt" IS NOT NULL
      AND ru."adultPolicyVersion"=${ADULT_POLICY}) RETURNING s."caseId"`;
  for (const row of unassigned)
    await tx.supportAuditEvent.create({
      data: {
        caseId: row.id,
        version: row.version,
        action: "OWNER_ACCESS_ENDED"
      }
    });
  for (const row of revoked) {
    const c = await tx.supportCase.update({
      where: { id: row.caseId },
      data: { version: { increment: 1 } },
      select: { version: true }
    });
    await tx.supportAuditEvent.create({
      data: {
        caseId: row.caseId,
        version: c.version,
        action: "COORDINATOR_ACCESS_ENDED"
      }
    });
  }
}
