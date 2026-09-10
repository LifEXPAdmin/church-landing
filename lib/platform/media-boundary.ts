import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { requestSessionToken, readBody } from "./account-boundary";
import { allowAccountAttempt } from "./account-limits";
import { AccountError, readAccountSession } from "./accounts";
import { PortalError } from "./portal";
import { listImages, readImage, removeImage, uploadImage } from "./media";
import { IMAGE_INPUT_BYTES } from "./media-processing";
import { boundedBytes, imageStorage, type ImageStorage } from "./media-storage";

export const imageHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie"
};
function failure(error: unknown) {
  const status =
    error instanceof PortalError
      ? error.status
      : error instanceof AccountError && error.code === "session"
        ? 401
        : 503;
  return Response.json(
    {
      message:
        error instanceof PortalError
          ? error.message
          : status === 401
            ? "Sign in to manage images."
            : "The image could not be loaded or saved. Your entries are still here; try again."
    },
    { status, headers: imageHeaders }
  );
}
export async function handleImageRequest(
  db: PrismaClient,
  request: Request,
  injectedStore?: ImageStorage
) {
  try {
    const token = requestSessionToken(request),
      url = new URL(request.url);
    if (request.method === "GET")
      return Response.json(
        {
          images: await listImages(
            db,
            token,
            url.searchParams.get("purpose"),
            url.searchParams.get("targetId")
          )
        },
        { headers: imageHeaders }
      );
    if (!["POST", "DELETE"].includes(request.method))
      throw new PortalError(405, "Use the image controls.");
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PortalError(
        403,
        "Open the image controls on this website and try again."
      );
    const actor = await readAccountSession(db, token);
    if (!actor) throw new PortalError(401, "Sign in to manage images.");
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    if (
      !(await allowAccountAttempt(
        db,
        config.rateSecret + ":images",
        request.method === "POST" ? "upload" : "remove",
        ip,
        actor.id
      ))
    )
      throw new PortalError(
        429,
        "Too many image changes. Wait 15 minutes and try again."
      );
    if (request.method === "DELETE") {
      let body: Record<string, unknown>;
      try {
        body = await readBody(request, 2048);
        if (
          Object.keys(body).some((k) => !["id", "expectedVersion"].includes(k))
        )
          throw new Error();
      } catch {
        throw new PortalError(
          400,
          "Check the image removal details and try again."
        );
      }
      return Response.json(
        await removeImage(db, token, body.id, body.expectedVersion),
        { headers: imageHeaders }
      );
    }
    const store = injectedStore ?? imageStorage();
    const raw = request.headers.get("x-image-details");
    let input: Record<string, unknown>;
    try {
      if (!raw || raw.length > 8192) throw new Error();
      input = JSON.parse(decodeURIComponent(raw));
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).some(
          (k) =>
            ![
              "purpose",
              "targetId",
              "requestKey",
              "replacesId",
              "caption",
              "alt",
              "crop"
            ].includes(k)
        )
      )
        throw new Error();
    } catch {
      throw new PortalError(400, "Check the image details and try again.");
    }
    const length = request.headers.get("content-length");
    if (
      length !== null &&
      (!/^\d+$/.test(length) || Number(length) > IMAGE_INPUT_BYTES)
    )
      throw new PortalError(413, "Choose an image no larger than 4 MiB.");
    if (!request.body) throw new PortalError(400, "Choose an image.");
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(45_000)
    ]);
    const bytes = await boundedBytes(request.body, IMAGE_INPUT_BYTES, signal);
    const result = await uploadImage(
      db,
      token,
      {
        purpose: input.purpose,
        targetId: input.targetId,
        requestKey: input.requestKey,
        replacesId: input.replacesId,
        caption: input.caption,
        alt: input.alt,
        crop: input.crop
      },
      bytes,
      store,
      signal
    );
    return Response.json(result, { headers: imageHeaders });
  } catch (error) {
    return failure(error);
  }
}
export async function handleImageDelivery(
  db: PrismaClient,
  request: Request,
  id: string,
  variant: string,
  injectedStore?: ImageStorage
) {
  try {
    const bytes = await readImage(
      db,
      requestSessionToken(request),
      id,
      variant,
      injectedStore,
      AbortSignal.any([request.signal, AbortSignal.timeout(15_000)])
    );
    // Never redirect to a storage URL or forward conditional/range/cache headers.
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...imageHeaders,
        "Content-Type": "image/webp",
        "Content-Length": String(bytes.length),
        "Content-Disposition": 'inline; filename="image.webp"'
      }
    });
  } catch (error) {
    return failure(error);
  }
}
