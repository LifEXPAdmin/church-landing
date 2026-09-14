import type { PrismaClient } from "@prisma/client";
import { collectImageGarbage, inspectImageGarbage } from "./media";
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
  const mode = new URL(request.url).searchParams.get("mode");
  if (mode && mode !== "inspect")
    return Response.json(
      { error: "Choose inspection or the maintenance run." },
      { status: 400, headers }
    );
  try {
    if (mode === "inspect")
      return Response.json(
        { mode, ...(await inspectImageGarbage(db)), maximumPerRun: 100 },
        { headers }
      );
    const result = await collectImageGarbage(
      db,
      storage(),
      new Date(),
      signal,
      { maximum: 100, intervalMs: 350 }
    );
    const remaining = await inspectImageGarbage(db);
    const needsAttention = remaining.due > 0;
    // Aggregate receipts contain no owner, asset, prefix, token or provider data.
    const receipt = {
      ok: !needsAttention,
      ...result,
      remaining,
      needsAttention
    };
    console.info("image_cleanup_completed", receipt);
    return Response.json(receipt, {
      status: needsAttention ? 503 : 200,
      headers
    });
  } catch {
    console.error("image_cleanup_incomplete");
    return Response.json(
      { error: "Image cleanup did not complete. Pending work is retained." },
      { status: 503, headers }
    );
  }
}
