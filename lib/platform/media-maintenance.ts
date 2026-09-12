import { timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { collectImageGarbage } from "./media";
import { privateImageStorage, type ImageStorage } from "./media-storage";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff"
};

export async function handleImageMaintenance(
  db: PrismaClient,
  request: Request,
  storage: () => ImageStorage = privateImageStorage,
  signal = AbortSignal.timeout(40_000)
) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    secret.length < 32 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  if (request.method !== "GET")
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { ...headers, Allow: "GET" } }
    );
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
