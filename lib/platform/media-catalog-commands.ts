import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { socialCommand, socialInput, socialKey } from "./social-operations";
import { postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import {
  mediaContext,
  mediaManagementWhere,
  mediaCanPublish,
  mediaUnavailable,
  requireMediaActor
} from "./media-catalog-policy";
import {
  mediaFields,
  mediaAcknowledgment,
  mediaRights,
  requireMediaPublication
} from "./media-catalog-input";
import { catalogSource } from "./media-catalog-sources";
import { MEDIA_POLICY } from "./media-catalog-options";
import { recordDiscoveryControl } from "./retention-controls";
import type { PostTx } from "./post-access";
import { MEDIA_COMMAND_MAX_BYTES } from "./media-transcript";
const operations = [
  "create",
  "save",
  "publish",
  "unpublish",
  "withdraw-rights",
  "source-unavailable",
  "remove"
];
async function authorize(
  tx: PostTx,
  actorId: string,
  op: string,
  v: Record<string, unknown>
) {
  const c = await mediaContext(tx, actorId);
  requireMediaActor(c);
  if (op === "create") {
    const church = v.ownerChurchId === null ? null : postId(v.ownerChurchId);
    if (
      church &&
      !c.mediaEditors.includes(church) &&
      !c.mediaManagers.includes(church)
    )
      throw mediaUnavailable();
    if (church) await requirePrivilegedAuthentication(tx, actorId);
    return { c, row: null, church };
  }
  const where =
    op === "remove"
      ? {
          OR: [
            { ownerId: actorId, ownerChurchId: null },
            { ownerId: null, ownerChurchId: { in: c.mediaManagers } }
          ]
        }
      : mediaManagementWhere(c);
  const row = await tx.mediaCatalogItem.findFirst({
    where: { AND: [{ id: postId(v.itemId) }, where] }
  });
  if (!row) throw mediaUnavailable();
  if (row.ownerChurchId) await requirePrivilegedAuthentication(tx, actorId);
  if (op !== "save" && !mediaCanPublish(c, row)) throw mediaUnavailable();
  return { c, row, church: row.ownerChurchId };
}
export function mediaCatalogCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = String(input.operation);
  if (!operations.includes(op))
    throw new PortalError(400, "Choose a supported media action.");
  socialInput(input, [
    "operation",
    "mutationId",
    ...(op === "create" ? ["ownerChurchId"] : ["itemId", "expectedVersion"]),
    ...(["create", "save", "publish"].includes(op)
      ? ["fields", "acknowledgment", "rights"]
      : [])
  ]);
  if (Buffer.byteLength(JSON.stringify(input)) > MEDIA_COMMAND_MAX_BYTES)
    throw new PortalError(413, "These media entries are too large.");
  return socialCommand(
    db,
    token,
    "media-catalog",
    input,
    async (tx, actorId) => {
      const { c, row, church } = await authorize(tx, actorId, op, input);
      if (row) expected(input.expectedVersion, row.version);
      if (row?.removedAt) throw mediaUnavailable();
      await tx.$executeRaw`SELECT set_config('gc.media_transcript_writer', 'v1', true)`;
      const id = row?.id ?? randomUUID(),
        version = (row?.version ?? 0) + 1,
        now = new Date();
      let data: Prisma.MediaCatalogItemUpdateInput;
      if (["create", "save", "publish"].includes(op)) {
        const fields = mediaFields(input.fields);
        if (
          row &&
          (row.transcriptText ||
            (Array.isArray(row.chapters) && row.chapters.length)) &&
          !(
            input.fields &&
            typeof input.fields === "object" &&
            Object.hasOwn(input.fields, "transcriptText") &&
            Object.hasOwn(input.fields, "chapters")
          )
        )
          throw new PortalError(
            409,
            "This media has transcript or chapter text. Reload the current editor before saving so that text is preserved."
          );
        if (
          row &&
          Array.isArray(row.scriptureRanges) &&
          row.scriptureRanges.length &&
          !(
            input.fields &&
            typeof input.fields === "object" &&
            Object.hasOwn(input.fields, "scriptureRanges")
          )
        )
          throw new PortalError(
            409,
            "This media has Scripture tags. Reload the current editor before saving so those tags are preserved."
          );
        if (
          row &&
          row.format !== fields.format &&
          !(
            input.fields &&
            typeof input.fields === "object" &&
            Object.hasOwn(input.fields, "details")
          )
        )
          throw new PortalError(
            400,
            "Review and explicitly replace the format details when changing format."
          );
        if (!church && fields.audience === "CHURCH")
          throw new PortalError(
            400,
            "Personal media can use public or eligible-account audiences."
          );
        const acknowledgment = mediaAcknowledgment(
          input.acknowledgment,
          fields
        );
        const publish = op === "publish" || row?.state === "PUBLISHED";
        if (publish) {
          if (
            !mediaCanPublish(c, {
              ownerId: church ? null : actorId,
              ownerChurchId: church
            })
          )
            throw mediaUnavailable();
          requireMediaPublication(fields);
        }
        const rights =
          input.rights === undefined || input.rights === null
            ? null
            : mediaRights(input.rights, fields, now);
        if (publish && !rights)
          throw new PortalError(
            400,
            "Review current rights before publishing or changing a published item."
          );
        if (
          publish &&
          row?.moderationState !== undefined &&
          row.moderationState !== "VISIBLE"
        )
          throw mediaUnavailable();
        const { details, ...scalar } = fields;
        data = {
          ...scalar,
          details: details ?? Prisma.JsonNull,
          sourceProvider: catalogSource(fields.sourceUrl)?.provider ?? null,
          acknowledgment,
          sourceState: rights ? "ATTESTED" : "REVIEW_NEEDED",
          state: publish ? "PUBLISHED" : (row?.state ?? "DRAFT"),
          recoveryRequired: false,
          publishedAt: publish
            ? (row?.publishedAt ?? now)
            : (row?.publishedAt ?? null),
          version,
          controlVersion: { increment: 1 }
        };
        if (row) await tx.mediaCatalogItem.update({ where: { id }, data });
        else
          await tx.mediaCatalogItem.create({
            data: {
              id,
              ...scalar,
              details: details ?? Prisma.JsonNull,
              sourceProvider: catalogSource(fields.sourceUrl)?.provider ?? null,
              acknowledgment,
              sourceState: rights ? "ATTESTED" : "REVIEW_NEEDED",
              ownerId: church ? null : actorId,
              ownerChurchId: church,
              createdById: actorId
            }
          });
        if (rights)
          await tx.mediaCatalogRights.upsert({
            where: { itemId: id },
            create: { itemId: id, actorId, ...rights },
            update: { actorId, ...rights, revokedAt: null }
          });
        else await tx.mediaCatalogRights.deleteMany({ where: { itemId: id } });
      } else {
        data = {
          version,
          controlVersion: { increment: 1 },
          state: op === "remove" ? "REMOVED" : "UNPUBLISHED"
        };
        if (op === "withdraw-rights")
          await tx.mediaCatalogRights.updateMany({
            where: { itemId: id },
            data: {
              revokedAt: now,
              evidenceReference: "",
              license: "",
              consentReference: ""
            }
          });
        if (op === "source-unavailable" || op === "withdraw-rights")
          Object.assign(data, {
            sourceState:
              op === "source-unavailable" ? "UNAVAILABLE" : "REVIEW_NEEDED",
            sourceUrl: null,
            sourceProvider: null,
            acknowledgment: null
          });
        if (op === "remove") {
          Object.assign(data, {
            title: "",
            description: "",
            sourceUrl: null,
            sourceProvider: null,
            acknowledgment: null,
            sourceState: "REVIEW_NEEDED",
            speakers: [],
            churchCredit: "",
            series: "",
            sequence: null,
            topics: [],
            scriptureRanges: [],
            languageIds: [],
            details: Prisma.JsonNull,
            attribution: "",
            removedAt: now,
            recordedOn: null,
            durationSeconds: null,
            transcriptText: "",
            chapters: []
          });
          await tx.mediaCatalogRights.deleteMany({ where: { itemId: id } });
        }
        await tx.mediaCatalogItem.update({ where: { id }, data });
      }
      const current = await tx.mediaCatalogItem.findUniqueOrThrow({
        where: { id },
        select: { controlVersion: true }
      });
      await recordDiscoveryControl(
        tx,
        "MEDIA_CATALOG",
        actorId,
        id,
        current.controlVersion
      );
      await tx.mediaCatalogEvent.create({
        data: { itemId: id, actorId, action: op, version }
      });
      return {
        id,
        version,
        message:
          op === "publish"
            ? "Media published."
            : op === "remove"
              ? "Media removed."
              : "Media saved."
      };
    },
    async (tx, actorId) => {
      let { row } = await authorize(tx, actorId, op, input);
      const prior = await tx.socialOperation.findUnique({
        where: {
          ownerId_key: {
            ownerId: actorId,
            key: `media-catalog:${socialKey(input.mutationId)}`
          }
        },
        select: { result: true }
      });
      if (prior && !row && op === "create") {
        const receipt = prior.result as { id?: unknown };
        const c = await mediaContext(tx, actorId);
        row = await tx.mediaCatalogItem.findFirst({
          where: { AND: [{ id: postId(receipt.id) }, mediaManagementWhere(c)] }
        });
        if (!row) throw mediaUnavailable();
      }
      if (
        prior &&
        row &&
        ["create", "save", "publish"].includes(op) &&
        (row.recoveryRequired ||
          row.moderationState !== "VISIBLE" ||
          row.sourceState === "UNAVAILABLE")
      )
        throw mediaUnavailable();
      if (
        prior &&
        row &&
        (op === "publish" ||
          row.state === "PUBLISHED" ||
          row.sourceState === "ATTESTED")
      ) {
        const rights = await tx.mediaCatalogRights.findUnique({
          where: { itemId: row.id }
        });
        if (
          (op === "publish" && row.state !== "PUBLISHED") ||
          row.recoveryRequired ||
          row.moderationState !== "VISIBLE" ||
          row.sourceState !== "ATTESTED" ||
          !rights ||
          rights.revokedAt ||
          (rights.expiresAt && rights.expiresAt <= new Date()) ||
          rights.policy !== MEDIA_POLICY ||
          rights.fingerprint !== row.acknowledgment
        )
          throw mediaUnavailable();
      }
    }
  );
}
