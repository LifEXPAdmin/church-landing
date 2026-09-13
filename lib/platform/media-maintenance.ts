import type { PrismaClient } from "@prisma/client";
import { collectImageGarbage } from "./media";
import { privateImageStorage, type ImageStorage } from "./media-storage";

import {
  maintenanceHeaders as headers,
  maintenanceRequestError
} from "./maintenance-request";

export async function handleImageMaintenance(
  db: PrismaClient,
  request: Request,
  storage: () => ImageStorage = privateImageStorage,
  signal = AbortSignal.timeout(40_000)
) {
  const rejected = maintenanceRequestError(request);
  if (rejected) return rejected;
  try {
    const result = await collectImageGarbage(db, storage(), new Date(), signal);
    // Aggregate receipts contain no owner, asset, prefix, token or provider data.
    console.info("image_cleanup_completed", result);
    return Response.json({ ok: true, ...result }, { headers });
  } catch {
    console.error("image_cleanup_incomplete");
    return Response.json(
      { error: "Image cleanup did not complete. Pending work is retained." },
      { status: 503, headers }
    );
  }
}
