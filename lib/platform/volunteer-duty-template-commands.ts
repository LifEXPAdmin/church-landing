import type { PrismaClient } from "@prisma/client";
import { postContext, type PostContext, type PostTx } from "./post-access";
import { postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import {
  dutyTemplateFields,
  dutyTemplateVersion
} from "./volunteer-duty-template-input";
import { recordDiscoveryControl } from "./retention-controls";

export function requireDutyTemplateCoordinator(
  context: PostContext,
  churchId: string
) {
  if (!context.actorId)
    throw new PortalError(401, "Sign in to manage volunteer duty templates.");
  if (!context.volunteers.has(churchId))
    throw new PortalError(
      404,
      "This church's duty templates are not available to your current sign-in."
    );
}
export function unavailableDutyTemplate() {
  return new PortalError(
    404,
    "This volunteer duty template is no longer available."
  );
}
async function authorized(
  tx: PostTx,
  ownerId: string,
  input: Record<string, unknown>
) {
  const churchId = postId(input.churchId);
  requireDutyTemplateCoordinator(await postContext(tx, ownerId), churchId);
  const row = await tx.volunteerDutyTemplate.findUnique({
    where: { id: postId(input.id) }
  });
  if (
    row &&
    (row.churchId !== churchId ||
      row.recoveryRequired ||
      (row.removedAt && input.operation !== "remove"))
  )
    throw unavailableDutyTemplate();
  const version = dutyTemplateVersion(input.expectedVersion);
  // A completed request remains retryable only while its resulting version is
  // current. Later edits or removal must not appear to have been undone.
  if (row && row.version !== version && row.version !== version + 1)
    throw new PortalError(
      409,
      "This duty template changed. Review its current version before continuing."
    );
  return { churchId, row };
}
export function volunteerDutyTemplateCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const operation = input?.operation;
  if (operation !== "save" && operation !== "remove")
    throw new PortalError(400, "Choose a supported duty template change.");
  socialInput(input, [
    "operation",
    "mutationId",
    "id",
    "churchId",
    "expectedVersion",
    ...(operation === "save"
      ? ["title", "duties", "requirements", "commitment"]
      : [])
  ]);
  dutyTemplateVersion(input.expectedVersion);
  const fields =
    operation === "save"
      ? dutyTemplateFields({
          title: input.title,
          duties: input.duties,
          requirements: input.requirements,
          commitment: input.commitment
        })
      : null;
  return socialCommand(
    db,
    token,
    "volunteer-duty-template",
    input,
    async (tx, ownerId) => {
      const { churchId, row } = await authorized(tx, ownerId, input);
      expected(input.expectedVersion, row?.version ?? 0);
      if (operation === "remove" && (!row || row.removedAt))
        throw unavailableDutyTemplate();
      if (
        !row &&
        operation === "save" &&
        (await tx.volunteerDutyTemplate.count({
          where: { churchId, removedAt: null, recoveryRequired: false }
        })) >= 200
      )
        throw new PortalError(
          409,
          "Keep up to 200 active duty templates for one church. Remove an unused template before adding another."
        );
      const version = (row?.version ?? 0) + 1;
      const saved =
        operation === "save"
          ? row
            ? await tx.volunteerDutyTemplate.update({
                where: { id: row.id },
                data: { ...fields!, version }
              })
            : await tx.volunteerDutyTemplate.create({
                data: { id: postId(input.id), churchId, ...fields!, version }
              })
          : await tx.volunteerDutyTemplate.update({
              where: { id: row!.id },
              data: {
                title: "",
                duties: "",
                requirements: "",
                commitment: "",
                removedAt: new Date(),
                version
              }
            });
      await recordDiscoveryControl(
        tx,
        "VOLUNTEER_DUTY_TEMPLATE",
        ownerId,
        saved.id,
        saved.version
      );
      return {
        id: saved.id,
        version: saved.version,
        message:
          operation === "save"
            ? "Duty template saved."
            : "Duty template removed. Existing opportunities are unchanged."
      };
    },
    async (tx, ownerId) => {
      await authorized(tx, ownerId, input);
    }
  );
}
