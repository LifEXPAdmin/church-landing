import { createHash } from "node:crypto";
import type { ChurchCapability, Prisma } from "@prisma/client";
import { type Actor, churchCapability } from "./portal";
import { expected, PortalError } from "./portal-policy";

type Tx = Prisma.TransactionClient;
// Deliberate allowlist: adding a new product capability never makes it delegable.
export const delegableChurchCapabilities: ChurchCapability[] = [
  "MANAGE_STRUCTURE",
  "EDIT_CHURCH_CALENDAR",
  "PUBLISH_CHURCH_EVENTS",
  "PUBLISH_CHURCH_POSTS",
  "MODERATE_CHURCH_POSTS",
  "MANAGE_CHURCH_VOLUNTEERS",
  "MANAGE_CHURCH_ACCESS",
  "REVIEW_CONNECTIONS",
  "APPOINT_COORDINATORS"
];

function reviewedCapabilities(
  input: Record<string, unknown>
): ChurchCapability[] {
  if (input.privilegesReviewed !== true || input.confirmed !== true)
    throw new PortalError(
      400,
      "Review the privileges, including any choice of no additional permissions, and confirm the assignment."
    );
  const list = input.capabilities;
  if (
    !Array.isArray(list) ||
    list.length > delegableChurchCapabilities.length ||
    new Set(list).size !== list.length ||
    list.some(
      (c) => !delegableChurchCapabilities.includes(c as ChurchCapability)
    ) ||
    input.presetKey !== undefined ||
    input.recommendations !== undefined
  )
    throw new PortalError(
      400,
      "Choose explicit supported permissions. A title or preset cannot grant access."
    );
  return [...list].sort() as ChurchCapability[];
}

// The caller owns the portal transaction, membership/structure checks and audit.
export async function saveAssignmentPrivileges(
  tx: Tx,
  actor: Actor,
  churchId: string,
  structureVersion: number,
  positionId: string,
  target: { id: string; userId: string },
  input: Record<string, unknown>
) {
  const capabilities = reviewedCapabilities(input);
  const key = input.requestKey;
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(key))
    throw new PortalError(400, "Use a valid assignment save reference.");
  const prior = await tx.churchPositionAssignment.findUnique({
    where: { positionId_connectionId: { positionId, connectionId: target.id } },
    include: { roleGrants: { where: { revokedAt: null } } }
  });
  const activePrior = prior && !prior.revokedAt ? prior : null;
  const oldCapabilities =
    activePrior?.roleGrants.map((g) => g.capability) ?? [];
  const changes = new Set([...capabilities, ...oldCapabilities]);
  // Recheck even an identical retry against today's delegation authority.
  if (changes.size) {
    if (target.userId === actor.id)
      throw new PortalError(
        403,
        "You cannot grant yourself church permissions. Use Step down to end your own role."
      );
    await churchCapability(tx, actor, churchId, "MANAGE_CHURCH_ACCESS");
    for (const scope of changes)
      await churchCapability(tx, actor, churchId, scope);
  }
  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        churchId,
        positionId,
        connectionId: target.id,
        capabilities,
        assignmentVersion: input.assignmentVersion
      })
    )
    .digest("hex");
  const receipt = await tx.churchAssignmentSave.findUnique({
    where: { requestKey: key }
  });
  if (receipt) {
    if (
      receipt.actorId !== actor.id ||
      receipt.churchId !== churchId ||
      receipt.inputHash !== inputHash ||
      receipt.assignmentId !== activePrior?.id ||
      receipt.resultVersion !== activePrior.version
    )
      throw new PortalError(
        409,
        "This save reference no longer matches the current assignment. Review it again."
      );
    return {
      id: receipt.assignmentId,
      version: receipt.resultVersion,
      changed: false
    };
  }
  expected(input.expectedVersion, structureVersion);
  expected(input.assignmentVersion, prior?.version ?? 0);
  if (
    !activePrior &&
    (await tx.churchPositionAssignment.count({
      where: { positionId, revokedAt: null }
    })) >= 10
  )
    throw new PortalError(
      409,
      "A position can have up to ten active assignments. Create another position if needed."
    );
  const assignment = prior
    ? await tx.churchPositionAssignment.update({
        where: { id: prior.id },
        data: {
          revokedAt: null,
          version: { increment: 1 },
          ...(!activePrior ? { createdAt: new Date() } : {})
        }
      })
    : await tx.churchPositionAssignment.create({
        data: { churchId, positionId, connectionId: target.id }
      });
  await tx.churchRoleGrant.updateMany({
    where: {
      assignmentId: assignment.id,
      revokedAt: null,
      capability: { notIn: capabilities }
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  for (const capability of capabilities) {
    const old = activePrior?.roleGrants.find(
      (g) => g.capability === capability
    );
    if (old) continue;
    await tx.churchRoleGrant.upsert({
      where: {
        assignmentId_capability: { assignmentId: assignment.id, capability }
      },
      create: {
        assignmentId: assignment.id,
        churchId,
        connectionId: target.id,
        capability,
        grantedById: actor.id
      },
      update: {
        revokedAt: null,
        createdAt: new Date(),
        grantedById: actor.id,
        version: { increment: 1 }
      }
    });
  }
  await tx.churchAssignmentSave.create({
    data: {
      requestKey: key,
      assignmentId: assignment.id,
      churchId,
      connectionId: target.id,
      actorId: actor.id,
      inputHash,
      resultVersion: assignment.version
    }
  });
  return { id: assignment.id, version: assignment.version, changed: true };
}
