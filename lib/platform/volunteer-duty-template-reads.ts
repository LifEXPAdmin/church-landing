import type { PrismaClient } from "@prisma/client";
import type { ReadIdentity } from "./account-read";
import { withPostRead, type PostContext, type PostTx } from "./post-access";
import { postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { participationPost } from "./post-participation";
import { requireOpportunityCoordinator } from "./volunteer-policy";
import { dutyTemplateVersion } from "./volunteer-duty-template-input";
import {
  requireDutyTemplateCoordinator,
  unavailableDutyTemplate
} from "./volunteer-duty-template-commands";

const PAGE = 20;
async function template(
  tx: PostTx,
  context: PostContext,
  id: unknown,
  churchId?: string
) {
  const row = await tx.volunteerDutyTemplate.findUnique({
    where: { id: postId(id) }
  });
  if (
    !row?.churchId ||
    row.removedAt ||
    row.recoveryRequired ||
    (churchId && row.churchId !== churchId)
  )
    throw unavailableDutyTemplate();
  requireDutyTemplateCoordinator(context, row.churchId);
  return row;
}
function detail(row: Awaited<ReturnType<typeof template>>) {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    duties: row.duties,
    requirements: row.requirements,
    commitment: row.commitment
  };
}
export function volunteerDutyTemplateWorkspace(
  db: PrismaClient,
  token: unknown,
  identity?: ReadIdentity
) {
  return withPostRead(
    db,
    token,
    async (tx, context) => {
      if (!context.actorId)
        throw new PortalError(
          401,
          "Sign in to manage volunteer duty templates."
        );
      const churches = await tx.church.findMany({
        where: { id: { in: [...context.volunteers] } },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: 200
      });
      return { ownerId: context.actorId, churches };
    },
    identity
  );
}
export function volunteerDutyTemplateList(
  db: PrismaClient,
  token: unknown,
  input: { churchId: unknown; page?: unknown },
  identity?: ReadIdentity
) {
  const churchId = postId(input.churchId),
    page = dutyTemplateVersion(input.page ?? 0);
  if (page > 999)
    throw new PortalError(400, "Choose a supported duty template page.");
  return withPostRead(
    db,
    token,
    async (tx, context) => {
      requireDutyTemplateCoordinator(context, churchId);
      const where = { churchId, removedAt: null, recoveryRequired: false };
      const total = await tx.volunteerDutyTemplate.count({ where });
      const rows = await tx.volunteerDutyTemplate.findMany({
        where,
        orderBy: [{ title: "asc" }, { id: "asc" }],
        skip: page * PAGE,
        take: PAGE,
        select: { id: true, version: true, title: true, updatedAt: true }
      });
      return {
        ownerId: context.actorId!,
        churchId,
        page,
        total,
        templates: rows.map((row) => ({
          ...row,
          updatedAt: row.updatedAt.toISOString()
        }))
      };
    },
    identity
  );
}
export function volunteerDutyTemplateDetail(
  db: PrismaClient,
  token: unknown,
  input: { churchId: unknown; id: unknown },
  identity?: ReadIdentity
) {
  const churchId = postId(input.churchId);
  return withPostRead(
    db,
    token,
    async (tx, context) => {
      requireDutyTemplateCoordinator(context, churchId);
      const row = await template(tx, context, input.id, churchId);
      return {
        ownerId: context.actorId!,
        churchId,
        template: { ...detail(row), updatedAt: row.updatedAt.toISOString() }
      };
    },
    identity
  );
}
export function volunteerDutyTemplateApply(
  db: PrismaClient,
  token: unknown,
  input: {
    id: unknown;
    postId: unknown;
    expectedVersion: unknown;
    postVersion: unknown;
  },
  identity?: ReadIdentity
) {
  dutyTemplateVersion(input.expectedVersion, 1);
  dutyTemplateVersion(input.postVersion, 1);
  return withPostRead(
    db,
    token,
    async (tx, context) => {
      const post = await participationPost(tx, context, input.postId);
      requireOpportunityCoordinator(context, post, true);
      const row = await template(tx, context, input.id, post.authorChurchId!);
      expected(input.postVersion, post.version);
      expected(input.expectedVersion, row.version);
      // Projection only. The ordinary opportunity form owns explicit save,
      // scheduling, capacity and all later application/assignment behavior.
      return {
        ownerId: context.actorId!,
        postId: post.id,
        postVersion: post.version,
        template: detail(row)
      };
    },
    identity
  );
}
