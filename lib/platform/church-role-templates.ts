import type { Prisma } from "@prisma/client";
import { expected, PortalError } from "./portal-policy";
import {
  rolePresets,
  roleRecommendationChoices,
  starterRoles,
  type ChurchRoleSummary,
  type RolePresetKey
} from "./church-role-library";
import type { StructureCapability } from "./church-structure-types";

type Tx = Prisma.TransactionClient;
export const MAX_ROLE_TEMPLATES = 200;
function text(value: unknown, max: number, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ||
    (required && !value.trim())
  )
    throw new PortalError(400, "Check the title fields and their length.");
  return value.trim();
}
function id(value: unknown) {
  const result = text(value, 100, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(result))
    throw new PortalError(400, "Check the role title link.");
  return result;
}
function content(input: Record<string, unknown>) {
  const name = text(input.name, 100, true)
    .normalize("NFKC")
    .replace(/\s+/g, " ");
  if (name.length > 100)
    throw new PortalError(
      400,
      "Use no more than 100 characters for the title."
    );
  const presetKey = input.presetKey ?? "G";
  if (typeof presetKey !== "string" || !Object.hasOwn(rolePresets, presetKey))
    throw new PortalError(400, "Choose a supported recommendation preset.");
  const preset = rolePresets[presetKey as RolePresetKey];
  if (
    input.presetVersion !== undefined &&
    input.presetVersion !== preset.version
  )
    throw new PortalError(
      409,
      "This preset changed. Review its current recommendations."
    );
  const values = input.recommendations ?? preset.recommendations;
  if (
    !Array.isArray(values) ||
    values.length > roleRecommendationChoices.length ||
    new Set(values).size !== values.length ||
    values.some((value) => !roleRecommendationChoices.includes(value))
  )
    throw new PortalError(
      400,
      "Choose supported recommendations. Reviewed church ownership and unavailable tools cannot be added here."
    );
  return {
    name,
    description: text(input.description ?? "", 500),
    responsibilities: text(input.responsibilities ?? "", 3000),
    presetKey,
    presetVersion: preset.version,
    recommendations: [...values].sort() as StructureCapability[]
  };
}

// Invoked only inside the structure transaction after current membership and
// MANAGE_STRUCTURE checks. No assignment or capability-grant table is written.
export async function roleTemplateCommand(
  tx: Tx,
  churchId: string,
  input: Record<string, unknown>
) {
  const operation = input.operation;
  const creating = operation === "template-create";
  if (creating) {
    const requestKey = id(input.requestKey);
    const prior = await tx.churchRoleTemplate.findUnique({
      where: { churchId_requestKey: { churchId, requestKey } }
    });
    if (prior)
      return {
        id: prior.id,
        changed: false,
        message:
          "This title was already saved. Review the church library before creating another."
      };
  }
  const existing = creating
    ? null
    : await tx.churchRoleTemplate.findFirst({
        where: { id: id(input.templateId), churchId, archivedAt: null }
      });
  if (!creating && !existing)
    throw new PortalError(404, "Active church title not found.");
  if (existing) expected(input.templateVersion, existing.version);
  if (operation === "template-archive") {
    if (input.confirmed !== true)
      throw new PortalError(
        400,
        "Confirm that this title should leave the library."
      );
    await tx.churchRoleTemplate.update({
      where: { id: existing!.id },
      data: { archivedAt: new Date(), version: { increment: 1 } }
    });
    return {
      id: existing!.id,
      changed: true,
      message:
        "Title archived. Existing positions, responsibilities, assignments and permissions are unchanged."
    };
  }
  const data = content(input);
  const normalizedName = data.name.toLowerCase();
  if (
    await tx.churchRoleTemplate.findFirst({
      where: {
        churchId,
        normalizedName,
        archivedAt: null,
        ...(existing ? { id: { not: existing.id } } : {})
      }
    })
  )
    throw new PortalError(
      409,
      "An active church title already uses that name. Edit that title or choose a different name."
    );
  if (
    creating &&
    (await tx.churchRoleTemplate.count({
      where: { churchId, archivedAt: null }
    })) >= MAX_ROLE_TEMPLATES
  )
    throw new PortalError(
      409,
      "This church has 200 active titles. Archive an unused title first."
    );
  const priorRevision = existing
    ? await tx.churchRoleRevision.findUniqueOrThrow({
        where: {
          templateId_churchId_version: {
            templateId: existing.id,
            churchId,
            version: existing.version
          }
        }
      })
    : null;
  const starterId = existing
    ? priorRevision!.starterId
    : input.starterId
      ? id(input.starterId)
      : null;
  if (starterId && !starterRoles.some((role) => role.id === starterId))
    throw new PortalError(400, "Choose an available starter title.");
  const version = (existing?.version ?? 0) + 1;
  const row = existing
    ? await tx.churchRoleTemplate.update({
        where: { id: existing.id },
        data: { normalizedName, version }
      })
    : await tx.churchRoleTemplate.create({
        data: { churchId, normalizedName, requestKey: id(input.requestKey) }
      });
  await tx.churchRoleRevision.create({
    data: { templateId: row.id, churchId, version, starterId, ...data }
  });
  return {
    id: row.id,
    changed: true,
    message:
      "Title and recommendations saved for future use. Existing positions and permissions are unchanged."
  };
}
export async function readRoleTemplates(
  tx: Tx,
  churchId: string
): Promise<ChurchRoleSummary[]> {
  const rows = await tx.churchRoleTemplate.findMany({
    where: { churchId, archivedAt: null },
    orderBy: [{ normalizedName: "asc" }, { id: "asc" }],
    take: MAX_ROLE_TEMPLATES + 1,
    select: {
      id: true,
      version: true,
      revisions: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          name: true,
          description: true,
          responsibilities: true,
          starterId: true,
          presetKey: true,
          presetVersion: true,
          recommendations: true
        }
      }
    }
  });
  if (rows.length > MAX_ROLE_TEMPLATES)
    throw new PortalError(
      503,
      "This role library needs an administrator to review its size."
    );
  return rows.map(({ id, version, revisions }) => ({
    id,
    version,
    ...revisions[0],
    presetKey: revisions[0].presetKey as RolePresetKey
  }));
}
export async function positionRoleRevision(
  tx: Tx,
  churchId: string,
  templateId: unknown,
  version: unknown
) {
  const row = await tx.churchRoleTemplate.findFirst({
    where: { id: id(templateId), churchId, archivedAt: null }
  });
  if (!row)
    throw new PortalError(
      404,
      "Active church title not found. Choose a current title."
    );
  expected(version, row.version);
  return tx.churchRoleRevision.findUniqueOrThrow({
    where: {
      templateId_churchId_version: {
        templateId: row.id,
        churchId,
        version: row.version
      }
    }
  });
}
