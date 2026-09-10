import type { ChurchCapability, Prisma, PrismaClient } from "@prisma/client";
import { churchSelect, eligibleWhere } from "./portal";

type Db = Prisma.TransactionClient | PrismaClient;

// Read contributions at the authorization boundary, never a cached role title.
// The composite foreign key binds each contribution to its exact appointment.
export function activeRoleGrantWhere(): Prisma.ChurchRoleGrantWhereInput {
  return {
    revokedAt: null,
    assignment: {
      revokedAt: null,
      position: { archivedAt: null },
      connection: { state: "APPROVED", user: eligibleWhere }
    }
  };
}

export async function effectiveChurchGrants(
  db: Db,
  userId: string,
  churchIds?: string[],
  capabilities?: ChurchCapability[]
) {
  const direct = await db.churchCapabilityGrant.findMany({
    where: {
      userId,
      user: eligibleWhere,
      revokedAt: null,
      ...(churchIds ? { churchId: { in: churchIds } } : {}),
      ...(capabilities ? { capability: { in: capabilities } } : {})
    },
    include: { dependency: true, church: { select: churchSelect } }
  });
  const roles = await db.churchRoleGrant.findMany({
    where: {
      ...activeRoleGrantWhere(),
      AND: [{ assignment: { connection: { userId } } }],
      ...(churchIds ? { churchId: { in: churchIds } } : {}),
      ...(capabilities ? { capability: { in: capabilities } } : {})
    },
    include: {
      assignment: {
        include: {
          connection: { include: { church: { select: churchSelect } } }
        }
      }
    }
  });
  return [
    ...direct
      .filter(
        (g) =>
          !g.dependency ||
          (g.dependency.userId === userId &&
            g.dependency.churchId === g.churchId &&
            g.dependency.state === "APPROVED")
      )
      .map((g) => ({
        ...g,
        source: "INDEPENDENT" as const,
        assignmentId: null as string | null
      })),
    ...roles.map((g) => ({
      id: g.id,
      userId,
      churchId: g.churchId,
      capability: g.capability,
      version: g.version,
      revokedAt: g.revokedAt,
      createdAt: g.createdAt,
      dependencyConnectionId: g.connectionId,
      dependency: g.assignment.connection,
      sourceClaimId: null,
      church: g.assignment.connection.church,
      source: "ASSIGNMENT" as const,
      assignmentId: g.assignmentId
    }))
  ];
}

export async function hasChurchReviewer(
  db: Db,
  churchId: string,
  excludedUserId = ""
) {
  const direct = await db.churchCapabilityGrant.findMany({
    where: {
      churchId,
      capability: "REVIEW_CONNECTIONS",
      revokedAt: null,
      userId: { not: excludedUserId },
      user: eligibleWhere
    },
    select: { userId: true, dependency: true }
  });
  if (
    direct.some(
      (g) =>
        !g.dependency ||
        (g.dependency.userId === g.userId &&
          g.dependency.churchId === churchId &&
          g.dependency.state === "APPROVED")
    )
  )
    return true;
  return !!(await db.churchRoleGrant.findFirst({
    where: {
      ...activeRoleGrantWhere(),
      churchId,
      capability: "REVIEW_CONNECTIONS",
      AND: [{ assignment: { connection: { userId: { not: excludedUserId } } } }]
    },
    select: { id: true }
  }));
}

export async function endRoleContributions(
  tx: Prisma.TransactionClient,
  assignment: Prisma.ChurchPositionAssignmentWhereInput
) {
  await tx.churchRoleGrant.updateMany({
    where: { assignment, revokedAt: null },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
}
