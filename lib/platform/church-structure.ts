import {
  saveAssignmentPrivileges,
  delegableChurchCapabilities
} from "./church-assignment-permissions";
import {
  endRoleContributions,
  effectiveChurchGrants
} from "./church-permissions";
import {
  roleTemplateCommand,
  readRoleTemplates,
  positionRoleRevision
} from "./church-role-templates";
import { type Prisma, type PrismaClient } from "@prisma/client";
import {
  churchSelect,
  eligibility,
  eligibleWhere,
  expected,
  churchCapability,
  membership,
  portal,
  PortalError
} from "./portal";
import {
  structureCapabilities,
  type StructureCapability,
  type StructureSnapshot,
  type StructureView
} from "./church-structure-types";
import { rolePresets, type RolePresetKey } from "./church-role-library";

type Tx = Prisma.TransactionClient;
const MAX_POSITIONS = 200;
const MAX_DEPTH = 12;
const preferenceSelect = { listed: true, displayName: true } as const;
const activeMember = { state: "APPROVED" as const, user: eligibleWhere };
function field(value: unknown, max = 100, optional = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!optional && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new PortalError(400, "Check the required fields and their length.");
  return value.trim();
}
function identifier(value: unknown) {
  const result = field(value);
  if (!/^[a-zA-Z0-9_-]+$/.test(result))
    throw new PortalError(400, "Check the church or position link.");
  return result;
}
function capability(value: unknown): StructureCapability {
  if (typeof value !== "string" || !Object.hasOwn(structureCapabilities, value))
    throw new PortalError(400, "Choose an available church permission.");
  return value as StructureCapability;
}
async function audit(
  tx: Tx,
  actorId: string,
  churchId: string,
  targetId: string,
  action: string,
  version: number
) {
  await tx.churchAuditEvent.create({
    data: { actorId, churchId, targetId, action, version }
  });
}
async function advance(tx: Tx, churchId: string) {
  await tx.church.update({
    where: { id: churchId },
    data: { structureVersion: { increment: 1 } }
  });
}
async function position(tx: Tx, churchId: string, value: unknown) {
  const row = await tx.churchPosition.findFirst({
    where: { id: identifier(value), churchId, archivedAt: null }
  });
  if (!row) throw new PortalError(404, "Position not found.");
  return row;
}
async function targetConnection(tx: Tx, churchId: string, value: unknown) {
  const row = await tx.churchConnection.findFirst({
    where: { id: identifier(value), churchId, ...activeMember },
    select: { id: true, userId: true }
  });
  if (!row)
    throw new PortalError(
      404,
      "An eligible approved member was not found for that church assignment code."
    );
  return row;
}
function validateTree(rows: { id: string; parentId: string | null }[]) {
  const parents = new Map(rows.map((p) => [p.id, p.parentId]));
  for (const row of rows) {
    const visited = new Set<string>();
    let current: string | null = row.id;
    while (current) {
      if (visited.has(current))
        throw new PortalError(
          400,
          "A position cannot report to itself or one of its descendants."
        );
      visited.add(current);
      if (visited.size > MAX_DEPTH)
        throw new PortalError(
          400,
          `Use no more than ${MAX_DEPTH} levels of reporting positions.`
        );
      if (!parents.has(current))
        throw new PortalError(
          400,
          "Choose an active parent position in this church."
        );
      current = parents.get(current) ?? null;
    }
  }
}

export async function churchStructureCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  return portal(db, token, async (tx, actor) => {
    eligibility(actor);
    const churchId = identifier(input.churchId);
    const own = await membership(tx, actor, churchId);
    const church = await tx.church.findUniqueOrThrow({
      where: { id: churchId },
      select: { structureVersion: true }
    });
    const op = input.operation;
    if (
      ![
        "create",
        "edit",
        "archive",
        "assign",
        "assignment-privileges",
        "unassign",
        "step-down",
        "template-create",
        "template-edit",
        "template-archive",
        "grant",
        "revoke"
      ].includes(String(op))
    )
      throw new PortalError(400, "Choose an available church action.");
    if (op === "grant" || op === "revoke") {
      await churchCapability(tx, actor, churchId, "MANAGE_CHURCH_ACCESS");
      expected(input.expectedVersion, church.structureVersion);
      if (op === "grant") {
        const scope = capability(input.capability);
        if (scope === "MANAGE_CHURCH_PROFILE")
          throw new PortalError(
            400,
            "Public-profile management uses the reviewed representative setup journey."
          );
        if (!delegableChurchCapabilities.includes(scope))
          throw new PortalError(
            400,
            "This permission is not available for church delegation."
          );
        await churchCapability(tx, actor, churchId, scope);
        const target = await targetConnection(
          tx,
          churchId,
          input.listedConnection && input.connectionId
            ? (() => {
                throw new PortalError(
                  400,
                  "Choose a listed member or enter a church assignment code, not both."
                );
              })()
            : input.listedConnection || input.connectionId
        );
        if (target.userId === actor.id)
          throw new PortalError(
            403,
            "You cannot grant yourself church permissions."
          );
        const prior = await tx.churchCapabilityGrant.findUnique({
          where: {
            userId_churchId_capability: {
              userId: target.userId,
              churchId,
              capability: scope
            }
          }
        });
        // A fresh grant is explicit. Existing effective grants are never silently
        // reattributed away from their claim; the owner must end them first.
        if (prior && !prior.revokedAt)
          throw new PortalError(
            409,
            "This member already has that permission. Review their current access first."
          );
        const data = {
          userId: target.userId,
          churchId,
          capability: scope,
          dependencyConnectionId: target.id,
          sourceClaimId: null,
          revokedAt: null
        };
        const grant = prior
          ? await tx.churchCapabilityGrant.update({
              where: { id: prior.id },
              data: { ...data, version: { increment: 1 } }
            })
          : await tx.churchCapabilityGrant.create({ data });
        await advance(tx, churchId);
        await audit(
          tx,
          actor.id,
          churchId,
          grant.id,
          "DELEGATE_CHURCH_CAPABILITY",
          church.structureVersion + 1
        );
        return {
          message:
            "The selected church permission is assigned. Their position title is unchanged.",
          id: grant.id
        };
      }
      const grant = await tx.churchCapabilityGrant.findFirst({
        where: { id: identifier(input.id), churchId, revokedAt: null }
      });
      if (!grant)
        throw new PortalError(404, "Active church permission not found.");
      await churchCapability(tx, actor, churchId, grant.capability);
      expected(input.grantVersion, grant.version);
      if (input.confirmed !== true)
        throw new PortalError(400, "Confirm that this permission should end.");
      await tx.churchCapabilityGrant.update({
        where: { id: grant.id },
        data: { revokedAt: new Date(), version: { increment: 1 } }
      });
      await advance(tx, churchId);
      await audit(
        tx,
        actor.id,
        churchId,
        grant.id,
        "END_DELEGATED_CHURCH_CAPABILITY",
        church.structureVersion + 1
      );
      return {
        message:
          "That independent grant has ended. Permissions from other roles may remain; position assignments are unchanged.",
        id: grant.id
      };
    }
    if (op !== "step-down")
      await churchCapability(tx, actor, churchId, "MANAGE_STRUCTURE");
    if (String(op).startsWith("template-")) {
      // Idempotent title creation still rechecks current authority first.
      if (
        op !== "template-create" ||
        !(await tx.churchRoleTemplate.findUnique({
          where: {
            churchId_requestKey: {
              churchId,
              requestKey: identifier(input.requestKey)
            }
          }
        }))
      )
        expected(input.expectedVersion, church.structureVersion);
      const result = await roleTemplateCommand(tx, churchId, input);
      if (result.changed) {
        await advance(tx, churchId);
        await audit(
          tx,
          actor.id,
          churchId,
          result.id,
          String(op).toUpperCase().replaceAll("-", "_"),
          church.structureVersion + 1
        );
      }
      return { id: result.id, message: result.message };
    }
    if (op === "create") {
      const requestKey = identifier(input.requestKey);
      const prior = await tx.churchPosition.findUnique({
        where: { churchId_requestKey: { churchId, requestKey } }
      });
      if (prior)
        return {
          message:
            "This position was already saved. Review its current details.",
          id: prior.id
        };
      expected(input.expectedVersion, church.structureVersion);
      const rows = await tx.churchPosition.findMany({
        where: { churchId, archivedAt: null },
        select: { id: true, parentId: true }
      });
      if (rows.length >= MAX_POSITIONS)
        throw new PortalError(
          409,
          `This church has reached ${MAX_POSITIONS} active positions. Archive an unused position first.`
        );
      const parentId = input.parentId ? identifier(input.parentId) : null;
      validateTree([...rows, { id: "new-position", parentId }]);
      const role = input.roleTemplateId
        ? await positionRoleRevision(
            tx,
            churchId,
            input.roleTemplateId,
            input.roleTemplateVersion
          )
        : null;
      if (
        !role &&
        input.roleTemplateVersion !== undefined &&
        input.roleTemplateVersion !== null
      )
        throw new PortalError(400, "Choose a title with its current version.");
      const row = await tx.churchPosition.create({
        data: {
          churchId,
          parentId,
          name: field(input.name ?? role?.name),
          description: field(
            input.description ?? role?.responsibilities ?? "",
            3000,
            true
          ),
          ...(role
            ? {
                roleTemplateId: role.templateId,
                roleTemplateVersion: role.version
              }
            : {}),
          requestKey
        }
      });
      await advance(tx, churchId);
      await audit(
        tx,
        actor.id,
        churchId,
        row.id,
        "CREATE_POSITION",
        church.structureVersion + 1
      );
      return {
        message: "Position saved. No software permission was granted.",
        id: row.id
      };
    }
    if (op === "assignment-privileges") {
      const row = await position(tx, churchId, input.positionId);
      if (input.listedConnection && input.connectionId)
        throw new PortalError(
          400,
          "Choose a listed member or use an assignment code, not both."
        );
      const target = await targetConnection(
        tx,
        churchId,
        input.listedConnection || input.connectionId
      );
      const result = await saveAssignmentPrivileges(
        tx,
        actor,
        churchId,
        church.structureVersion,
        row.id,
        target,
        input
      );
      if (result.changed) {
        await advance(tx, churchId);
        await audit(
          tx,
          actor.id,
          churchId,
          result.id,
          "SAVE_ASSIGNMENT_PRIVILEGES",
          church.structureVersion + 1
        );
      }
      return {
        id: result.id,
        version: result.version,
        message:
          "Assignment and reviewed privileges saved. Other grant sources are unchanged."
      };
    }
    expected(input.expectedVersion, church.structureVersion);
    const row = await position(tx, churchId, input.positionId);
    if (op === "edit") {
      const parentId = input.parentId ? identifier(input.parentId) : null;
      const rows = await tx.churchPosition.findMany({
        where: { churchId, archivedAt: null },
        select: { id: true, parentId: true }
      });
      validateTree(rows.map((p) => (p.id === row.id ? { ...p, parentId } : p)));
      await tx.churchPosition.update({
        where: { id: row.id },
        data: {
          name: field(input.name),
          description: field(input.description ?? "", 3000, true),
          parentId
        }
      });
    } else if (op === "archive") {
      if (input.confirmed !== true)
        throw new PortalError(
          400,
          "Confirm that this position and its assignments should end."
        );
      if (
        await tx.churchPosition.count({
          where: { parentId: row.id, churchId, archivedAt: null }
        })
      )
        throw new PortalError(
          409,
          "Move or archive the positions that report here before archiving this position."
        );
      await endRoleContributions(tx, { positionId: row.id });
      await tx.churchPositionAssignment.updateMany({
        where: { positionId: row.id, revokedAt: null },
        data: { revokedAt: new Date(), version: { increment: 1 } }
      });
      await tx.churchPosition.update({
        where: { id: row.id },
        data: { archivedAt: new Date() }
      });
    } else if (op === "assign") {
      if (input.privilegesReviewed !== true || input.confirmed !== true)
        throw new PortalError(
          400,
          "Open the current assignment form, review Privileges and confirm before assigning a member."
        );
      if (
        input.capabilities !== undefined ||
        input.presetKey !== undefined ||
        input.recommendations !== undefined
      )
        throw new PortalError(
          400,
          "Use the reviewed privileges action to change permissions."
        );
      const target = await targetConnection(
        tx,
        churchId,
        input.listedConnection && input.connectionId
          ? (() => {
              throw new PortalError(
                400,
                "Choose a listed member or enter a church assignment code, not both."
              );
            })()
          : input.listedConnection || input.connectionId
      );
      const prior = await tx.churchPositionAssignment.findUnique({
        where: {
          positionId_connectionId: {
            positionId: row.id,
            connectionId: target.id
          }
        }
      });
      if (prior && !prior.revokedAt)
        throw new PortalError(
          409,
          "That member is already assigned to this position."
        );
      if (
        (await tx.churchPositionAssignment.count({
          where: { positionId: row.id, revokedAt: null }
        })) >= 10
      )
        throw new PortalError(
          409,
          "A position can have up to ten active assignments. Create another position if needed."
        );
      if (prior)
        await tx.churchPositionAssignment.update({
          where: { id: prior.id },
          data: {
            revokedAt: null,
            createdAt: new Date(),
            version: { increment: 1 }
          }
        });
      else
        await tx.churchPositionAssignment.create({
          data: { churchId, positionId: row.id, connectionId: target.id }
        });
    } else {
      const assignment = await tx.churchPositionAssignment.findFirst({
        where: {
          id: identifier(input.id),
          positionId: row.id,
          churchId,
          revokedAt: null
        }
      });
      if (!assignment)
        throw new PortalError(404, "Active position assignment not found.");
      if (op === "step-down" && assignment.connectionId !== own.id)
        throw new PortalError(
          403,
          "You can step down only from your own position."
        );
      if (input.confirmed !== true)
        throw new PortalError(
          400,
          "Confirm that this position assignment should end."
        );
      await endRoleContributions(tx, { id: assignment.id });
      await tx.churchPositionAssignment.update({
        where: { id: assignment.id },
        data: { revokedAt: new Date(), version: { increment: 1 } }
      });
    }
    await advance(tx, churchId);
    await audit(
      tx,
      actor.id,
      churchId,
      row.id,
      `POSITION_${String(op).toUpperCase().replaceAll("-", "_")}`,
      church.structureVersion + 1
    );
    return {
      message:
        op === "archive"
          ? "Position archived. Its assignments and their permission contributions ended. Independent grants are unchanged."
          : ["unassign", "step-down"].includes(String(op))
            ? "Assignment ended with its permission contributions. Other roles, independent grants and directory sharing are unchanged."
            : "Church structure saved. Software permissions and directory sharing are unchanged.",
      id: row.id
    };
  });
}

export async function getChurchStructure(
  db: PrismaClient,
  token: unknown,
  options: {
    churchId: string;
    view?: StructureView;
    positionId?: string;
    connectionId?: string;
    assignmentId?: string;
    query?: string;
    cursor?: string;
    candidateCursor?: string;
  }
) {
  return portal(db, token, async (tx, actor) => {
    eligibility(actor);
    const churchId = identifier(options.churchId);
    const own = await membership(tx, actor, churchId);
    const church = await tx.church.findUniqueOrThrow({
      where: { id: churchId },
      select: { ...churchSelect, structureVersion: true }
    });
    const capabilities: StructureCapability[] = [
      ...new Set(
        (await effectiveChurchGrants(tx, actor.id, [churchId])).map(
          (g) => g.capability
        )
      )
    ];
    if (
      options.view === "access" &&
      !capabilities.includes("MANAGE_CHURCH_ACCESS")
    )
      throw new PortalError(
        403,
        "Church access management is not available to this account."
      );
    if (
      ["roles", "assign", "privileges"].includes(options.view ?? "") &&
      !capabilities.includes("MANAGE_STRUCTURE")
    )
      throw new PortalError(
        403,
        "Role title management is not available to this account."
      );
    const rows = await tx.churchPosition.findMany({
      where: { churchId, archivedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: MAX_POSITIONS + 1,
      select: {
        id: true,
        name: true,
        description: true,
        parentId: true,
        roleTemplateId: true,
        roleTemplateVersion: true,
        assignments: {
          where: { revokedAt: null, connection: activeMember },
          orderBy: { id: "asc" },
          select: {
            id: true,
            connectionId: true,
            connection: { select: { preference: { select: preferenceSelect } } }
          }
        }
      }
    });
    if (rows.length > MAX_POSITIONS)
      throw new PortalError(
        503,
        "This church structure needs an administrator to review its size."
      );
    validateTree(rows);
    if (
      options.positionId &&
      !rows.some((p) => p.id === identifier(options.positionId))
    )
      throw new PortalError(404, "Position not found.");
    const { structureVersion, ...publicChurch } = church;
    const snapshot: StructureSnapshot = {
      viewer: { id: actor.id, name: actor.name, username: actor.username },
      church: publicChurch,
      version: structureVersion,
      ownConnectionId: own.id,
      capabilities,
      positions: rows.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        parentId: p.parentId,
        roleTemplateId: p.roleTemplateId,
        roleTemplateVersion: p.roleTemplateVersion,
        assignments: p.assignments.map((a) => ({
          id: a.id,
          isSelf: a.connectionId === own.id,
          ...(a.connection.preference?.listed
            ? {
                name: a.connection.preference.displayName,
                connectionId: a.connectionId
              }
            : {})
        }))
      }))
    };
    if (
      capabilities.includes("MANAGE_STRUCTURE") &&
      (options.view === "roles" ||
        !options.view ||
        options.view === "structure")
    )
      snapshot.roleTemplates = await readRoleTemplates(tx, churchId);
    if (options.view === "person") {
      const id = identifier(options.connectionId);
      const pref = await tx.churchDirectoryPreference.findFirst({
        where: {
          connectionId: id,
          listed: true,
          connection: { churchId, ...activeMember }
        },
        select: {
          displayName: true,
          contactEmail: true,
          phone: true,
          emailAudience: true,
          phoneAudience: true
        }
      });
      if (!pref)
        throw new PortalError(404, "This contact card is not available.");
      snapshot.person = {
        connectionId: id,
        name: pref.displayName,
        ...(pref.emailAudience === "SAME_CHURCH" && pref.contactEmail
          ? { email: pref.contactEmail }
          : {}),
        ...(pref.phoneAudience === "SAME_CHURCH" && pref.phone
          ? { phone: pref.phone }
          : {})
      };
    }
    if (
      (options.positionId && capabilities.includes("MANAGE_STRUCTURE")) ||
      options.view === "access" ||
      options.view === "assign"
    ) {
      const query = field(options.query ?? "", 100, true);
      const cursor = options.candidateCursor
        ? identifier(options.candidateCursor)
        : undefined;
      const candidates = await tx.churchConnection.findMany({
        where: {
          churchId,
          ...activeMember,
          preference: {
            listed: true,
            ...(query
              ? { displayName: { contains: query, mode: "insensitive" } }
              : {})
          },
          ...(cursor ? { id: { gt: cursor } } : {})
        },
        orderBy: { id: "asc" },
        take: 101,
        select: { id: true, preference: { select: { displayName: true } } }
      });
      snapshot.candidates = candidates
        .slice(0, 100)
        .map((c) => ({ id: c.id, name: c.preference!.displayName }));
      snapshot.candidatesCursor =
        candidates.length > 100 ? candidates[99].id : undefined;
    }
    if (options.view === "privileges") {
      const row = await position(tx, churchId, options.positionId);
      if (options.assignmentId && options.connectionId)
        throw new PortalError(
          400,
          "Choose an assignment or a member, not both."
        );
      const selectedAssignment = options.assignmentId
        ? await tx.churchPositionAssignment.findFirst({
            where: {
              id: identifier(options.assignmentId),
              churchId,
              positionId: row.id,
              revokedAt: null
            },
            select: { connectionId: true }
          })
        : null;
      if (options.assignmentId && !selectedAssignment)
        throw new PortalError(
          404,
          "That current assignment is no longer available."
        );
      const target = await targetConnection(
        tx,
        churchId,
        selectedAssignment?.connectionId ?? options.connectionId
      );
      const preference = await tx.churchDirectoryPreference.findUnique({
        where: { connectionId: target.id },
        select: preferenceSelect
      });
      const revision =
        row.roleTemplateId && row.roleTemplateVersion
          ? await tx.churchRoleRevision.findUnique({
              where: {
                templateId_churchId_version: {
                  templateId: row.roleTemplateId,
                  churchId,
                  version: row.roleTemplateVersion
                }
              },
              select: {
                presetKey: true,
                presetVersion: true,
                recommendations: true
              }
            })
          : null;
      const assignment = await tx.churchPositionAssignment.findUnique({
        where: {
          positionId_connectionId: {
            positionId: row.id,
            connectionId: target.id
          }
        },
        include: {
          roleGrants: {
            where: { revokedAt: null },
            select: { capability: true }
          }
        }
      });
      const grants = await effectiveChurchGrants(tx, target.userId, [churchId]);
      snapshot.privileges = {
        memberLabel: preference?.listed
          ? preference.displayName
          : "Member is unlisted",
        isSelf: target.userId === actor.id,
        recommendations: revision?.recommendations ?? [],
        presetKey:
          revision && Object.hasOwn(rolePresets, revision.presetKey)
            ? (revision.presetKey as RolePresetKey)
            : "G",
        presetVersion: revision?.presetVersion ?? 1,
        positionId: row.id,
        connectionId: target.id,
        assignmentId: assignment?.id ?? null,
        assignmentVersion: assignment?.version ?? 0,
        assigned: !!assignment && !assignment.revokedAt,
        selected:
          assignment && !assignment.revokedAt
            ? assignment.roleGrants.map((g) => g.capability)
            : [],
        grantable:
          target.userId !== actor.id &&
          capabilities.includes("MANAGE_CHURCH_ACCESS")
            ? delegableChurchCapabilities.filter((c) =>
                capabilities.includes(c)
              )
            : [],
        effective: grants.map((g) => ({
          capability: g.capability,
          source: g.source,
          assignmentId: g.assignmentId,
          ...(g.assignmentId
            ? {
                positionName: rows.find((p) =>
                  p.assignments.some((a) => a.id === g.assignmentId)
                )?.name
              }
            : {})
        }))
      };
    }
    if (options.view === "access") {
      const cursor = options.cursor ? identifier(options.cursor) : undefined;
      const grants = await tx.churchCapabilityGrant.findMany({
        where: { churchId, ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: "asc" },
        take: 101,
        select: {
          id: true,
          userId: true,
          capability: true,
          version: true,
          revokedAt: true,
          user: {
            select: {
              connections: {
                where: { churchId, ...activeMember },
                take: 1,
                select: { id: true, preference: { select: preferenceSelect } }
              }
            }
          }
        }
      });
      snapshot.grants = grants.slice(0, 100).map((g) => {
        const c = g.user.connections[0];
        return {
          id: g.id,
          capability: g.capability as StructureCapability,
          version: g.version,
          revoked: !!g.revokedAt,
          isSelf: g.userId === actor.id,
          ...(c?.preference?.listed
            ? { name: c.preference.displayName, connectionId: c.id }
            : {})
        };
      });
      snapshot.grantsCursor = grants.length > 100 ? grants[99].id : undefined;
    }
    return snapshot;
  });
}
