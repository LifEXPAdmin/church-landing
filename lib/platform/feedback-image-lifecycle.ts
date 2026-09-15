import type { Prisma } from "@prisma/client";
import { PortalError } from "./portal-policy";
import {
  FEEDBACK_ATTACHMENT_LIMIT,
  FEEDBACK_UPLOAD_LIFETIME
} from "./feedback-image-access";
import { retireImage } from "./media-lifecycle";

export function feedbackAttachmentIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > FEEDBACK_ATTACHMENT_LIMIT ||
    new Set(value).size !== value.length ||
    value.some(
      (v) => typeof v !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(v)
    )
  )
    throw new PortalError(
      400,
      "Choose up to three distinct private feedback images."
    );
  return value;
}
export async function attachFeedbackImages(
  tx: Prisma.TransactionClient,
  ownerId: string,
  caseId: string,
  ids: string[]
) {
  if (!ids.length) return;
  const assets = await tx.mediaAsset.findMany({
    where: {
      id: { in: ids },
      purpose: "SUPPORT_ATTACHMENT",
      status: "READY",
      feedbackOwnerId: ownerId,
      uploaderId: ownerId,
      feedbackCaseId: null,
      createdAt: { gt: new Date(Date.now() - FEEDBACK_UPLOAD_LIFETIME) }
    }
  });
  if (assets.length !== ids.length)
    throw new PortalError(
      409,
      "An attachment expired, was removed or belongs to another receipt. Review the selected images before submitting again."
    );
  for (const [position, id] of ids.entries())
    await tx.mediaAsset.update({
      where: { id },
      data: { feedbackCaseId: caseId, position, version: { increment: 1 } }
    });
  await tx.mediaGarbage.deleteMany({
    where: { storagePrefix: { in: assets.map((a) => a.storagePrefix) } }
  });
}
export async function retireFeedbackImages(
  tx: Prisma.TransactionClient,
  where: Prisma.MediaAssetWhereInput
) {
  const assets = await tx.mediaAsset.findMany({
    where: {
      AND: [
        where,
        { purpose: "SUPPORT_ATTACHMENT", status: { not: "RETIRED" } }
      ]
    }
  });
  for (const asset of assets) await retireImage(tx, asset);
}
