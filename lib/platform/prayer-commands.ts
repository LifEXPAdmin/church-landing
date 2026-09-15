import type { PrismaClient } from "@prisma/client";
import { requireUnrestrictedTopicPost } from "./topic-policy";
import { postContext, type PostContext } from "./post-access";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import { createCommentIn } from "./comment-commands";
import { PRAYER_GUIDE_VERSION, prayerUpdateKinds } from "./prayer-types";
import {
  prayerReference,
  prayerTargetIn,
  requirePrayerOwner,
  type PrayerTarget
} from "./prayer-policy";

const common = ["operation", "mutationId", "expectedVersion"];
const targetFields = ["postId", "commentId"];
const fields: Record<string, string[]> = {
  guide: [...common, "guideVersion"],
  acknowledge: [
    ...common,
    ...targetFields,
    "desired",
    "shareName",
    "guideVersion"
  ],
  followup: [...common, ...targetFields, "desired", "updates"],
  update: ["operation", "mutationId", ...targetFields, "kind", "content"]
};

export async function prayerCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const operation = typeof input.operation === "string" ? input.operation : "";
  if (!Object.hasOwn(fields, operation))
    throw new PortalError(400, "Choose a supported prayer action.");
  socialInput(input, fields[operation]);
  if (operation === "acknowledge" || operation === "followup") {
    if (typeof input.desired !== "boolean")
      throw new PortalError(400, "Choose the intended prayer state.");
    const extra = operation === "acknowledge" ? input.shareName : input.updates;
    if (typeof extra !== "boolean" || (!input.desired && extra))
      throw new PortalError(
        400,
        "Name sharing requires an acknowledgment; update subscriptions require a saved prayer."
      );
  }
  let context: PostContext | undefined;
  let target: PrayerTarget | undefined;
  const removingSave = operation === "followup" && input.desired === false;
  return socialCommand(
    db,
    token,
    "prayer",
    input,
    async (tx, ownerId) => {
      if (operation === "guide") {
        if (input.guideVersion !== PRAYER_GUIDE_VERSION)
          throw new PortalError(
            409,
            "Read the current prayer guide before accepting it."
          );
        const old = await tx.prayerGuideReceipt.findUnique({
          where: { ownerId }
        });
        expected(input.expectedVersion, old?.version ?? 0);
        const row = await tx.prayerGuideReceipt.upsert({
          where: { ownerId },
          create: { ownerId, guideVersion: PRAYER_GUIDE_VERSION },
          update: {
            guideVersion: PRAYER_GUIDE_VERSION,
            acceptedAt: new Date(),
            version: { increment: 1 }
          }
        });
        return {
          id: ownerId,
          version: row.version,
          message:
            "Prayer guide saved. Choose I prayed only after you have prayed."
        };
      }
      if (!context) throw new PortalError(401, "Check your current sign-in.");
      if (operation === "update") {
        if (!target?.canUpdate)
          throw new PortalError(
            403,
            "Only the current author or church publisher can add this prayer update while discussion is open."
          );
        if (!prayerUpdateKinds.some((kind) => kind === input.kind))
          throw new PortalError(400, "Choose an available prayer update kind.");
        const comment = await createCommentIn(tx, context, {
          postId: target.postId,
          replyToId: target.commentId,
          authorChurchId: target.authorChurchId,
          content: input.content
        });
        await tx.prayerUpdate.create({
          data: {
            commentId: comment.id,
            postId: target.postId,
            targetCommentId: target.commentId,
            targetKey: target.targetKey,
            kind: input.kind as string,
            createdAt: comment.createdAt
          }
        });
        if (
          await tx.prayerRecord.findFirst({
            where: {
              targetKey: target.targetKey,
              savedAt: { not: null },
              updatesSince: { lt: comment.createdAt },
              ownerId: { not: ownerId }
            },
            select: { id: true }
          })
        ) {
          await tx.commentFollowerJob.upsert({
            where: { commentId: comment.id },
            create: { commentId: comment.id, createdAt: comment.createdAt },
            update: {}
          });
        }
        return {
          id: comment.id,
          version: comment.version,
          message: "Your prayer update is published in the existing discussion."
        };
      }
      const reference = removingSave ? prayerReference(input) : target;
      if (!reference)
        throw new PortalError(404, "This prayer target is unavailable.");
      const where = {
        ownerId_targetKey: { ownerId, targetKey: reference.targetKey }
      };
      const old = await tx.prayerRecord.findUnique({ where });
      if (
        old &&
        (old.postId !== reference.postId ||
          old.commentId !== reference.commentId)
      )
        throw new PortalError(404, "This prayer target is unavailable.");
      expected(input.expectedVersion, old?.version ?? 0);
      if (
        operation === "acknowledge" &&
        input.desired &&
        !(old?.acknowledgedAt && input.shareName === false)
      ) {
        if (!target?.canAcknowledge)
          throw new PortalError(
            403,
            "Prayer acknowledgments are closed or limited to approved church members."
          );
        const guide = await tx.prayerGuideReceipt.findUnique({
          where: { ownerId }
        });
        if (
          input.guideVersion !== PRAYER_GUIDE_VERSION ||
          guide?.guideVersion !== PRAYER_GUIDE_VERSION
        )
          throw new PortalError(
            409,
            "Read and accept the current prayer guide before choosing I prayed."
          );
      }
      if (!old && input.desired === false)
        return {
          id: reference.postId,
          version: 0,
          message:
            operation === "acknowledge"
              ? "No acknowledgment is saved."
              : "No private prayer save remains."
        };
      const now = new Date();
      const data =
        operation === "acknowledge"
          ? {
              acknowledgedAt: input.desired
                ? (old?.acknowledgedAt ?? now)
                : null,
              shareName: input.shareName as boolean
            }
          : {
              savedAt: input.desired ? (old?.savedAt ?? now) : null,
              updatesSince:
                input.desired && input.updates
                  ? (old?.updatesSince ?? now)
                  : null
            };
      const row = await tx.prayerRecord.upsert({
        where,
        create: {
          ownerId,
          postId: reference.postId,
          commentId: reference.commentId,
          targetKey: reference.targetKey,
          ...data
        },
        update: { ...data, version: { increment: 1 } }
      });
      return {
        id: row.id,
        version: row.version,
        message:
          operation === "acknowledge"
            ? input.desired
              ? "Your I prayed acknowledgment is saved."
              : "Your prayer acknowledgment is removed."
            : input.desired
              ? "Your private prayer follow-up choices are saved."
              : "Removed from your private prayer list. Your acknowledgment is unchanged."
      };
    },
    async (tx, ownerId) => {
      await requirePrayerOwner(tx, ownerId);
      if (operation === "guide") return;
      context = await postContext(tx, ownerId);
      if (!removingSave) {
        target = await prayerTargetIn(tx, context, input);
        if (input.desired === true)
          await requireUnrestrictedTopicPost(tx, context, target.postId);
        if (operation === "update" && !target.canUpdate)
          throw new PortalError(
            403,
            "Current author or church-publisher permission is required for this update."
          );
      } else prayerReference(input);
    },
    operation === "update" || operation === "guide" ? "shared" : "exclusive"
  );
}
