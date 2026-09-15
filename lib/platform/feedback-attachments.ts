import type { PrismaClient } from "@prisma/client";
import { withAccountRead } from "./account-read";
import { withOwnedSession } from "./account-sessions";
import { PortalError, expected } from "./portal-policy";
import { postId } from "./post-input";
import { imageVariant } from "./media-processing";
import { imageStorage, type ImageStorage } from "./media-storage";
import { readCheckedImage } from "./media";
import {
  readableFeedbackImage,
  feedbackImageActor
} from "./feedback-image-access";
import { retireImage } from "./media-lifecycle";
import { recordSupportAttachmentPrivacyControl } from "./retention-controls";
import { protectAdminCaseChanges } from "./admin-privacy";

export function readFeedbackAttachment(
  db: PrismaClient,
  token: unknown,
  id: unknown,
  variantValue: unknown,
  store: ImageStorage = imageStorage(),
  signal = AbortSignal.timeout(15_000)
) {
  const assetId = postId(id),
    variant = imageVariant(variantValue);
  return readCheckedImage(
    () =>
      withAccountRead(db, token, async (tx, actorId) => {
        const asset = await tx.mediaAsset.findUnique({
          where: { id: assetId }
        });
        if (!asset) throw new PortalError(404, "Image unavailable.");
        await readableFeedbackImage(tx, actorId, asset);
        return asset;
      }),
    variant,
    store,
    signal
  );
}
export async function removeFeedbackUpload(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  if (
    Object.keys(input).some(
      (k) => !["operation", "assetId", "assetVersion"].includes(k)
    )
  )
    throw new PortalError(400, "Use the private attachment removal controls.");
  const id = postId(input.assetId);
  await withOwnedSession(
    db,
    token,
    async (tx, session) => {
      await feedbackImageActor(tx, session.userId);
      const asset = await tx.mediaAsset.findFirst({
        where: {
          id,
          feedbackOwnerId: session.userId,
          purpose: "SUPPORT_ATTACHMENT",
          feedbackCaseId: null
        }
      });
      if (!asset)
        throw new PortalError(404, "This unsent attachment is not available.");
      if (
        asset.status === "RETIRED" &&
        Number(input.assetVersion) + 1 === asset.version
      )
        return;
      expected(input.assetVersion, asset.version);
      await retireImage(tx, asset);
      await recordSupportAttachmentPrivacyControl(
        tx,
        id,
        id,
        session.userId,
        asset.version + 1
      );
    },
    true
  );
  await protectAdminCaseChanges(db, [id]);
  return { removed: true };
}
