import type { PrismaClient } from "@prisma/client";
import { withPostRead, postId } from "./post-access";
import {
  imageTarget,
  readableImageTarget,
  writableImageTarget
} from "./media-access";
import { listImagesIn } from "./media";
import { imagesAvailable } from "./media-storage";
import { PortalError } from "./portal";
export function readChurchImages(
  db: PrismaClient,
  token: unknown,
  id: unknown
) {
  return withPostRead(db, token, async (tx, context) => {
    const churchId = postId(id),
      target = imageTarget("CHURCH_LOGO", churchId);
    await readableImageTarget(tx, context, target);
    let canManage = false;
    if (context.actorId) {
      try {
        await writableImageTarget(tx, context, target);
        canManage = true;
      } catch (e) {
        if (!(e instanceof PortalError) || ![401, 403].includes(e.status))
          throw e;
      }
    }
    return {
      churchId,
      canManage,
      imagesAvailable: imagesAvailable(),
      logo:
        (await listImagesIn(tx, context, "CHURCH_LOGO", churchId))[0] ?? null,
      cover:
        (await listImagesIn(tx, context, "CHURCH_COVER", churchId))[0] ?? null
    };
  });
}
